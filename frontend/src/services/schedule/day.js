/**
 * The shape of one day.
 *
 * A list of events in the order they were stored is not a day. This puts them
 * in the order they happen, puts the all-day ones at the top where they belong,
 * and works out where the clock stands against each of them — so the thing you
 * are in the middle of can be lit, and the morning you have already had can
 * step back.
 *
 * Every bit of it is arithmetic over strings, which is why it is here and not
 * in the view: it is the part that can be wrong, so it is the part under test.
 *
 * `event.time` is free text in this app, because that is what the calendar
 * sources and the user's own typing both produce: '09:00', '9am', '14:00 –
 * 15:30', '' for all day. Anything unparseable is treated as all day, which is
 * where an event with no time belongs anyway.
 */

/** Minutes past midnight, from however the time was written. */
export function minutesOf(text) {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(String(text ?? '').trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  // '9' alone is nine in the morning; a bare number past 23 is not a time.
  return hour * 60 + minute;
}

/**
 * The start and end of an event, in minutes, or null for an all-day one.
 *
 * An event with no end is treated as lasting an hour — not because it does,
 * but because every calendar in the world draws it that way and the gap either
 * side of it has to come from somewhere.
 */
export function spanOf(event) {
  const text = String(event?.time ?? '').trim();
  if (!text) return null;
  const [first, second] = text.split(/\s*(?:–|—|-|to)\s*/i);
  const start = minutesOf(first);
  if (start === null) return null;
  const end = second ? minutesOf(second) : null;
  // An end before its start has crossed midnight — or is a typo. Either way an
  // hour is a safer drawing than a negative length.
  return { start, end: end !== null && end > start ? end : Math.min(start + 60, 24 * 60) };
}

/**
 * The day as rows.
 *
 * @param {Array} events   the day's events, any order
 * @param {object} options
 * @param {number|null} options.now minutes past midnight, or null if the day
 *                                  being read is not today
 * @returns {{rows: Array, onNow: object|null, next: object|null}}
 *   rows are `{event, state}` in reading order; `state` is where the clock
 *   stands against each — 'now', 'next', 'past', 'ahead', 'allday', or
 *   'plain' on any day that is not today.
 */
export function dayShape(events, { now = null } = {}) {
  const timed = [];
  const allDay = [];
  for (const event of events ?? []) {
    const span = spanOf(event);
    if (span) timed.push({ event, ...span });
    else allDay.push({ event });
  }
  timed.sort((a, b) => a.start - b.start || a.end - b.end);

  /*
   * What is on, and what is up next.
   *
   * "On now" is the event the clock is inside. "Next" is the first one that has
   * not started — and it is only interesting when nothing is on, because being
   * told what is next while you are sitting in a meeting is noise.
   */
  const onNow = now === null ? null : timed.find((row) => row.start <= now && now < row.end) ?? null;
  const next = now === null ? null : timed.find((row) => row.start > now) ?? null;

  const state = (row) => {
    if (now === null) return 'plain';
    if (row === onNow) return 'now';
    if (row.end <= now) return 'past';
    // Only ever one row raised: while something is on, the thing after it is
    // just the thing after it. `next` is still reported, for the line in the
    // sky that has room to say both.
    if (row === next && !onNow) return 'next';
    return 'ahead';
  };

  const rows = [
    ...allDay.map((row) => ({ event: row.event, state: 'allday' })),
    ...timed.map((row) => ({ event: row.event, state: state(row) })),
  ];

  return { rows, onNow: onNow?.event ?? null, next: next?.event ?? null };
}
