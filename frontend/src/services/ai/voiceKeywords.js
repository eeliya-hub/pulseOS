/**
 * The vocabulary layer of voice mode.
 *
 * One job: turn a value from the data — an event title, a time, a temperature —
 * into the words it would be recognised by when spoken aloud. The data says
 * "14:30"; the voice says "half two". Nothing here knows about cards, sentences
 * or timing; it only answers "what might this sound like?".
 *
 * Everything is pure, so the matching can be reasoned about and tested without a
 * browser or a live session.
 */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'yours', 'from', 'that', 'this', 'there', 'then',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'about', 'into', 'over',
  'are', 'was', 'were', 'been', 'being', 'its', 'his', 'her', 'their', 'our', 'out', 'off',
  'all', 'any', 'not', 'but', 'get', 'got', 'one', 'two', 'new', 'day', 'days', 'time', 'times',
  'event', 'events', 'plan', 'plans', 'thing', 'things', 'week', 'weekend',
  'morning', 'afternoon', 'evening', 'night', 'calendar', 'trip', 'weather', 'news', 'story',
  'next', 'last', 'first', 'also', 'just', 'now', 'here', 'what', 'when', 'where', 'which',
]);

/** Lowercase, strip punctuation/accents, squeeze whitespace. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Spoken dates are said in full — "Tuesday", "September" — while the data holds
 * them short. Both forms become keywords so either matches. "May" and "March"
 * are left out: as words they are far more often the modal verb and the month is
 * not worth the false lights.
 */
const LONG_FORMS = {
  mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', weds: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
  jan: 'january', feb: 'february', apr: 'april', jun: 'june', jul: 'july',
  aug: 'august', sep: 'september', sept: 'september', oct: 'october', nov: 'november', dec: 'december',
};

// What a match is worth. A row's own name identifies it far better than the
// things around it, so naming it outright counts for more than sharing a
// location or a day with it — and a whole phrase counts for more than a word.
const WEIGHTS = {
  primary: { phrase: 5, word: 3 },
  secondary: { phrase: 3, word: 2 },
};

/* ── Saying it the way a voice says it ────────────────────────────────────── */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–99 as it would be read aloud: 17 → "seventeen", 45 → "forty five". */
export function numberWord(n) {
  const value = Number(n);
  if (!Number.isInteger(value) || value < 0 || value > 99) return null;
  if (value < 20) return ONES[value];
  const unit = value % 10;
  return unit ? `${TENS[Math.floor(value / 10)]} ${ONES[unit]}` : TENS[Math.floor(value / 10)];
}

/**
 * The ways a 24-hour time gets said out loud.
 *
 * The data holds "14:30"; nobody says that. They say "half two", "two thirty",
 * "half past two". Times are on almost every event and the voice almost always
 * mentions one, so this is the single richest signal available — and until now
 * none of it matched, because "14:30" was compared against the words literally.
 */
export function timeForms(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return [];
  const hour24 = Number(m[1]);
  const minute = Number(m[2]);
  if (hour24 > 23 || minute > 59) return [];

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hourWord = numberWord(hour12);
  const nextHourWord = numberWord(hour12 === 12 ? 1 : hour12 + 1);
  const forms = [];

  if (minute === 0) {
    forms.push(hourWord, `${hourWord} o clock`);
  } else if (minute === 15) {
    forms.push(`quarter past ${hourWord}`, `${hourWord} fifteen`);
  } else if (minute === 30) {
    forms.push(`half ${hourWord}`, `half past ${hourWord}`, `${hourWord} thirty`);
  } else if (minute === 45) {
    forms.push(`quarter to ${nextHourWord}`, `${hourWord} forty five`);
  } else {
    forms.push(`${hourWord} ${numberWord(minute)}`);
  }
  // The 24-hour reading, for the times that do get said that way ("nineteen forty five").
  if (hour24 > 12) forms.push(`${numberWord(hour24)} ${minute ? numberWord(minute) : 'hundred'}`);
  return forms.filter(Boolean);
}

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/**
 * "2 Sep" → "second", "the second".
 *
 * Only for values that are actually dates — a month name, or an ISO date. Any
 * number would otherwise do, which turned "21 Flaxpond Road" into "twenty
 * first" and let a sentence about twenty of anything light that event.
 */
export function dateForms(value) {
  const text = String(value ?? '');
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!iso && !MONTHS.test(text)) return [];
  const day = iso ? Number(iso[3]) : Number(/\b(\d{1,2})\b/.exec(text)?.[1]);
  const ordinal = ORDINALS[day];
  return ordinal ? [ordinal, `the ${ordinal}`] : [];
}

const ORDINALS = {
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh',
  8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth',
  14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth',
  19: 'nineteenth', 20: 'twentieth', 21: 'twenty first', 22: 'twenty second', 23: 'twenty third',
  24: 'twenty fourth', 25: 'twenty fifth', 26: 'twenty sixth', 27: 'twenty seventh',
  28: 'twenty eighth', 29: 'twenty ninth', 30: 'thirtieth', 31: 'thirty first',
};

