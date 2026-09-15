// All-day dates are calendar days, not instants — "24 August" means the 24th
// whatever the server's timezone is. Passing one through `new Date(...)` and
// then reading UTC fields (or calling toISOString()) applies the offset and,
// east of UTC, lands the event on the previous day. These helpers keep all-day
// values as plain `YYYY-MM-DD` text so no offset is ever applied.

const pad = (n) => String(n).padStart(2, '0');
const ymdLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdUTC = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * The calendar day an all-day value refers to, as `YYYY-MM-DD`.
 *
 * - A string that carries no zone ("2026-08-24", "2026-08-24T00:00:00") already
 *   states the day — it is read straight off the text.
 * - A Date at exactly midnight UTC means that UTC day (how `Z` values and some
 *   recurrence expansions arrive).
 * - Any other Date came from parsing a floating date in local time (node-ical
 *   builds all-day values as local midnight), so its local fields hold the day.
 */
export function allDayKey(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    const zoned = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (m && !zoned) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const atUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return atUtcMidnight ? ymdUTC(d) : ymdLocal(d);
}

// Shift a `YYYY-MM-DD` key by whole days. Uses UTC arithmetic on a date-only
// value, so it can't be nudged across a boundary by a DST change.
export function addDays(key, days) {
  if (!key) return null;
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymdUTC(d);
}

// Whole days between two `YYYY-MM-DD` keys (b − a), never negative.
export function daysBetween(a, b) {
  if (!a || !b) return 0;
  const diff = (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : 0;
}

// `YYYY-MM-DD` → the compact `YYYYMMDD` form iCalendar uses for VALUE=DATE.
export const compactDay = (key) => (key ? key.replace(/-/g, '') : null);
