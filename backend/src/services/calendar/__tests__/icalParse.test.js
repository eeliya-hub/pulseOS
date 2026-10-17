import assert from 'node:assert/strict';
import test from 'node:test';
import { eventsFromParsed } from '../icalParse.js';

/**
 * The shape node-ical hands back changes with the markup.
 *
 * A property with no parameters is a string; the same property with one is
 * `{ params, val }`. Nothing downstream of this file should ever have to know
 * that, and for a while everything did — an object reached the views as a
 * title and killed the panel drawing it.
 */

const WINDOW = { timeMin: '2026-01-01T00:00:00Z', timeMax: '2027-01-01T00:00:00Z' };

const vevent = (patch) => ({
  type: 'VEVENT',
  uid: 'evt-1',
  summary: 'Team standup',
  start: new Date('2026-06-10T09:00:00Z'),
  end: new Date('2026-06-10T09:30:00Z'),
  ...patch,
});

test('a plain property comes through as itself', () => {
  const [event] = eventsFromParsed({ a: vevent() }, WINDOW);
  assert.equal(event.title, 'Team standup');
  assert.equal(event.id, 'evt-1');
});

test('a property with parameters is unwrapped, not handed on as an object', () => {
  const [event] = eventsFromParsed(
    {
      a: vevent({
        summary: { params: { LANGUAGE: 'en-GB' }, val: 'Team standup' },
        location: { params: { ALTREP: 'cid:part1' }, val: 'Room 2.14' },
        description: { params: {}, val: 'Bring the deck' },
        uid: { params: {}, val: 'evt-9' },
      }),
    },
    WINDOW,
  );
  assert.equal(event.title, 'Team standup');
  assert.equal(event.location, 'Room 2.14');
  assert.equal(event.description, 'Bring the deck');
  assert.equal(event.uid, 'evt-9');
  assert.equal(event.id, 'evt-9', 'the id is built from the unwrapped uid, not "[object Object]"');

  // The thing that actually broke: every one of these has to be drawable.
  for (const value of [event.title, event.location, event.description, event.uid, event.id]) {
    assert.equal(typeof value, 'string');
  }
});

test('a missing property stays missing rather than becoming "undefined"', () => {
  const [event] = eventsFromParsed({ a: vevent({ location: undefined, description: null }) }, WINDOW);
  assert.equal(event.location, undefined);
  assert.equal(event.description, undefined);
});

test('a repeating event wears the unwrapped uid on every occurrence', () => {
  const dates = [new Date('2026-06-10T09:00:00Z'), new Date('2026-06-17T09:00:00Z')];
  const events = eventsFromParsed(
    {
      a: vevent({
        uid: { params: {}, val: 'weekly-1' },
        summary: { params: { LANGUAGE: 'en' }, val: 'Standup' },
        rrule: { between: () => dates },
      }),
    },
    WINDOW,
  );
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.title), ['Standup', 'Standup']);
  assert.deepEqual(events.map((e) => e.id), dates.map((d) => `weekly-1-${d.getTime()}`));
});
