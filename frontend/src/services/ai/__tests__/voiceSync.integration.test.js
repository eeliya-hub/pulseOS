import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { panelsFromTool } from '../voiceContext.js';
import { compileScript, readCue } from '../voiceScript.js';

/*
 * End to end, through the real card builder: tool results in, timeline out.
 * These are the shapes the user reported going wrong — a card that never
 * appeared, a row that never lit — written as answers Pulse actually gives.
 */

const CALENDAR = {
  events: [
    { ref: 'e1', title: 'Dentist', day: 'Tue', start: '14:30', end: '15:15', location: 'Flaxpond Road', calendar: 'Personal' },
    { ref: 'e2', title: 'Project Sync', day: 'Tue', start: '16:00', end: '17:00', location: 'Google Meet', calendar: 'Work' },
    { ref: 'e3', title: 'Five a side', day: 'Wed', start: '19:00', end: '20:00', location: 'Powerleague', calendar: 'Personal' },
  ],
  count: 3,
};

const WEATHER = {
  location: 'Ghent',
  temperature: 15,
  condition: 'Broken Clouds',
  feelsLike: 14,
  daily: [
    { date: '2026-09-09', day: 'Wed', hi: 15, lo: 9, icon: 'cloud' },
    { date: '2026-09-10', day: 'Thu', hi: 17, lo: 11, icon: 'sun' },
    { date: '2026-09-11', day: 'Fri', hi: 12, lo: 8, icon: 'rain' },
  ],
};

const NEWS = {
  scope: 'world',
  articles: [
    { url: 'u1', title: 'Rugby: Little between All Blacks and Springboks', source: 'RNZ' },
    { url: 'u2', title: 'Greens propose new supermarket chain to cut grocery costs', source: '1News' },
  ],
};

/** Every card and row the timeline ever puts on screen for this answer. */
function coverage(panels, text) {
  const { cues } = compileScript(panels, text);
  const cards = new Set();
  const rows = new Set();
  for (const cue of cues) {
    if (cue.panelIndex >= 0) cards.add(cue.panelIndex);
    for (const id of cue.itemIds) rows.add(id);
  }
  return { cards, rows, cues };
}

describe('a morning brief across three cards', () => {
  const panels = [
    ...panelsFromTool('get_today', {}, CALENDAR),
    ...panelsFromTool('get_weather', {}, WEATHER),
    ...panelsFromTool('get_news', {}, NEWS),
  ];
  const text =
    "Morning. You've got three things on today. " +
    'The dentist at half two over on Flaxpond Road, ' +
    'then the project sync at four on Google Meet, ' +
    'and five a side at seven tomorrow evening. ' +
    "Outside it's fifteen degrees and cloudy, seventeen and brighter on Thursday, " +
    'though Friday looks like rain. ' +
    'In the news, the All Blacks and Springboks are neck and neck, ' +
    'and the Greens are proposing a supermarket chain to cut grocery costs. ' +
    "That's you — shout if you need anything.";

  it('builds the three cards it was given', () => {
    assert.equal(panels.length, 3);
    assert.deepEqual(panels.map((p) => p.kind), ['calendar', 'weather', 'news']);
  });

  it('shows every card — none is missed', () => {
    const { cards } = coverage(panels, text);
    assert.deepEqual([...cards].sort(), [0, 1, 2]);
  });

  it('lights every event that is mentioned', () => {
    const { rows } = coverage(panels, text);
    for (const id of ['e1', 'e2', 'e3']) assert.ok(rows.has(id), `event ${id} never lit`);
  });

  it('lights every headline that is mentioned', () => {
    const { rows } = coverage(panels, text);
    for (const id of ['u1', 'u2']) assert.ok(rows.has(id), `story ${id} never lit`);
  });

  it('lights the forecast days that are mentioned', () => {
    const { rows } = coverage(panels, text);
    assert.ok(rows.has('now'), 'the current reading never lit');
    assert.ok(rows.has('2026-09-10'), 'Thursday never lit');
    assert.ok(rows.has('2026-09-11'), 'Friday never lit');
  });

  it('is on the right card at each point in the answer', () => {
    const script = compileScript(panels, text);
    const at = (needle) => readCue(script, text.indexOf(needle)).panelIndex;
    assert.equal(at('dentist'), 0, 'calendar');
    assert.equal(at('fifteen degrees'), 1, 'weather');
    assert.equal(at('All Blacks'), 2, 'news');
  });

  it('puts the card away for the sign-off', () => {
    const script = compileScript(panels, text);
    assert.equal(readCue(script, text.indexOf('shout if you need')).panelIndex, -1);
  });

  it('moves through cards and rows in one direction only', () => {
    const { cues } = coverage(panels, text);
    const shown = cues.filter((c) => c.panelIndex >= 0).map((c) => c.panelIndex);
    assert.deepEqual(shown, [...shown].sort((a, b) => a - b), 'cards must not swing back');
  });

  it('tiles the whole answer with no gaps or overlaps', () => {
    const { cues } = coverage(panels, text);
    assert.equal(cues[0].start, 0);
    for (let i = 1; i < cues.length; i += 1) assert.equal(cues[i].start, cues[i - 1].end);
  });
});

