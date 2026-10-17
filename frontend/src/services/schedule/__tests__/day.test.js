import assert from 'node:assert/strict';
import test from 'node:test';
import { dayShape, minutesOf, spanOf } from '../day.js';

const at = (time, title = time) => ({ id: title, title, time });

test('minutesOf reads a time however it was written', () => {
  assert.equal(minutesOf('09:00'), 540);
  assert.equal(minutesOf('9:00'), 540);
  assert.equal(minutesOf('9'), 540);
  assert.equal(minutesOf('9am'), 540);
  assert.equal(minutesOf('9 AM'), 540);
  assert.equal(minutesOf('2pm'), 840);
  assert.equal(minutesOf('12am'), 0);
  assert.equal(minutesOf('12pm'), 720);
  assert.equal(minutesOf('14:30'), 870);
  assert.equal(minutesOf('23:59'), 1439);
  // Not times.
  assert.equal(minutesOf(''), null);
  assert.equal(minutesOf('all day'), null);
  assert.equal(minutesOf('25:00'), null);
  assert.equal(minutesOf(undefined), null);
});

test('spanOf: an event with no end still has a length', () => {
  assert.deepEqual(spanOf(at('09:00')), { start: 540, end: 600 });
  assert.deepEqual(spanOf(at('09:00 – 10:30')), { start: 540, end: 630 });
  assert.deepEqual(spanOf(at('09:00-10:30')), { start: 540, end: 630 });
  assert.deepEqual(spanOf(at('9am to 11am')), { start: 540, end: 660 });
  // Nothing to go on: that is an all-day event, and says so by being null.
  assert.equal(spanOf(at('')), null);
  assert.equal(spanOf({ title: 'Birthday' }), null);
  // An end before its start is a typo or a midnight crossing; an hour either
  // way, because a bar of negative length is not a drawing of anything.
  assert.deepEqual(spanOf(at('23:30 – 00:30')), { start: 1410, end: 1440 });
});

test('the day is ordered, and all-day events come first', () => {
  const shape = dayShape([at('14:00'), { id: 'b', title: 'Bin day', time: '' }, at('09:00')]);
  assert.deepEqual(shape.rows.map((r) => r.event.title), ['Bin day', '09:00', '14:00']);
});

test('events that overlap are still ordered by when they start', () => {
  const shape = dayShape([at('10:00 – 10:30'), at('09:00 – 13:00'), at('14:00')]);
  assert.deepEqual(shape.rows.map((r) => r.event.title), ['09:00 – 13:00', '10:00 – 10:30', '14:00']);
});

test('on another day there is nothing lit and no states', () => {
  const shape = dayShape([at('09:00'), at('14:00')]);
  assert.equal(shape.onNow, null);
  assert.equal(shape.next, null);
  assert.deepEqual([...new Set(shape.rows.map((r) => r.state))], ['plain']);
});

test('between two events, the one behind you steps back and the one ahead is next', () => {
  // 11:30, between a morning meeting and an afternoon one.
  const shape = dayShape([at('09:00 – 10:00'), at('14:00')], { now: 690 });
  assert.deepEqual(shape.rows.map((r) => [r.event.title, r.state]), [
    ['09:00 – 10:00', 'past'],
    ['14:00', 'next'],
  ]);
  assert.equal(shape.onNow, null);
  assert.equal(shape.next.title, '14:00');
});

test('what is on now is lit, and is the only marker of where you are', () => {
  const shape = dayShape([at('09:00 – 10:00'), at('11:00 – 12:00'), at('15:00')], { now: 690 }); // 11:30
  assert.equal(shape.onNow.title, '11:00 – 12:00');
  assert.deepEqual(
    shape.rows.map((r) => [r.event.title, r.state]),
    [['09:00 – 10:00', 'past'], ['11:00 – 12:00', 'now'], ['15:00', 'ahead']],
  );
  // And "next" is not interesting while something is on.
  assert.equal(shape.next.title, '15:00');
});

test('before the day starts, and after it is over', () => {
  const early = dayShape([at('09:00'), at('14:00')], { now: 420 }); // 07:00
  assert.deepEqual(early.rows.map((r) => r.state), ['next', 'ahead']);

  const late = dayShape([at('09:00'), at('14:00')], { now: 1200 }); // 20:00
  assert.equal(late.next, null);
  assert.deepEqual(late.rows.map((r) => r.state), ['past', 'past']);
});

test('an empty day is an empty shape, not a crash', () => {
  const shape = dayShape([], { now: 600 });
  assert.deepEqual(shape.rows, []);
  assert.equal(shape.onNow, null);
  assert.equal(shape.next, null);
  assert.deepEqual(dayShape(undefined).rows, []);
});

test('an all-day event is just the day, with no time against it', () => {
  const shape = dayShape([{ id: 'x', title: 'Bank holiday', time: '' }], { now: 600 });
  assert.deepEqual(shape.rows.map((r) => r.state), ['allday']);
});
