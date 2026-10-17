// Shared mapping of parsed iCalendar (node-ical output) → normalized events,
// with recurrence (RRULE) expansion inside a time window. Used by both the iCal
// URL provider and the Apple CalDAV provider.
import { addDays, allDayKey, daysBetween } from './dayKey.js';

const DAY = 86_400_000;
const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * The text of an iCalendar property.
 *
 * node-ical hands a property back as a plain string UNTIL it carries
 * parameters, at which point it becomes `{ params, val }` instead. So
 * `SUMMARY:Team standup` is a string and `SUMMARY;LANGUAGE=en-GB:Team standup`
 * is an object — same property, same feed, different shape, decided by markup
 * nobody looking at their calendar can see.
 *
 * Passing that through put an object where every view expects a title, and the
 * first one to try to draw it took the whole panel down with "Objects are not
 * valid as a React child". It showed up on paging back through the months,
 * because that is when a wider range is fetched and an older event with a
 * language tag on it finally came into view.
 */
function text(value) {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.val === 'string') return value.val;
  return String(value);
}

export function eventsFromParsed(parsed, { timeMin, timeMax, source = 'ical' } = {}) {
  const start = timeMin ? new Date(timeMin) : new Date(Date.now() - DAY);
  const end = timeMax ? new Date(timeMax) : new Date(Date.now() + 60 * DAY);

  const out = [];
  for (const entry of Object.values(parsed ?? {})) {
    if (entry?.type !== 'VEVENT') continue;

    const allDay = entry.datetype === 'date';
    const base = {
      title: text(entry.summary),
      description: text(entry.description),
      location: text(entry.location),
      allDay,
      recurring: Boolean(entry.rrule),
      uid: text(entry.uid),
      source,
    };
    const durationMs =
      entry.end && entry.start ? new Date(entry.end).getTime() - new Date(entry.start).getTime() : 0;

    // All-day events are emitted as bare `YYYY-MM-DD` days (same shape Google
    // returns, end exclusive). node-ical hands them over as *local* midnight, so
    // running them through toISOString() would shift them a day back east of UTC.
    const startKey = allDay ? allDayKey(entry.start) : null;
    const spanDays = allDay ? Math.max(1, daysBetween(startKey, allDayKey(entry.end) ?? startKey)) : 0;

    if (entry.rrule) {
      const excluded = new Set(Object.values(entry.exdate ?? {}).map((d) => new Date(d).getTime()));
      for (const dt of entry.rrule.between(start, end, true)) {
        if (excluded.has(dt.getTime())) continue;
        const dayKey = allDay ? allDayKey(dt) : null;
        out.push({
          ...base,
          id: `${base.uid}-${dt.getTime()}`,
          start: allDay ? dayKey : iso(dt),
          end: allDay ? addDays(dayKey, spanDays) : iso(new Date(dt.getTime() + durationMs)),
        });
      }
    } else if (entry.start) {
      const s = new Date(entry.start);
      const e = entry.end ? new Date(entry.end) : s;
      if (e >= start && s <= end) {
        out.push({
          ...base,
          id: base.uid,
          start: allDay ? startKey : iso(s),
          end: allDay ? addDays(startKey, spanDays) : iso(e),
        });
      }
    }
  }
  return out;
}
