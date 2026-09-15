/**
 * The sync layer of voice mode.
 *
 * Compiles one spoken answer into a timeline — a list of cues saying, for every
 * character position in the transcript, which card should be on screen and which
 * of its rows are being talked about. Playback then costs one binary search per
 * frame: no scoring while the voice runs, and no decisions taken twice.
 *
 * ── Why a timeline, and not a decision per sentence ────────────────────────
 *
 * The previous design judged each sentence on its own against fixed thresholds:
 * a card appeared only if some sentence scored highly enough for it, a row lit
 * only if a sentence said half of its name. Speech does not oblige. "The second
 * one's at four" names nothing; "that's you done by six" names nothing; and a
 * card whose every sentence fell a point short never appeared at all. Evidence
 * spread thinly across a passage was thrown away sentence by sentence.
 *
 * The signal that fixes it was there all along and went unused: ORDER. Tools run
 * in the order the model intends to narrate, and the rows of a card are listed in
 * the order they will be read out. So this does not ask "what is this sentence
 * about?" but "what is the best way to lay this whole answer over these cards,
 * in order?" — a monotonic alignment. Weak evidence lands in the right place
 * because its neighbours hold it there, and a sentence that names nothing simply
 * continues whatever it follows, which is what such a sentence means.
 *
 * Three properties fall out of that, all of which the previous design had to
 * chase with counters and hysteresis and never quite caught:
 *
 *   · nothing is missed  — leaving a card out is scored as a cost, so a card the
 *                          answer covers vaguely still gets its passage
 *   · nothing flickers   — the assignment is monotonic, so cards and rows can
 *                          only ever move forwards
 *   · nothing rewrites   — a cue the voice has already passed is frozen, so late
 *                          transcript cannot change what has been shown
 */

import { normalize, stem } from './voiceKeywords.js';

/* ── Tuning ───────────────────────────────────────────────────────────────── */

// What leaving a card unspoken-for costs the alignment. Roughly one solid
// keyword match: enough that a card the answer covers only vaguely still earns a
// passage, not so much that it can steal one that clearly belongs elsewhere.
const PANEL_SKIP_COST = 4;

// Rows are skipped freely. A card lists twelve events and the answer mentions
// three; the other nine should stay dark rather than being forced under a
// sentence to avoid a penalty.
const ROW_SKIP_COST = 0;

// Saying a row's name is worth much more than sharing a word with it. Coverage
// is a fraction of the row's own name, so this is length-independent: it treats
// a one-word title and a twelve-word headline alike.
const COVERAGE_BONUS = 6;

// What counts as REFERRING to a row, as opposed to happening to share a word
// with it. Any one of: half of one of its names, two distinct words of its name,
// or a detail that pins it down (a time, a place).
//
// The two-word rule is what long titles need. A headline runs a dozen words and
// gets paraphrased down to its subject — "the All Blacks and Springboks are neck
// and neck" is unmistakably about that story while covering a fifth of its
// name. Two of a row's OWN words is specific in a way that no single shared word
// ("Tuesday", "meeting") ever is.
const CO_MENTION_COVERAGE = 0.5;
const NAME_WORDS_ARE_A_REFERENCE = 2;

/* ── Text → tokens and sentences ──────────────────────────────────────────── */

/**
 * The transcript as normalised, stemmed tokens that remember where they came
 * from. The offsets are what make word-level timing possible at all: they are
 * the same character positions the audio timeline reports.
 *
 * Normalisation matches the vocabulary layer exactly — one raw run can yield
 * several tokens ("half-past" → "half", "past") — because a keyword and the
 * speech that should match it have to be reduced the same way.
 */
export function tokenize(text) {
  const tokens = [];
  for (const match of String(text ?? '').matchAll(/\S+/g)) {
    const clean = normalize(match[0]);
    if (!clean) continue;
    for (const word of clean.split(' ')) {
      tokens.push({ stem: stem(word), start: match.index, end: match.index + match[0].length });
    }
  }
  return tokens;
}