describe('answers that used to leave the screen blank', () => {
  const panels = panelsFromTool('get_today', {}, CALENDAR);

  it('lights a row referred to only by its time', () => {
    const text = 'You have three today. The first is at half two, the next at four, the last at seven tomorrow.';
    const { rows } = coverage(panels, text);
    assert.deepEqual([...rows].sort(), ['e1', 'e2', 'e3']);
  });

  it('lights a row referred to only by where it is', () => {
    const text = 'One of them is over on Flaxpond Road, and another is on Google Meet.';
    const { rows } = coverage(panels, text);
    assert.ok(rows.has('e1') && rows.has('e2'));
  });

  it('keeps the card up through a sentence that names nothing', () => {
    const text = 'The dentist is at half two. It should not take long at all. Then the project sync.';
    const script = compileScript(panels, text);
    assert.equal(readCue(script, text.indexOf('not take long')).panelIndex, 0);
    assert.deepEqual(readCue(script, text.indexOf('not take long')).itemIds, ['e1']);
  });

  it('shows a weather card for an answer that never says the word weather', () => {
    const panelsW = panelsFromTool('get_weather', {}, WEATHER);
    const text = "It's fifteen degrees and cloudy out there at the moment.";
    const { cards, rows } = coverage(panelsW, text);
    assert.deepEqual([...cards], [0]);
    assert.ok(rows.has('now'));
  });
});

describe('growing transcript', () => {
  const panels = [...panelsFromTool('get_today', {}, CALENDAR), ...panelsFromTool('get_weather', {}, WEATHER)];
  const full =
    'The dentist is at half two, then the project sync at four. ' +
    "Outside it's fifteen degrees. Seventeen on Thursday.";

  it('never changes what has already been shown as more text arrives', () => {
    // Playback trails the transcript — Gemini sends the text seconds before the
    // audio for it. So the guarantee is about the position the VOICE has
    // reached, not the end of the text: replay the answer arriving in chunks,
    // read the timeline at the trailing playback head each time, and check that
    // no position ever shows something different from what it first showed.
    const LAG = 40; // characters of text queued ahead of the voice
    let floor = null;
    const shown = new Map(); // character position → what was on screen there

    for (let arrived = 24; arrived <= full.length; arrived += 6) {
      const script = compileScript(panels, full.slice(0, arrived), floor);
      const head = Math.max(0, arrived - LAG);
      for (let c = head - 6; c <= head; c += 1) {
        if (c < 0) continue;
        const cue = readCue(script, c);
        const reading = `${cue.panelIndex}:${cue.itemIds.join(',')}`;
        if (shown.has(c)) assert.equal(shown.get(c), reading, `position ${c} changed after the voice passed it`);
        else shown.set(c, reading);
        if (cue.panelIndex >= 0) floor = { charIndex: c, panelIndex: cue.panelIndex };
      }
    }
    assert.ok(shown.size > 40, `expected the replay to cover the answer, saw ${shown.size} positions`);
  });
});

describe('the opening words', () => {
  const panels = panelsFromTool('get_today', {}, CALENDAR);

  it('brings the card up without lighting a row nothing has named', () => {
    const text = "You've got three things on today. The dentist is at half two.";
    const script = compileScript(panels, text);
    const opening = readCue(script, text.indexOf('three things'));
    assert.equal(opening.panelIndex, 0, 'the card belongs on screen — the answer is about today');
    assert.deepEqual(opening.itemIds, [], 'but no row has been referred to yet');
    assert.deepEqual(readCue(script, text.indexOf('dentist')).itemIds, ['e1']);
  });
});
