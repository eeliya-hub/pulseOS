import assert from 'node:assert/strict';
import test from 'node:test';
import { datesOf, dress, nothingFound, sourceOf } from '../findings.js';

/** The email every case here is read out of: sent Tuesday 6 October 2026. */
const MESSAGE = {
  id: 'm1',
  accountId: 'google-someone',
  date: '2026-10-06T09:14:00.000Z',
  subject: 'Design review moved + Q4 deck',
  from: { name: 'Priya Raman', email: 'priya@northgate.co.uk' },
};

test('a quoted weekday becomes a date, and says where it came from', () => {
  const out = datesOf({ dateText: 'Thursday' }, MESSAGE);
  assert.equal(out.due, '2026-10-08');
  assert.equal(out.dateFrom, 'Thursday');
});

test('a time makes it not an all-day thing, and gets an hour if it has no end', () => {
  const out = datesOf({ dateText: 'Thursday', startText: '2:30pm' }, MESSAGE);
  assert.equal(out.start, '14:30');
  assert.equal(out.end, '15:30');
  assert.equal(out.allDay, false);
});

test('an end that was given is kept', () => {
  const out = datesOf({ dateText: 'Thursday', startText: '2:30pm', endText: '4pm' }, MESSAGE);
  assert.equal(out.end, '16:00');
});

test('a date with no time at all is an all-day thing', () => {
  // "The deadline is 3 November" means the day, not nine in the morning.
  const out = datesOf({ dateText: '3 November' }, MESSAGE);
  assert.equal(out.due, '2026-11-03');
  assert.equal(out.allDay, true);
});

test('a model contradicting itself is resolved towards the time it quoted', () => {
  // `allDay: true` beside a start time is nonsense; the time came from the
  // email and the flag came from the model, so the time wins.
  const out = datesOf({ dateText: 'Thursday', startText: '14:30', allDay: true }, MESSAGE);
  assert.equal(out.allDay, false);
});

test('words that are not a date leave no date, and still say what they were', () => {
  const out = datesOf({ dateText: 'as soon as you can' }, MESSAGE);
  assert.equal(out.due, undefined);
  assert.equal(out.dateFrom, 'as soon as you can');
  // With no date there is nothing to be all-day about.
  assert.equal(out.allDay, undefined);
});

test('a finding with no date at all is left alone', () => {
  assert.deepEqual(datesOf({ title: 'Reply to Priya' }, MESSAGE), {});
  assert.deepEqual(datesOf(null, MESSAGE), {});
});

test('a whole answer, dressed', () => {
  const found = dress(
    {
      summary: 'Priya moved the review and wants the Q4 deck.',
      replyNeeded: true,
      replyWhy: 'to confirm the new time works',
      events: [
        { title: 'Design review', dateText: 'Thursday', startText: '2:30pm', location: 'Southbank room', confidence: 'high' },
        // The empty entry a model returns instead of an empty list.
        { title: '   ', dateText: 'Friday', confidence: 'low' },
      ],
      tasks: [{ title: 'Send Priya the Q4 deck', dateText: 'end of day Friday', confidence: 'high' }],
      deadlines: [{ what: 'Board papers', dateText: '3 November', confidence: 'high' }],
      people: [{ name: 'Priya Raman', role: 'sender' }, { name: '' }],
    },
    MESSAGE,
  );

  assert.equal(found.events.length, 1, 'the blank event is dropped');
  assert.equal(found.events[0].due, '2026-10-08');
  assert.equal(found.events[0].start, '14:30');
  assert.equal(found.events[0].location, 'Southbank room');

  assert.equal(found.tasks[0].due, '2026-10-09');
  assert.equal(found.tasks[0].dateFrom, 'end of day Friday');

  assert.equal(found.deadlines[0].due, '2026-11-03');

  assert.equal(found.people.length, 1, 'the nameless person is dropped');
  assert.equal(found.replyNeeded, true);
  assert.equal(nothingFound(found), false);
});

test('an email with nothing in it dresses to empty lists, not to nulls', () => {
  const found = dress({ summary: 'A receipt.', replyNeeded: false }, MESSAGE);
  assert.deepEqual(found.events, []);
  assert.deepEqual(found.tasks, []);
  assert.deepEqual(found.deadlines, []);
  assert.deepEqual(found.people, []);
  assert.equal(found.replyNeeded, false);
  assert.equal(nothingFound(found), true);
});

test('a model that returned nothing at all does not throw', () => {
  const found = dress(null, MESSAGE);
  assert.equal(found.summary, '');
  assert.deepEqual(found.events, []);
  assert.equal(nothingFound(found), true);
});

/*
 * The crash that stopped every proposal before its card could appear: `from`
 * was handed the message's address OBJECT, which React refuses to render.
 */
test('the source line is text, never the address object', () => {
  const source = sourceOf(MESSAGE);
  assert.equal(typeof source.from, 'string');
  assert.equal(source.from, 'Priya Raman');
  assert.equal(source.subject, 'Design review moved + Q4 deck');
  assert.equal(source.messageId, 'm1');
  assert.equal(source.accountId, 'google-someone');

  // No name on the address: the address itself, still a string.
  assert.equal(sourceOf({ from: { email: 'noreply@x.com' } }).from, 'noreply@x.com');
  // Nothing at all: an empty string, which renders as nothing.
  assert.equal(sourceOf({}).from, '');
  assert.equal(sourceOf(null).from, '');
});