/**
 * The answer split into sentences, each carrying its character span and the
 * range of tokens inside it. `text` is the cleaned-up reading of the sentence,
 * which is what the transcript displays.
 */
export function splitSentences(text, tokens = tokenize(text)) {
  const source = String(text ?? '');
  const sentences = [];
  let cursor = 0;

  for (const match of source.matchAll(/[^.!?…\n]+[.!?…]*|\n+/g)) {
    const clean = match[0]
      .replace(/[#*`>]+/g, '')
      .replace(/^\s*[-•]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) continue;
    const start = match.index;
    const end = match.index + match[0].length;
    let first = cursor;
    while (first < tokens.length && tokens[first].start < start) first += 1;
    let last = first;
    while (last < tokens.length && tokens[last].start < end) last += 1;
    cursor = last;
    // `words` is what the transcript renders and lights one at a time; the span
    // is what the audio timeline is measured in.
    sentences.push({ text: clean, words: clean.split(' '), start, end, firstToken: first, lastToken: last });
  }
  return sentences;
}

/* ── Evidence ─────────────────────────────────────────────────────────────── */

const EMPTY_EVIDENCE = { score: 0, coverage: 0, nameHits: 0, pinned: 0, at: -1 };

/**
 * How strongly a span of tokens points at one set of keywords, and — the part
 * the old scorer had no way to express — WHERE in the span it first does.
 *
 * `at` is the character offset of the earliest word that refers to the target,
 * whatever kind of reference it is. That is what a row's highlight is timed to,
 * so "at half past four you've got the dentist" lights the row on "half", where
 * the sentence actually starts being about it, rather than on "dentist" three
 * words from the end.
 */
export function evidenceIn(keywords, tokens, from, to) {
  if (!keywords?.length || to <= from) return EMPTY_EVIDENCE;

  let score = 0;
  let pinned = 0;
  let nameHits = 0;
  let at = -1;
  const groups = new Map(); // name group → { words, hits }

  for (const { text, weight, role, groups: memberOf = [] } of keywords) {
    const words = text.split(' ');
    const isNameWord = role === 'name' && words.length === 1;

    // Where this keyword first appears in the span, as a whole phrase.
    let foundAt = -1;
    for (let i = from; i + words.length <= to; i += 1) {
      let matched = true;
      for (let w = 0; w < words.length; w += 1) {
        if (tokens[i + w].stem !== words[w]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        foundAt = tokens[i].start;
        break;
      }
    }

    if (isNameWord) {
      for (const group of memberOf) {
        const tally = groups.get(group) ?? { words: 0, hits: 0 };
        tally.words += 1;
        if (foundAt >= 0) tally.hits += 1;
        groups.set(group, tally);
      }
    }
    if (foundAt < 0) continue;

    score += weight;
    if (role === 'name') nameHits += 1;
    if (role === 'pins') pinned += weight;
    if (at < 0 || foundAt < at) at = foundAt;
  }

  // A row can have several equally good names — "Wed", "Wednesday", "tomorrow"
  // are all the same row — so coverage is measured within a name group and the
  // best group wins. Pooling them would make saying "tomorrow" look like naming
  // only a third of the row.
  let coverage = 0;
  for (const { words, hits } of groups.values()) {
    if (words) coverage = Math.max(coverage, hits / words);
  }

  return { score: score + coverage * COVERAGE_BONUS, coverage, nameHits, pinned, at };
}

/* ── Monotonic alignment ──────────────────────────────────────────────────── */

/**
 * Lay `rows` (sentences, in the order they are spoken) over `slots` (cards or
 * card rows, in the order they will be talked about) so that the assignment only
 * ever moves forwards, maximising total evidence.
 *
 * This is the whole idea in one function. Because it is solved for the answer as
 * a whole rather than sentence by sentence, a sentence with no evidence of its
 * own inherits its neighbours' conclusion instead of scoring zero and being
 * dropped — and because the path is monotonic, the result cannot oscillate.
 *
 *   dp[row][slot] = score(row, slot)
 *                 + max over slot' ≤ slot of ( dp[row-1][slot'] − skips × cost )
 *
 * `skipCost` prices leaving a slot with nothing assigned to it, including before
 * the first row and after the last. `minSlot(row)` is the floor described in
 * `compileScript` — the promise that already-spoken cues are never revised.
 *
 * Returns one slot index per row.
 */
export function alignMonotonic(rows, slots, scoreOf, { skipCost = 0, minSlot = () => 0 } = {}) {
  const R = rows.length;
  const S = slots.length;
  if (!R || !S) return new Array(R).fill(-1);

  const dp = Array.from({ length: R }, () => new Float64Array(S).fill(-Infinity));
  const from = Array.from({ length: R }, () => new Int32Array(S).fill(-1));

  for (let row = 0; row < R; row += 1) {
    const floor = Math.max(0, Math.min(S - 1, minSlot(row)));
    for (let slot = floor; slot < S; slot += 1) {
      const here = scoreOf(row, slot);
      if (row === 0) {
        dp[row][slot] = here - skipCost * slot; // slots left unused before the first row
        continue;
      }
      let best = -Infinity;
      let bestFrom = -1;
      for (let prev = 0; prev <= slot; prev += 1) {
        if (dp[row - 1][prev] === -Infinity) continue;
        const gap = Math.max(0, slot - prev - 1);
        const value = dp[row - 1][prev] - skipCost * gap;
        if (value > best) {
          best = value;
          bestFrom = prev;
        }
      }
      if (bestFrom < 0) continue;
      dp[row][slot] = best + here;
      from[row][slot] = bestFrom;
    }
  }

  // Finish on whichever slot leaves the best total, counting the slots left over
  // at the end as skipped too.
  let endSlot = -1;
  let bestTotal = -Infinity;
  for (let slot = 0; slot < S; slot += 1) {
    if (dp[R - 1][slot] === -Infinity) continue;
    const total = dp[R - 1][slot] - skipCost * (S - 1 - slot);
    if (total > bestTotal) {
      bestTotal = total;
      endSlot = slot;
    }
  }
  if (endSlot < 0) return new Array(R).fill(0);

  const assignment = new Array(R).fill(0);
  let slot = endSlot;
  for (let row = R - 1; row >= 0; row -= 1) {
    assignment[row] = slot;
    slot = row > 0 ? from[row][slot] : slot;
  }
  return assignment;
}

/* ── Compiling a turn ─────────────────────────────────────────────────────── */

const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Compile this turn's cards and transcript into a timeline.
 *
 * `floor` is what keeps the screen honest while the transcript is still
 * arriving: `{ charIndex, panelIndex }` says "at this point the voice had
 * already reached this card", and the alignment is forbidden from placing
 * anything at or after that point on an earlier card. Without it a late
 * sentence could re-optimise the whole answer and pull the screen back to a card
 * the voice has already left.
 *
 * Returns `{ sentences, cues }`, where the cues tile the transcript end to end
 * and `panelIndex` of -1 means "show no card here".
 */
export function compileScript(panels, transcript, floor = null) {
  const tokens = tokenize(transcript);
  const sentences = splitSentences(transcript, tokens);
  const cards = panels ?? [];
  if (!sentences.length || !cards.length) return { sentences, cues: [] };

  // Evidence for every (sentence, card) pair, computed once and reused by both
  // the card alignment and the row alignment beneath it.
  const cardEvidence = sentences.map((s) =>
    cards.map((panel) => {
      const own = evidenceIn(panel.keywords, tokens, s.firstToken, s.lastToken);
      const rows = (panel.items ?? []).map((item) => evidenceIn(item.keywords, tokens, s.firstToken, s.lastToken));
      const best = rows.reduce((max, e) => Math.max(max, e.score), 0);
      return { own, rows, score: own.score + best };
    }),
  );

  // A card the answer never refers to at all — a tool ran, the reply ignored it —
  // is not a candidate. Only cards with some footing anywhere are laid out, which
  // is what stops the skip cost forcing an unmentioned card onto the screen.
  //
  // A receipt is the exception. What was just done is worth seeing whether or not
  // the reply names it — "Done, both are in" refers to nothing on the card.
  const live = cards
    .map((_, index) => index)
    .filter((index) => cards[index].receipt || sentences.some((_, s) => cardEvidence[s][index].score > 0));
  if (!live.length) return { sentences, cues: [] };

  const floorSlot = (row) => {
    if (!floor || floor.panelIndex < 0) return 0;
    if (sentences[row].end <= floor.charIndex) return 0; // already spoken — left as it was
    const index = live.indexOf(floor.panelIndex);
    return index < 0 ? 0 : index;
  };

  const cardOf = alignMonotonic(sentences, live, (row, slot) => cardEvidence[row][live[slot]].score, {
    skipCost: PANEL_SKIP_COST,
    minSlot: floorSlot,
  }).map((slot) => live[slot]);

  // Sentences before the answer says anything about anything, and after it has
  // finished with the last card, belong to no card — that is the sign-off, not
  // part of the data.
  // A receipt's passage is never trimmed: it is up from the first word to the
  // last, sign-off included.
  const counts = (s) => cardEvidence[s][cardOf[s]].score > 0 || Boolean(cards[cardOf[s]].receipt);
  let firstSpoken = sentences.findIndex((_, s) => counts(s));
  let lastSpoken = -1;
  sentences.forEach((_, s) => {
    if (counts(s)) lastSpoken = s;
  });
  if (firstSpoken < 0) return { sentences, cues: [] };

  // Rows, card by card: the same alignment one level down, over just the
  // sentences that card was given.
  const rowOf = new Array(sentences.length).fill(-1);
  for (const card of live) {
    const mine = [];
    for (let s = firstSpoken; s <= lastSpoken; s += 1) if (cardOf[s] === card) mine.push(s);
    const items = cards[card].items ?? [];
    if (!mine.length || !items.length) continue;
    const picked = alignMonotonic(mine, items, (row, slot) => cardEvidence[mine[row]][card].rows[slot].score, {
      skipCost: ROW_SKIP_COST,
    });
    mine.forEach((s, i) => {
      rowOf[s] = picked[i];
    });
  }

  /* Sentences → cues, with every boundary pulled onto the exact word. */

  // Changes, not spans: each entry says "from this character, this is what is on
  // screen". Spans fall out at the end. Building it this way is what lets a
  // single sentence carry several rows — "the second one's at four, then five a
  // side on Wednesday" changes twice, mid-sentence, on the words that do it.
  // Where one clause gives way to the next. Speech moves to its next subject at
  // a comma far more reliably than at a full stop.
  const breaks = [];
  for (const match of String(transcript).matchAll(/[,;:—]/g)) breaks.push(match.index);
  const clauseOf = (at) => {
    let count = 0;
    while (count < breaks.length && breaks[count] < at) count += 1;
    return count;
  };

  const changes = [];
  const mark = (at, panelIndex, itemIds) => {
    const last = changes[changes.length - 1];
    if (last && last.panelIndex === panelIndex && sameIds(last.itemIds, itemIds)) return;
    if (last && at <= last.at) {
      // Same position as the previous change — the later reading wins.
      last.panelIndex = panelIndex;
      last.itemIds = itemIds;
      return;
    }
    changes.push({ at, panelIndex, itemIds });
  };

  // Rows only ever move forwards — but WITHIN a card. Row indices mean nothing
  // across cards, so carrying the mark over is what silenced every row of the
  // second and third card in a three-card brief.
  let highWater = -1;
  let previousCard = -1;

  for (let s = firstSpoken; s <= lastSpoken; s += 1) {
    const sentence = sentences[s];
    const card = cardOf[s];
    if (card !== previousCard) {
      highWater = -1;
      previousCard = card;
    }
    const items = cards[card].items ?? [];
    const evidence = cardEvidence[s][card];

    // Every row this sentence genuinely REFERS to, in the order it does so.
    //
    // Sharing a word is not a reference. Two events on the same Tuesday both
    // match "Tuesday", and treating that as naming the second one made the
    // highlight jump to it mid-sentence. A reference means the row was named
    // (half of any one of its names), or a detail that pins it down was said —
    // a time, a place, an address. Those are marked as pinning at the point the
    // card is built, precisely because they identify one row and not its
    // neighbours.
    const named = items
      .map((item, index) => ({ index, id: item.id, ...evidence.rows[index] }))
      .filter(
        (row) =>
          row.at >= 0 &&
          row.index >= highWater &&
          (row.coverage >= CO_MENTION_COVERAGE || row.nameHits >= NAME_WORDS_ARE_A_REFERENCE || row.pinned > 0),
      )
      .sort((a, b) => a.at - b.at || a.index - b.index);

    if (!named.length) {
      // Nothing named here. The sentence carries on with the row the alignment
      // gave it — the one it follows from — so the card keeps its light through
      // "it shouldn't take long" rather than going dark.
      //
      // Carrying forward only: until a row has actually been referred to there
      // is nothing to carry, and lighting the alignment's guess would put a row
      // under the opening words ("you've got three things on today") before the
      // answer has said which. The card comes up; the rows stay level.
      const inherited = rowOf[s];
      const established = highWater >= 0 && inherited >= highWater && items[inherited];
      mark(sentence.start, card, established ? [items[inherited].id] : []);
      continue;
    }

    // The card itself may be introduced before its first row is ("as for the
    // weather, it's fifteen degrees") — come up on that word. The first card of
    // the answer opens with its sentence instead, so the screen is already
    // furnished as Pulse starts speaking rather than a beat into it.
    const opensAt = evidence.own.at >= 0 ? Math.min(evidence.own.at, named[0].at) : named[0].at;
    const lit = [named[0].id];
    mark(changes.length ? Math.max(sentence.start, opensAt) : sentence.start, card, [...lit]);

    // Rows named together JOIN each other rather than replacing one another —
    // "Thursday and Friday you're at work" is about both — but only within the
    // same clause. A sentence that runs a list together ("fifteen and cloudy,
    // seventeen on Thursday, rain on Friday") is about each in turn, and
    // accumulating across the whole sentence would end with every row lit and
    // nothing to tell them apart. Commas are where speech turns to the next one.
    let clause = clauseOf(named[0].at);
    for (let i = 1; i < named.length; i += 1) {
      const here = clauseOf(named[i].at);
      if (here !== clause) lit.length = 0;
      clause = here;
      lit.push(named[i].id);
      mark(named[i].at, card, [...lit]);
    }
    highWater = named[named.length - 1].index;
  }

  if (!changes.length) return { sentences, cues: [] };

  // Changes → spans. Anything before the first change, and after the answer has
  // finished with its last card, shows nothing.
  const tail = sentences[lastSpoken].end;
  const cues = changes.map((change, i) => ({
    start: change.at,
    end: i + 1 < changes.length ? changes[i + 1].at : tail,
    panelIndex: change.panelIndex,
    itemIds: change.itemIds,
  }));
  if (cues[0].start > 0) cues.unshift({ start: 0, end: cues[0].start, panelIndex: -1, itemIds: [] });
  const last = cues[cues.length - 1];
  if (last.end < transcript.length) cues.push({ start: last.end, end: transcript.length, panelIndex: -1, itemIds: [] });

  return { sentences, cues: cues.filter((cue) => cue.end > cue.start) };
}

const NO_CUE = { panelIndex: -1, itemIds: [] };

/** What is on screen at a character position. Binary search over the cues. */
export function readCue(script, charIndex) {
  const cues = script?.cues;
  if (!cues?.length) return NO_CUE;
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start > charIndex) hi = mid - 1;
    else {
      found = mid;
      lo = mid + 1;
    }
  }
  if (found < 0) return NO_CUE;
  const cue = cues[found];
  return charIndex < cue.end ? cue : NO_CUE;
}

/** Which sentence is being spoken at a character position, for the transcript. */
export function sentenceIndexAt(script, charIndex) {
  const sentences = script?.sentences ?? [];
  if (!sentences.length) return -1;
  let index = sentences.findIndex((s) => s.end > charIndex);
  if (index < 0) index = sentences.length - 1;
  return index;
}
