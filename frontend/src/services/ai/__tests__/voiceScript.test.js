import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keywordsOf, pins, pinsPhrase, topicKeywords } from '../voiceKeywords.js';
import { alignMonotonic, compileScript, evidenceIn, readCue, splitSentences, tokenize } from '../voiceScript.js';

/* Cards shaped exactly as voiceContext builds them. */
const calendarCard = () => ({
  kind: 'calendar',
  title: 'Coming up',
  keywords: topicKeywords('calendar', 'diary', 'schedule', 'coming up'),
  items: [
    { id: 'a', title: 'Dentist', keywords: keywordsOf('Dentist', pins('Flaxpond Road'), 'Tue', pins('14:30')) },
    { id: 'b', title: 'Call with Sam', keywords: keywordsOf('Call with Sam', null, 'Tue', pins('16:00')) },
    { id: 'c', title: 'Five a side', keywords: keywordsOf('Five a side', pins('Powerleague'), 'Wed', pins('19:00')) },
  ],
});

const weatherCard = () => ({
  kind: 'weather',
  title: 'Ghent',
  keywords: topicKeywords('weather', 'forecast', 'temperature', 'degrees', 'Ghent'),
  items: [
    { id: 'now', keywords: keywordsOf(['right now', 'currently', 'at the moment'], pins('Broken Clouds'), pinsPhrase('fifteen degrees')) },
    { id: 'd1', keywords: keywordsOf(['Tue', 'Tuesday', 'tomorrow'], pinsPhrase('seventeen degrees')) },
    { id: 'd2', keywords: keywordsOf(['Wed', 'Wednesday'], pinsPhrase('twelve degrees')) },
  ],
});

const idsAt = (script, text, needle) => readCue(script, text.indexOf(needle)).itemIds;
const panelAt = (script, text, needle) => readCue(script, text.indexOf(needle)).panelIndex;

describe('tokenize', () => {
  it('keeps character offsets that point back into the raw text', () => {
    const text = "You've got the dentist at half-past two.";
    const tokens = tokenize(text);
    const dentist = tokens.find((t) => t.stem === 'dentist');
    assert.equal(text.slice(dentist.start, dentist.end), 'dentist');
  });

  it('splits a raw run the same way the vocabulary layer does', () => {
    // "half-past" must become two tokens, or the keyword "half past" can never match.
    assert.deepEqual(tokenize('half-past').map((t) => t.stem), ['half', 'past']);
  });
});

describe('splitSentences', () => {
  it('gives every sentence its own token range', () => {
    const text = 'First one. Second one here. Third.';
    const sentences = splitSentences(text);
    assert.equal(sentences.length, 3);
    assert.equal(sentences[1].text, 'Second one here.');
    const tokens = tokenize(text);
    assert.deepEqual(
      tokens.slice(sentences[1].firstToken, sentences[1].lastToken).map((t) => t.stem),
      ['second', 'one', 'here'],
    );
  });
});

describe('evidenceIn', () => {
  it('reports where a row is first referred to, not where it is named', () => {
    const item = { keywords: keywordsOf('Dentist', pins('14:30')) };
    const text = 'At half two you have the dentist.';
    const tokens = tokenize(text);
    const e = evidenceIn(item.keywords, tokens, 0, tokens.length);
    assert.ok(e.score > 0);
    // "half" comes before "dentist" — the sentence starts being about the row there.
    assert.equal(text.slice(e.at, e.at + 4), 'half');
  });

  it('scores nothing for a sentence that shares no words', () => {
    const item = { keywords: keywordsOf('Dentist') };
    const tokens = tokenize('The weather is fine today.');
    assert.equal(evidenceIn(item.keywords, tokens, 0, tokens.length).score, 0);
  });
});

describe('alignMonotonic', () => {
  it('never moves backwards, even when the evidence says to', () => {
    // Row 0 matches slot 1 and row 1 matches slot 0 — the best unordered answer
    // is [1, 0], which is exactly what monotonic alignment must refuse.
    const score = (row, slot) => (row === 0 && slot === 1 ? 10 : row === 1 && slot === 0 ? 10 : 0);
    const result = alignMonotonic([0, 1], [0, 1], score);
    assert.ok(result[1] >= result[0], `expected non-decreasing, got ${JSON.stringify(result)}`);
  });

  it('lets a row with no evidence inherit its neighbours', () => {
    const score = (row, slot) => (row === 0 && slot === 0 ? 10 : row === 2 && slot === 1 ? 10 : 0);
    // The middle row says nothing; it should stay on slot 0 rather than jump.
    assert.deepEqual(alignMonotonic([0, 1, 2], [0, 1], score), [0, 0, 1]);
  });

  it('pays the skip cost to give every slot a row', () => {
    const score = (row, slot) => (slot === 0 ? 5 : 0);
    // Leaving slot 1 empty costs 6, which is worse than giving up the second
    // row's 5 — so the card that would otherwise never appear gets a sentence.
    assert.deepEqual(alignMonotonic([0, 1], [0, 1], score, { skipCost: 6 }), [0, 1]);
    // Free to skip: both rows go where the evidence points.
    assert.deepEqual(alignMonotonic([0, 1], [0, 1], score, { skipCost: 0 }), [0, 0]);
  });
});

