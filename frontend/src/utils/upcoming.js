import { loadedUntil } from '../hooks/useCalendarEvents.js';
import { calendarColor, dateKey, keyToDate, occursOn } from '../hooks/useLifeData.js';

// Start-of-event helpers for the "Upcoming" list.
const timesOf = (t) => (t || '').match(/\d{1,2}:\d{2}/g) ?? [];
const firstTime = (t) => timesOf(t)[0] || '';
const toMinutes = (t) => {
  const m = firstTime(t);
  if (!m) return 0;
  const [h, mm] = m.split(':').map(Number);
  return h * 60 + mm;
};
const endMinutes = (t) => {
  const times = timesOf(t);
  if (times.length < 2) return null;
  const [h, mm] = times[times.length - 1].split(':').map(Number);
  return h * 60 + mm;
};
export const normTitle = (title) => (title || '').trim().toLowerCase();

export const relDay = (offset, key) =>
  offset === 0
    ? 'Today'
    : keyToDate(key).toLocaleDateString('en-GB', offset < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });

// Full date, e.g. "Tue 7 Jun".
export const dateLabel = (key) =>
  keyToDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// Human countdown to an occurrence ("in 40m", "in 3h", "in 5d").
export function startsIn(offset, time, now) {
  const [h, m] = (time || '00:00').split(':').map(Number);
  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h || 0, m || 0);
  const diff = when - now;
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
  const dys = Math.round(hrs / 24);
  return `in ${dys} day${dys === 1 ? '' : 's'}`;
}

// Flatten local + connected events into a single time-ordered list of upcoming
// occurrences (recurring events expand to each date, so shifts show individually).
//
// It looks as far ahead as the calendar is loaded. A fixed 75 days hid anything
// further out — an appointment in December, seen from September — even though the
// events were sitting right there.
// A subscribed public-holiday calendar (Google's "Holidays in United Kingdom" and
// the like). Its days are reference, not plans: left in, Halloween and Remembrance
// Sunday took the few Upcoming slots ahead of the user's actual appointments.
const isHolidayCalendar = (calendarId) => /#holiday@group\.v\.calendar\.google\.com$/.test(calendarId || '');

export function buildUpcoming(events, now, until = loadedUntil()) {
  const days = Math.ceil((until - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(now);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(d);
    for (const e of events) {
      if (!occursOn(e, key)) continue;
      // Holidays still show on the day itself, and always on the Life Hub calendar.
      if (i > 0 && isHolidayCalendar(e.calendarId)) continue;
      const t = firstTime(e.time);
      const allDay = !t;
      const mins = toMinutes(e.time);
      if (key === todayKey && !allDay && (endMinutes(e.time) ?? mins) < nowMin) continue;
      out.push({
        id: `${e.id}:${key}`,
        sourceId: e.id,
        key,
        offset: i,
        time: t,
        timeLabel: (e.time || '').trim(), // full "HH:MM – HH:MM" (start–finish) when present
        allDay,
        sortVal: i * 10000 + mins,
        title: e.title,
        meta: e.place || e.calendarName || '',
        color: e.color || calendarColor(e.calendar),
      });
    }
  }
  return out.sort((a, b) => a.sortVal - b.sortVal);
}

export function uniqueEventChoices(upcoming) {
  const seen = new Set();
  return upcoming.filter((event) => {
    const key = normTitle(event.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
