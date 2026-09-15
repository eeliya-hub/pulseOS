import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chooseKeeper,
  distinctEvents,
  eventWindow,
  findDuplicate,
  narrowEvents,
  normalizeDate,
  normalizeTime,
} from '../calendarInput.js';
import { batchCaption, toolCaption } from '../toolCaptions.js';

const local = (iso) => {
  const d = new Date(iso);
  return { day: d.getDate(), month: d.getMonth() + 1, hour: d.getHours(), minute: d.getMinutes() };
};

describe('normalizeTime — the times a model actually sends', () => {
  const cases = [
    ['15:40', '15:40'],
    ['15:40:00', '15:40'],
    ['3:40 pm', '15:40'],
    ['3:40PM', '15:40'],
    ['3pm', '15:00'],
    ['10 a.m.', '10:00'],
    ['12am', '00:00'],
    ['12pm', '12:00'],
    ['1540', '15:40'],
    ['940', '09:40'],
    ['9', '09:00'],
    ['9.30', '09:30'],
    ['noon', '12:00'],
    ['midnight', '00:00'],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => assert.equal(normalizeTime(input), expected));
  }

  it('rejects things that are not times', () => {
    for (const bad of ['25:00', '13pm', '0am', '10:75', 'soon', '', null, undefined]) {
      assert.equal(normalizeTime(bad), null, `${JSON.stringify(bad)} should be rejected`);
    }
  });
});

describe('normalizeDate', () => {
  it('accepts a day, or the date part of an instant', () => {
    assert.equal(normalizeDate('2026-12-11'), '2026-12-11');
    assert.equal(normalizeDate('2026-12-11T15:40:00Z'), '2026-12-11');
    assert.equal(normalizeDate('2026-2-3'), '2026-02-03');
  });

  it('refuses a day that does not exist instead of rolling it forward', () => {
    assert.equal(normalizeDate('2026-02-31'), null);
    assert.equal(normalizeDate('2026-11-31'), null);
  });

  it('refuses other formats', () => {
    assert.equal(normalizeDate('11/12/2026'), null);
    assert.equal(normalizeDate('tomorrow'), null);
  });
});

describe('eventWindow', () => {
  it('gives a timed event an hour by default, in local time', () => {
    const w = eventWindow({ date: '2026-12-11', startTime: '3:40 pm' });
    assert.equal(w.allDay, false);
    assert.equal(w.startTime, '15:40');
    assert.equal(w.endTime, '16:40');
    assert.deepEqual(local(w.start), { day: 11, month: 12, hour: 15, minute: 40 });
  });

  it('keeps a given length when there is no end time', () => {
    const w = eventWindow({ date: '2026-10-30', startTime: '10:00', durationMinutes: 45 });
    assert.equal(w.endTime, '10:45');
  });

  it('runs an end that falls before the start past midnight', () => {
    const w = eventWindow({ date: '2026-10-30', startTime: '23:00', endTime: '01:00' });
    assert.equal(w.endDate, '2026-10-31');
    assert.deepEqual(local(w.end), { day: 31, month: 10, hour: 1, minute: 0 });
  });

  it('writes an all-day event with an exclusive end, the day after', () => {
    const w = eventWindow({ date: '2026-12-25' });
    assert.equal(w.allDay, true);
    assert.equal(w.start, '2026-12-25T00:00:00');
    assert.equal(w.end, '2026-12-26T00:00:00');
  });

  it('reads an end date as the last day, inclusive', () => {
    // A conference "from the 1st to the 3rd" covers three days.
    const w = eventWindow({ date: '2026-10-01', endDate: '2026-10-03' });
    assert.equal(w.end, '2026-10-04T00:00:00');
    assert.equal(w.endDate, '2026-10-03');
  });

  it('crosses a month boundary correctly', () => {
    assert.equal(eventWindow({ date: '2026-10-31' }).end, '2026-11-01T00:00:00');
  });

  it('explains what is wrong instead of writing something broken', () => {
    assert.match(eventWindow({ date: 'next friday' }).error, /YYYY-MM-DD/);
    assert.match(eventWindow({ date: '2026-12-11', startTime: 'lunchtime' }).error, /HH:MM/);
    assert.match(eventWindow({ date: '2026-12-11', endDate: '2026-12-10' }).error, /before it starts/);
  });

  it('treats all_day as all-day even if a time slipped in', () => {
    assert.equal(eventWindow({ date: '2026-12-11', startTime: '09:00', allDay: true }).allDay, true);
  });
});