describe('compileScript — the failures this replaces', () => {
  it('lights a row the answer never names, on the detail that identifies it', () => {
    // "The second one's at four" names nothing — the old scorer left it dark for
    // the whole sentence. The time is what pins it, so that is where it lights.
    const text = "You've got the dentist on Tuesday. The second one's at four, and then five a side on Wednesday.";
    const script = compileScript([calendarCard()], text);
    assert.deepEqual(idsAt(script, text, 'second'), ['a'], 'nothing identifies it yet');
    assert.deepEqual(idsAt(script, text, 'four'), ['b'], 'the time identifies it');
  });

  it('does not treat a word two rows share as naming either of them', () => {
    // Both appointments are on Tuesday. Saying "Tuesday" must not move the
    // highlight onto the second one.
    const text = "You've got the dentist on Tuesday.";
    const script = compileScript([calendarCard()], text);
    assert.deepEqual(idsAt(script, text, 'Tuesday'), ['a']);
  });

  it('carries a vague sentence on the row it follows', () => {
    const text = 'The dentist is on Tuesday. It should not take long. Then five a side on Wednesday.';
    const script = compileScript([calendarCard()], text);
    assert.deepEqual(idsAt(script, text, 'should not take'), ['a']);
  });

  it('lights both rows a sentence names outright', () => {
    const text = 'The dentist and five a side are the two to watch.';
    const script = compileScript([calendarCard()], text);
    assert.deepEqual(idsAt(script, text, 'two to watch').sort(), ['a', 'c']);
  });

  it('shows every card the answer covers, including one it covers vaguely', () => {
    const text =
      "Right, here's your day. The dentist is at half two, then a call with Sam at four. " +
      "As for outside, it's fifteen degrees and cloudy.";
    const script = compileScript([calendarCard(), weatherCard()], text);
    assert.equal(panelAt(script, text, 'dentist'), 0);
    assert.equal(panelAt(script, text, 'fifteen degrees'), 1);
  });

  it('moves the card on the word that introduces it, not at the sentence break', () => {
    const text = 'The dentist is at half two. As for the weather, it is fifteen degrees.';
    const script = compileScript([calendarCard(), weatherCard()], text);
    // Still on the calendar at "As for the", already on weather by "weather".
    assert.equal(panelAt(script, text, 'As for'), 0);
    assert.equal(panelAt(script, text, 'weather, it is'), 1);
  });

  it('never revisits a card once the voice has moved past it', () => {
    const text = 'It is fifteen degrees out. The dentist is at half two. Cloudy again tomorrow.';
    // The floor says the voice has already reached the calendar card.
    const floor = { charIndex: text.indexOf('The dentist'), panelIndex: 1 };
    const script = compileScript([weatherCard(), calendarCard()], text, floor);
    // "Cloudy again tomorrow" is weather, but the voice has already moved past
    // that card. Holding position is what keeps the screen from swinging back
    // and forth; a turn only ever moves forwards.
    assert.notEqual(panelAt(script, text, 'Cloudy again'), 0, 'must not fall back to the weather card');
  });

  it('leaves the sign-off with no card at all', () => {
    const text = 'The dentist is at half two. Anything else you need, you know where I am.';
    const script = compileScript([calendarCard()], text);
    assert.equal(panelAt(script, text, 'know where I am'), -1);
  });

  it('shows no card for an answer that never refers to one', () => {
    const text = 'Sure thing, all done.';
    assert.deepEqual(compileScript([calendarCard()], text).cues, []);
  });

  it('produces a timeline that tiles the transcript with no overlaps', () => {
    const text =
      "Here's your day. The dentist is at half two, a call with Sam at four, and five a side on Wednesday. " +
      "It's fifteen degrees out, seventeen tomorrow. That's everything.";
    const { cues } = compileScript([calendarCard(), weatherCard()], text);
    for (let i = 1; i < cues.length; i += 1) {
      assert.equal(cues[i].start, cues[i - 1].end, `cue ${i} must start where ${i - 1} ends`);
    }
    assert.ok(cues.every((c) => c.end > c.start));
  });

  it('only ever moves forwards through the rows', () => {
    const text =
      'The dentist is at half two on Tuesday. Then a call with Sam at four. And five a side on Wednesday evening.';
    const card = calendarCard();
    const { cues } = compileScript([card], text);
    const order = cues.filter((c) => c.itemIds.length).map((c) => card.items.findIndex((i) => i.id === c.itemIds[0]));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'rows must light in order');
  });
});

describe('readCue', () => {
  it('finds the cue covering a position, and nothing outside one', () => {
    const script = { cues: [{ start: 0, end: 10, panelIndex: 0, itemIds: ['a'] }, { start: 10, end: 20, panelIndex: 1, itemIds: [] }] };
    assert.equal(readCue(script, 5).panelIndex, 0);
    assert.equal(readCue(script, 10).panelIndex, 1);
    assert.equal(readCue(script, 25).panelIndex, -1);
  });
});