/**
 * Everything a value might sound like: itself, plus its spoken forms.
 * A bare number gets its word ("17" → "seventeen"), a time gets its readings,
 * a date its ordinal.
 */
export function spokenForms(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const out = [text];
  out.push(...timeForms(text));
  out.push(...dateForms(text));
  if (/^\d{1,2}$/.test(text)) {
    const word = numberWord(Number(text));
    if (word) out.push(word);
  }
  return out;
}

/**
 * Loose word equality, so a sentence doesn't miss for a plural or a tense.
 * "lessons" matches "lesson", "warnings" matches "warning".
 */
/** Stem every word of a phrase, so both sides of a comparison match. */
export const stemPhrase = (text) => text.split(' ').map(stem).join(' ');

export function stem(word) {
  if (word.length < 5) return word;
  return word.replace(/(ies)$/, 'y').replace(/(sses|shes|ches)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
}

/**
 * The identifying words for one item, each with what a match is worth. The first
 * argument is the row's name — an array when a row has several equally good
 * names ("Wed", "Wednesday", "tomorrow" are all that row) — and everything after
 * it is context (where, when, which calendar). Whole phrases are kept alongside
 * their words, so "Shibuya crossing walk" matches in full and a passing
 * "Shibuya" still counts for something.
 */
function buildKeywords(primary, context, { keepCommon = false } = {}) {
  const found = new Map(); // text → { weight, role, groups }
  const put = (text, weight, role, group) => {
    if (!text) return;
    const existing = found.get(text);
    if (existing === undefined) {
      found.set(text, { weight, role, groups: group === null ? [] : [group] });
      return;
    }
    if (weight > existing.weight) {
      existing.weight = weight;
      existing.role = role;
    }
    if (group !== null && !existing.groups.includes(group)) existing.groups.push(group);
  };

  const collect = (raw, scale, baseRole, group) => {
    const marked = Boolean(raw && typeof raw === 'object' && '__pins' in raw);
    const value = marked ? raw.__pins : raw;
    const role = marked ? 'pins' : baseRole;
    const wholeOnly = Boolean(marked && raw.__whole);
    // "14:30" is never said aloud as "14:30" — take every way it might be said.
    // Only the original value contributes its individual words; a generated form
    // contributes as a whole phrase unless it is a single word. Otherwise "half
    // two" also registers "half", and a sentence about half a percent lights the
    // half-two appointment.
    spokenForms(value).forEach((form, i) => {
      const clean = normalize(form);
      if (!clean) return;
      const multiWord = clean.includes(' ');
      // Stemmed the same way the sentence is, or "fourteen degrees" would never
      // meet "fourteen degree".
      if (multiWord) put(stemPhrase(clean), scale.phrase, role, group);
      if (wholeOnly) return; // meant to be heard as a unit
      if (multiWord && i > 0) return; // a generated phrase, kept whole
      for (const word of clean.split(' ')) {
        const long = LONG_FORMS[word];
        if (long) put(long, scale.word, role, group);
        if (word.length >= 4 && (keepCommon || !STOP_WORDS.has(word))) put(stem(word), scale.word, role, group);
      }
    });
  };

  // Each alternative name is its own group: a row called "Wed", "Wednesday" and
  // "tomorrow" is fully named by any ONE of them, so coverage is measured within
  // a group and the best group wins. Pooling them would mean saying "tomorrow"
  // counted as naming only a third of the row.
  const names = Array.isArray(primary) ? primary : [primary];
  names.forEach((value, group) => collect(value, WEIGHTS.primary, 'name', group));
  for (const value of context) collect(value, WEIGHTS.secondary, 'context', null);
  return [...found].map(([text, { weight, role, groups }]) => ({ text, weight, role, groups }));
}

/**
 * Mark a context value as one that genuinely pins a row down — a time, an
 * address, a temperature. Ordinary context (which calendar it is on, which
 * outlet ran the story, which weekday) is shared by too many rows to identify
 * one on its own, and treating the two alike meant "it is a busy Thursday" lit
 * whichever event happened to fall on a Thursday.
 */
export const pins = (value) => ({ __pins: value });

/**
 * Like `pins`, but matched only as a whole phrase.
 *
 * For values built to be said as a unit — "nine degrees". Letting its words
 * count separately puts a bare "nine" on the row, which then matches any nine
 * o'clock in the sentence.
 */
export const pinsPhrase = (value) => ({ __pins: value, __whole: true });

/** A row's identifying words: its name first, then the things around it. */
export const keywordsOf = (primary, ...context) => buildKeywords(primary, context);

/**
 * The words that name a CARD — "weather", "the news", "your calendar".
 *
 * Built without the stop list, because those very words are the ones suppressed
 * as filler inside a row. Without this, a card's own name scored zero and
 * "that's the weather done" looked like a sentence about nothing.
 */
export const topicKeywords = (...values) => buildKeywords(values, [], { keepCommon: true });