describe('findDuplicate', () => {
  const at = (key, hm) => {
    const [y, m, d] = key.split('-').map(Number);
    const [h, mi] = hm.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).toISOString();
  };
  const existing = [
    { title: 'Orthodontic Appointment', startISO: at('2026-12-11', '15:40'), allDay: false, date: '2026-12-11', calendarId: 'home' },
    { title: 'Bank holiday', startISO: '2026-12-28T00:00:00', allDay: true, date: '2026-12-28', calendarId: 'home' },
  ];

  it('catches the same event asked for again, however it is written', () => {
    const hit = findDuplicate(existing, {
      title: 'orthodontic appointment!',
      start: at('2026-12-11', '15:40'),
      allDay: false,
      date: '2026-12-11',
      calendarId: 'home',
    });
    assert.ok(hit);
  });

  it('does not call a different time a duplicate', () => {
    const hit = findDuplicate(existing, {
      title: 'Orthodontic Appointment',
      start: at('2026-12-11', '16:10'),
      allDay: false,
      date: '2026-12-11',
      calendarId: 'home',
    });
    assert.equal(hit, null);
  });

  it('does not call the same thing on another calendar a duplicate', () => {
    const hit = findDuplicate(existing, {
      title: 'Orthodontic Appointment',
      start: at('2026-12-11', '15:40'),
      allDay: false,
      date: '2026-12-11',
      calendarId: 'work',
    });
    assert.equal(hit, null);
  });

  it('matches all-day events by day', () => {
    const hit = findDuplicate(existing, { title: 'Bank Holiday', allDay: true, date: '2026-12-28', calendarId: 'home' });
    assert.ok(hit);
  });
});

describe('choosing what a change or deletion touches', () => {
  const events = [
    { title: 'Orthodontic Appointment', date: '2026-12-11', startISO: new Date(2026, 11, 11, 15, 40).toISOString(), calendarName: 'Home', eventId: 'a', providerUrl: 'a.ics', location: '' },
    { title: 'Orthodontic Appointment', date: '2026-12-11', startISO: new Date(2026, 11, 11, 15, 40).toISOString(), calendarName: 'Home', eventId: 'b', providerUrl: 'b.ics', location: 'William Harvey Hospital' },
    { title: 'Orthodontic Appointment', date: '2026-10-30', startISO: new Date(2026, 9, 30, 10, 0).toISOString(), calendarName: 'Home', eventId: 'c', providerUrl: 'c.ics', location: 'William Harvey Hospital' },
    { title: 'Gym', date: '2026-12-11', startISO: new Date(2026, 11, 11, 7, 0).toISOString(), calendarName: 'Personal', eventId: 'g1', recurringEventId: 'gym', providerUrl: 'gym.ics' },
    { title: 'Gym', date: '2026-12-12', startISO: new Date(2026, 11, 12, 7, 0).toISOString(), calendarName: 'Personal', eventId: 'g2', recurringEventId: 'gym', providerUrl: 'gym.ics' },
  ];

  it('narrows by day, time and calendar', () => {
    assert.equal(narrowEvents(events, { title: 'orthodontic' }).length, 3);
    assert.equal(narrowEvents(events, { title: 'orthodontic', date: '2026-12-11' }).length, 2);
    assert.equal(narrowEvents(events, { title: 'orthodontic', atTime: '10am' }).length, 1);
    assert.equal(narrowEvents(events, { title: 'gym', calendar: 'home' }).length, 0);
  });

  it('counts a repeating event once when no day was named', () => {
    const gym = narrowEvents(events, { title: 'gym' });
    assert.equal(distinctEvents(gym, { series: true }).length, 1);
    assert.equal(distinctEvents(gym, { series: false }).length, 2);
  });

  it('keeps the copy that carries the most detail', () => {
    const copies = narrowEvents(events, { title: 'orthodontic', date: '2026-12-11' });
    assert.equal(chooseKeeper(copies).eventId, 'b');
  });
});

describe('batch captions', () => {
  it('counts a run of the same action', () => {
    const two = [{ name: 'create_calendar_event', args: {} }, { name: 'create_calendar_event', args: {} }];
    assert.equal(batchCaption(two), 'Adding 2 events');
    assert.equal(batchCaption(Array.from({ length: 4 }, () => ({ name: 'add_task', args: {} }))), 'Adding 4 tasks');
  });

  it('says how many things when the actions differ', () => {
    assert.equal(batchCaption([{ name: 'add_task' }, { name: 'create_calendar_event' }]), 'Doing 2 things');
  });

  it('treats several lookups as one piece of work', () => {
    assert.equal(batchCaption([{ name: 'get_today' }, { name: 'get_weather' }, { name: 'get_news' }]), 'Pulling that together');
  });

  it('describes a single call by its subject', () => {
    assert.equal(batchCaption([{ name: 'add_task', args: { text: 'Unpack from holiday' } }]), 'Adding “Unpack from holiday”');
    assert.equal(toolCaption('get_weather', { location: 'Paris' }), 'Checking the weather in Paris');
    assert.equal(batchCaption([]), '');
  });
});
