import assert from 'node:assert/strict';
import test from 'node:test';
import { anHourAfter, isPast, keyOf, readDate, resolveDate, resolveTime } from '../dates.js';

/*
 * The case that started all of this: an email sent on Tuesday 6 October 2026
 * saying "Thursday's design review". The model put it on the Wednesday once and
 * eight days out the next time. These are the dates it must land on instead.
 */
const SENT = '2026-10-06T09:14:00.000Z'; // Tuesday
const NOW = new Date('2026-10-08T21:40:00'); // Wednesday
const on = (phrase) => resolveDate(phrase, { sentAt: SENT, now: NOW });

test('a bare weekday is the one after the email was sent', () => {
  assert.equal(on('Thursday'), '2026-10-08');
  assert.equal(on("Thursday's design review"), '2026-10-08');
  assert.equal(on('end of day Friday'), '2026-10-09');
  // The day it was sent, named, is that same day rather than a week later.
  assert.equal(on('Tuesday'), '2026-10-06');
});

test('"next" jumps the week', () => {
  assert.equal(on('next Thursday'), '2026-10-15');
  assert.equal(on('this Thursday'), '2026-10-08');
  assert.equal(on('coming Monday'), '2026-10-12');
});

test('today and tomorrow are relative to the email, not to now', () => {
  assert.equal(on('today'), '2026-10-06');
  assert.equal(on('tomorrow'), '2026-10-07');
  assert.equal(on('by end of day'), '2026-10-06');
  // "end of day Friday" must read as the Friday, not as the sending day.
  assert.notEqual(on('end of day Friday'), on('by end of day'));
});

test('a day and a month, with the year left out', () => {
  assert.equal(on('3 November'), '2026-11-03');
  assert.equal(on('3rd Nov'), '2026-11-03');
  assert.equal(on('November 3'), '2026-11-03');
  assert.equal(on('the 15th of March'), '2027-03-15'); // already gone in 2026
  assert.equal(on('1 October'), '2026-10-01'); // within the month: stays put
  assert.equal(on('3 November 2028'), '2028-11-03');
});

test('numeric dates read day-first', () => {
  assert.equal(on('15/03/2027'), '2027-03-15');
  assert.equal(on('09/12'), '2026-12-09');
});

test('offsets and loose ends of periods', () => {
  assert.equal(on('in 3 days'), '2026-10-09');
  assert.equal(on('in two weeks'), '2026-10-20');
  assert.equal(on('within a week'), '2026-10-13');
  assert.equal(on('end of the week'), '2026-10-09'); // the coming Friday
  assert.equal(on('end of the month'), '2026-10-31');
  assert.equal(on('next month'), '2026-11-01');
});

test('an ISO date is taken as given', () => {
  assert.equal(on('2026-12-25'), '2026-12-25');
  assert.equal(on('due 2027-01-04 at the latest'), '2027-01-04');
});

test('what is not a date returns null rather than a guess', () => {
  for (const phrase of ['soon', 'ASAP', 'when you get a chance', 'at your earliest convenience', '', null, undefined]) {
    assert.equal(on(phrase), null, `${JSON.stringify(phrase)} should not resolve`);
  }
  // A day that does not exist in that month.
  assert.equal(on('31 February'), null);
});

test('falls back to today when the email has no date on it', () => {
  assert.equal(resolveDate('tomorrow', { now: NOW }), '2026-10-09');
});

test('times, however they were written', () => {
  assert.equal(resolveTime('14:30'), '14:30');
  assert.equal(resolveTime('2:30pm'), '14:30');
  assert.equal(resolveTime('2.30 pm'), '14:30');
  assert.equal(resolveTime('2pm'), '14:00');
  assert.equal(resolveTime('9am'), '09:00');
  assert.equal(resolveTime('09:00'), '09:00');
  assert.equal(resolveTime('noon'), '12:00');
  assert.equal(resolveTime('midnight'), '00:00');
  assert.equal(resolveTime('12am'), '00:00');
  assert.equal(resolveTime('12pm'), '12:00');
  // The model sometimes answers with seconds; the time input will not take them.
  assert.equal(resolveTime('14:30:00'), '14:30');
  // A bare working-day hour reads as the afternoon.
  assert.equal(resolveTime('at 3'), '15:00');
  assert.equal(resolveTime('at 9'), '09:00');
  assert.equal(resolveTime('whenever'), null);
  assert.equal(resolveTime(''), null);
});

test('an hour after, for an event given only a start', () => {
  assert.equal(anHourAfter('14:30'), '15:30');
  assert.equal(anHourAfter('23:30'), '23:30'); // clamped rather than wrapped
  assert.equal(anHourAfter(''), null);
});

test('dates read back the way someone can check them', () => {
  assert.equal(readDate('2026-10-08', NOW), 'today');
  assert.equal(readDate('2026-10-09', NOW), 'tomorrow');
  assert.equal(readDate('2026-10-07', NOW), 'yesterday');
  assert.equal(readDate('2026-10-15', NOW), 'Thursday 15 October');
  assert.equal(readDate('2027-03-15', NOW), 'Monday 15 March 2027');
  assert.equal(readDate(null, NOW), null);
});

test('a date that has gone is known to have gone', () => {
  assert.equal(isPast('2026-10-07', NOW), true);
  assert.equal(isPast('2026-10-08', NOW), false);
  assert.equal(isPast('2026-10-09', NOW), false);
  assert.equal(isPast(null, NOW), false);
});

test('keyOf is local, not UTC', () => {
  // A late-evening date must not roll forward a day through a UTC conversion.
  assert.equal(keyOf(new Date('2026-10-08T23:30:00')), '2026-10-08');
});
