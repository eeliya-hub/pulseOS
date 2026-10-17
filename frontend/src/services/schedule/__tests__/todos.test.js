import assert from 'node:assert/strict';
import test from 'node:test';
import { TODO_REPEAT, repeatNote, tickTodo, todoDoneOn, todoOccursOn } from '../todos.js';

const todo = (patch = {}) => ({ id: 't', label: 'Call the dentist', date: '2026-10-14', done: false, repeat: 'none', ...patch });

test('the frequencies offered, with until-done among them', () => {
  assert.deepEqual(TODO_REPEAT.map((o) => o.value), ['none', 'untilDone', 'daily', 'weekly', 'monthly', 'yearly']);
});

test('a one-off sits on its own day and nowhere else', () => {
  const t = todo();
  assert.equal(todoOccursOn(t, '2026-10-14'), true);
  assert.equal(todoOccursOn(t, '2026-10-15'), false);
  assert.equal(todoOccursOn(t, '2026-10-13'), false);
});

/* ── Until done: one job, asked about until it is finished ──────────────── */

test('until done comes back every day, then stops for good', () => {
  const t = todo({ repeat: 'untilDone' });
  assert.equal(todoOccursOn(t, '2026-10-14'), true);
  assert.equal(todoOccursOn(t, '2026-10-15'), true);
  assert.equal(todoOccursOn(t, '2026-11-02'), true);
  assert.equal(todoOccursOn(t, '2026-10-13'), false, 'not before it was asked for');

  const done = tickTodo(t, '2026-10-16');
  assert.equal(done.done, true);
  assert.equal(done.doneOn, '2026-10-16');
  assert.equal(todoOccursOn(done, '2026-10-16'), true, 'it stays where you ticked it');
  assert.equal(todoOccursOn(done, '2026-10-17'), false);
  assert.equal(todoOccursOn(done, '2026-10-14'), false, 'and it was not done on the 14th');
});

test('un-ticking an until-done puts it back in the rotation', () => {
  const t = tickTodo(todo({ repeat: 'untilDone' }), '2026-10-16');
  const back = tickTodo(t, '2026-10-16');
  assert.equal(back.done, false);
  assert.equal(back.doneOn, null);
  assert.equal(todoOccursOn(back, '2026-10-20'), true);
});

/* ── A repeat: a thing that genuinely happens again ─────────────────────── */

test('a repeat keeps coming whether or not the last one was done', () => {
  const bins = todo({ label: 'Bins out', date: '2026-10-14', repeat: 'weekly' }); // a Wednesday
  assert.equal(todoOccursOn(bins, '2026-10-21'), true);
  assert.equal(todoOccursOn(bins, '2026-10-22'), false);

  // Ticked on the 14th: the 14th is done, the 21st is still waiting.
  const ticked = tickTodo(bins, '2026-10-14');
  assert.deepEqual(ticked.doneDays, ['2026-10-14']);
  assert.equal(todoDoneOn(ticked, '2026-10-14'), true);
  assert.equal(todoDoneOn(ticked, '2026-10-21'), false);
  assert.equal(todoOccursOn(ticked, '2026-10-21'), true, 'next week still happens');

  // And un-ticking that one leaves the others alone.
  const both = tickTodo(ticked, '2026-10-21');
  assert.deepEqual(both.doneDays, ['2026-10-14', '2026-10-21']);
  const undone = tickTodo(both, '2026-10-14');
  assert.deepEqual(undone.doneDays, ['2026-10-21']);
});

test('ticking the same day twice does not list it twice', () => {
  const t = tickTodo(todo({ repeat: 'daily' }), '2026-10-14');
  const again = tickTodo(t, '2026-10-14', true);
  assert.deepEqual(again.doneDays, ['2026-10-14']);
});

test('a repeat is never globally done, so nothing else writes it off', () => {
  const t = tickTodo(todo({ repeat: 'daily' }), '2026-10-14');
  assert.equal(t.done, false);
  assert.equal(todoDoneOn(t, '2026-10-15'), false);
});

test('daily, monthly and yearly keep their cadence', () => {
  assert.equal(todoOccursOn(todo({ repeat: 'daily' }), '2026-12-25'), true);

  const monthly = todo({ repeat: 'monthly' });
  assert.equal(todoOccursOn(monthly, '2026-11-14'), true);
  assert.equal(todoOccursOn(monthly, '2026-11-15'), false);

  const yearly = todo({ repeat: 'yearly' });
  assert.equal(todoOccursOn(yearly, '2027-10-14'), true);
  assert.equal(todoOccursOn(yearly, '2027-11-14'), false);
});

test('the 31st does not fall down the months that have not got one', () => {
  const t = todo({ date: '2026-01-31', repeat: 'monthly' });
  assert.equal(todoOccursOn(t, '2026-02-28'), true, 'February takes its last day');
  assert.equal(todoOccursOn(t, '2026-02-27'), false);
  assert.equal(todoOccursOn(t, '2026-03-31'), true);
  assert.equal(todoOccursOn(t, '2026-04-30'), true, 'so does April');

  // And a date every month has is not pushed around by the rule.
  const fifth = todo({ date: '2026-01-05', repeat: 'monthly' });
  assert.equal(todoOccursOn(fifth, '2026-02-28'), false);
  assert.equal(todoOccursOn(fifth, '2026-02-05'), true);
});

test('a to-do ticked before any of this was recorded still reads correctly', () => {
  // A one-off, done, with no `doneOn`: still done, still on its own day.
  const once = { id: 'x', label: 'Buy milk', date: '2026-10-02', done: true, repeat: 'none' };
  assert.equal(todoOccursOn(once, '2026-10-02'), true);
  assert.equal(todoDoneOn(once, '2026-10-02'), true);

  // A repeat, done, with no `doneDays`: it comes back, and nothing is ticked.
  const weekly = { id: 'y', label: 'Bins out', date: '2026-10-07', done: true, repeat: 'weekly' };
  assert.equal(todoOccursOn(weekly, '2026-10-14'), true);
  assert.equal(todoDoneOn(weekly, '2026-10-14'), false);
});

test('nothing without a date, and nothing out of nothing', () => {
  assert.equal(todoOccursOn({ label: 'Someday' }, '2026-10-14'), false);
  assert.equal(todoOccursOn(null, '2026-10-14'), false);
  assert.equal(todoOccursOn(todo({ repeat: 'fortnightly' }), '2026-10-28'), false);
  assert.equal(todoDoneOn(null, '2026-10-14'), false);
});

test('the row says what it will do', () => {
  assert.equal(repeatNote('untilDone'), 'Every day until you tick it off');
  assert.equal(repeatNote('weekly'), 'Every week');
  assert.equal(repeatNote('none'), '');
  assert.equal(repeatNote(undefined), '');
});
