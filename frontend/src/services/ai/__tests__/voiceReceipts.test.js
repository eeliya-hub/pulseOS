import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { panelsFromTool, receiptsFromTool, withReceipts } from '../voiceContext.js';
import { compileScript, readCue } from '../voiceScript.js';

/*
 * What a write did → what the screen shows. The results are shaped exactly as
 * the executor returns them; the request is the one from the voice trace that
 * started this: two orthodontic appointments, then four tasks.
 */

const added = (key, title, date, start, end) =>
  receiptsFromTool(
    'create_calendar_event',
    { title, date },
    { created: true, title, date, start, end, all_day: false, location: 'William Harvey Hospital', calendar: 'Home' },
    key,
  );

const twoAppointments = () => [
  ...added('c1', 'Orthodontic Appointment', '2026-10-30', '10:00', '11:00'),
  ...added('c2', 'Orthodontic Appointment', '2026-12-11', '15:40', '16:40'),
];

describe('receipts', () => {
  it('puts two events added by one request on a single receipt', () => {
    const panels = withReceipts([], twoAppointments());
    assert.equal(panels.length, 1);
    const [receipt] = panels;
    assert.equal(receipt.kind, 'actions');
    assert.equal(receipt.receipt, true);
    assert.equal(receipt.title, 'Done');
    assert.equal(receipt.subtitle, '2 added');
    assert.equal(receipt.items.length, 2);
    assert.match(receipt.items[1].detail, /11 Dec/);
    assert.match(receipt.items[1].detail, /15:40 – 16:40/);
    assert.match(receipt.items[1].detail, /William Harvey Hospital/);
  });

  it('shows a duplicate as already there, never as added', () => {
    const [row] = receiptsFromTool(
      'create_calendar_event',
      { title: 'Orthodontic Appointment' },
      { created: false, duplicate: true, title: 'Orthodontic Appointment', date: '2026-12-11', start: '15:40', calendar: 'Home' },
      'd',
    );
    assert.equal(row.verb, 'exists');
    assert.equal(withReceipts([], [row])[0].subtitle, '1 already there');
  });

  it('shows a failure as a failure, named from what was asked for', () => {
    const [row] = receiptsFromTool('create_calendar_event', { title: 'Dentist', date: '2026-12-11' }, { error: 'No calendar called "Hme".' }, 'x');
    assert.equal(row.verb, 'failed');
    assert.equal(row.title, 'Dentist');
    assert.match(row.note, /Hme/);
    assert.equal(withReceipts([], [row])[0].title, 'Not done');
  });

  it('reads as partly done when only some of it worked', () => {
    const rows = [
      ...added('ok', 'Orthodontic Appointment', '2026-10-30', '10:00', '11:00'),
      ...receiptsFromTool('create_calendar_event', { title: 'Dentist' }, { error: 'Calendar unavailable' }, 'bad'),
    ];
    const [receipt] = withReceipts([], rows);
    assert.equal(receipt.title, 'Partly done');
    assert.equal(receipt.subtitle, '1 added · 1 didn’t work');
  });

  it('asks rather than claims failure when several events matched', () => {
    const [row] = receiptsFromTool('delete_calendar_event', { title: 'Orthodontic' }, { deleted: 0, error: '5 events match', matches: [{}, {}] }, 'd');
    assert.equal(row.verb, 'unclear');
  });

  it('gives each removed copy its own line', () => {
    const rows = receiptsFromTool(
      'delete_calendar_event',
      { title: 'appointment', keep_one: true },
      {
        deleted: 2,
        removed: [
          { title: 'Orthodontic Appointment', date: '2026-12-11', start: '15:40', calendar: 'Home' },
          { title: 'Dentist appointment', date: '2026-12-11', start: '15:40', calendar: 'Home' },
        ],
      },
      'd',
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.verb === 'removed'));
    assert.equal(new Set(rows.map((row) => row.id)).size, 2);
  });

  it('lists four tasks as four lines', () => {
    const tasks = ['Redesign Pulse UI', 'Sort out finances for Mum', 'Unpack from holiday', 'Amerijet redesign'];
    const rows = tasks.flatMap((text, i) => receiptsFromTool('add_task', { text }, { added: true, text, date: '2026-09-15' }, `t${i}`));
    const [receipt] = withReceipts([], rows);
    assert.equal(receipt.items.length, 4);
    assert.equal(receipt.subtitle, '4 added');
    assert.deepEqual(receipt.items.map((row) => row.title), tasks);
  });

  it('keeps lookups on their own cards and merges a second batch into the same receipt', () => {
    const lookup = panelsFromTool('get_today', {}, { events: [{ ref: 'e1', title: 'Dentist', day: 'Tue', start: '14:30' }], count: 1 });
    let panels = withReceipts(lookup, receiptsFromTool('add_task', { text: 'A' }, { added: true, text: 'A', date: '2026-09-15' }, 'a'));
    panels = withReceipts(panels, receiptsFromTool('add_task', { text: 'B' }, { added: true, text: 'B', date: '2026-09-15' }, 'b'));
    assert.deepEqual(panels.map((panel) => panel.kind), ['calendar', 'actions']);
    assert.equal(panels[1].items.length, 2);
  });

  it('makes no receipt for a lookup', () => {
    assert.deepEqual(receiptsFromTool('get_today', {}, { events: [] }), []);
    assert.deepEqual(withReceipts([], []), []);
  });
});

describe('a receipt on the timeline', () => {
  it('is on screen for a reply that names nothing on it, sign-off included', () => {
    const text = 'Done, both are in. Anything else?';
    const script = compileScript(withReceipts([], twoAppointments()), text);
    for (const needle of ['Done', 'both are in', 'Anything else']) {
      assert.equal(readCue(script, text.indexOf(needle)).panelIndex, 0, `not showing at "${needle}"`);
    }
  });

  it('lights the lines the reply confirms', () => {
    const text =
      "I've added your orthodontic appointment on the thirtieth of October, and the one on the eleventh of December.";
    const { cues } = compileScript(withReceipts([], twoAppointments()), text);
    const lit = new Set(cues.flatMap((cue) => cue.itemIds));
    assert.ok(lit.has('c1:0') && lit.has('c2:0'), `lit: ${[...lit].join(', ')}`);
  });

  it('shares the answer with a lookup card without being dropped', () => {
    const weather = panelsFromTool('get_weather', {}, { location: 'Ghent', temperature: 15, condition: 'Cloudy', daily: [] });
    const panels = withReceipts(weather, twoAppointments());
    const text = "It's fifteen degrees and cloudy. Both appointments are in your calendar.";
    const { cues } = compileScript(panels, text);
    const shown = new Set(cues.map((cue) => cue.panelIndex));
    assert.ok(shown.has(0) && shown.has(1), `cards shown: ${[...shown].join(', ')}`);
  });
});
