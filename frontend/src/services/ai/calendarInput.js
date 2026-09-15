/**
 * What the assistant asks for → a calendar write that cannot go subtly wrong.
 *
 * Every rule about interpreting a request lives here: reading the times a model
 * actually produces ("3:40 pm", "1540"), working out where an event ends, spotting
 * that an event is already on the calendar, and choosing which events a change or
 * a deletion should touch. Pure — no network, no stores — so each rule is tested
 * on its own rather than discovered in someone's calendar.
 */

const pad = (n) => String(n).padStart(2, '0');

/** A local date → "YYYY-MM-DD". */
export const dayKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** A local instant → "HH:MM". */
export const clockOf = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export function addDaysToKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKeyOf(new Date(y, m - 1, d + days));
}

/** "2026-12-11" or the date part of an ISO instant → "2026-12-11". Null if it isn't a real day. */
export function normalizeDate(value) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(y, m - 1, d);
  // Rejects the 31st of a 30-day month rather than quietly rolling it forward.
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Any way a model writes a clock time → "HH:MM" (24h). Null if it isn't one.
 *
 * The tools ask for HH:MM, and mostly get it — but "3:40 pm", "15:40:00" and
 * "1540" all turn up, and each used to become an Invalid Date and a failed write
 * the user never heard about.
 */
export function normalizeTime(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (text === 'noon' || text === 'midday') return '12:00';
  if (text === 'midnight') return '00:00';

  const meridiem = /(a\.?m\.?|p\.?m\.?)$/.exec(text)?.[1] ?? null;
  if (meridiem) text = text.slice(0, -meridiem.length).trim();

  let hour;
  let minute;
  let match = /^(\d{1,2})(?:[:.h](\d{2}))?(?::\d{2})?$/.exec(text);
  if (match) {
    hour = Number(match[1]);
    minute = match[2] ? Number(match[2]) : 0;
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(text))) {
    hour = Number(match[1]);
    minute = Number(match[2]);
  } else {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.startsWith('p') ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

const localInstant = (key, hm) => {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

const DEFAULT_MINUTES = 60;

/**
 * The start and end of an event, in the form the calendar backend takes.
 *
 * All-day events carry bare days with an EXCLUSIVE end — the day after the last
 * one — which is what both Google and CalDAV mean by it. Timed events carry
 * absolute instants resolved in this device's timezone. An end that falls at or
 * before the start, with no end date given, is read as running past midnight.
 * With no end at all, it runs `durationMinutes` (an hour by default) — which is
 * how an event that is moved keeps its length.
 *
 * Returns `{ error }` with a sentence the model can act on, or the window plus
 * the normalised values for reporting back.
 */
export function eventWindow({ date, startTime, endTime, endDate, allDay, durationMinutes } = {}) {
  const day = normalizeDate(date);
  if (!day) return { error: `"${date}" is not a date — use YYYY-MM-DD.` };

  const lastDay = endDate ? normalizeDate(endDate) : null;
  if (endDate && !lastDay) return { error: `"${endDate}" is not a date — use YYYY-MM-DD.` };
  if (lastDay && lastDay < day) return { error: `The event can't end (${lastDay}) before it starts (${day}).` };

  const start = startTime ? normalizeTime(startTime) : null;
  if (startTime && !start) return { error: `"${startTime}" is not a time — use HH:MM, 24-hour.` };
  const end = endTime ? normalizeTime(endTime) : null;
  if (endTime && !end) return { error: `"${endTime}" is not a time — use HH:MM, 24-hour.` };

  if (allDay || !start) {
    return {
      allDay: true,
      date: day,
      endDate: lastDay && lastDay > day ? lastDay : null,
      startTime: null,
      endTime: null,
      start: `${day}T00:00:00`,
      end: `${addDaysToKey(lastDay ?? day, 1)}T00:00:00`,
    };
  }

  const begins = localInstant(day, start);
  let ends;
  if (end) {
    ends = localInstant(lastDay ?? day, end);
    if (!lastDay && ends <= begins) ends = localInstant(addDaysToKey(day, 1), end);
    if (ends <= begins) return { error: `The event can't end at ${end} before it starts at ${start}.` };
  } else if (lastDay && lastDay > day) {
    ends = localInstant(lastDay, start);
  } else {
    ends = new Date(begins.getTime() + (durationMinutes > 0 ? durationMinutes : DEFAULT_MINUTES) * 60_000);
  }

  const endDay = dayKeyOf(ends);
  return {
    allDay: false,
    date: day,
    endDate: endDay !== day ? endDay : null,
    startTime: start,
    endTime: clockOf(ends),
    start: begins.toISOString(),
    end: ends.toISOString(),
  };
}

/** A title reduced to what identifies it: case, punctuation and spacing don't. */
export const titleKey = (title) =>
  String(title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * An event already on the calendar that this one would duplicate, or null.
 *
 * Same title (loosely), same calendar, same start — to the minute for a timed
 * event, the same day for an all-day one. A repeat request is the commonest way
 * duplicates happen: the voice gets interrupted, the confirmation is lost, and
 * the user reasonably asks again.
 *
 * `existing` uses the assistant's event shape: { title, startISO, allDay, date, calendarId }.
 */
export function findDuplicate(existing, { title, start, allDay, date, calendarId }) {
  const wanted = titleKey(title);
  if (!wanted) return null;
  const at = allDay ? null : new Date(start).getTime();
  return (
    (existing ?? []).find((event) => {
      if (titleKey(event.title) !== wanted) return false;
      if (calendarId && event.calendarId && event.calendarId !== calendarId) return false;
      if (allDay) return Boolean(event.allDay) && event.date === date;
      return !event.allDay && Math.abs(new Date(event.startISO).getTime() - at) < 60_000;
    }) ?? null
  );
}

/**
 * Narrow events matching a title down to the ones a request means: a date, a
 * start time, a calendar. Each filter applies only when given.
 */
export function narrowEvents(events, { title, date, atTime, calendar } = {}) {
  const needle = titleKey(title);
  const day = date ? normalizeDate(date) : null;
  const time = atTime ? normalizeTime(atTime) : null;
  const cal = (calendar ?? '').trim().toLowerCase();
  return (events ?? []).filter((event) => {
    if (needle && !titleKey(event.title).includes(needle)) return false;
    if (day && event.date !== day) return false;
    if (time && (event.allDay || clockOf(new Date(event.startISO)) !== time)) return false;
    if (cal && !(event.calendarName ?? '').toLowerCase().includes(cal)) return false;
    return true;
  });
}

/**
 * One entry per distinct event. Occurrences of a repeating event count as one
 * when `series` is set — deleting "the gym" with no date means the series — and
 * as separate events when a particular day was named.
 */
export function distinctEvents(events, { series = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const event of events ?? []) {
    const occurrence = `${event.providerUrl || event.eventId || event.ref}|${event.startISO}`;
    const key = series ? event.recurringEventId || event.providerUrl || event.eventId || occurrence : occurrence;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

/**
 * Of several copies of one event, the one worth keeping: the one carrying the
 * most — a location, notes, an end. Ties keep the earliest listed.
 */
export function chooseKeeper(events) {
  const weight = (e) => (e.location ? 2 : 0) + (e.description ? 1 : 0) + (e.endISO ? 0.5 : 0);
  return (events ?? []).reduce((best, event) => (best === null || weight(event) > weight(best) ? event : best), null);
}
