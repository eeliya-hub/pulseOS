/**
 * Turning the words an email uses about time into a date Pulse can act on.
 *
 * This exists because of a specific failure. Asking the model for a calendar
 * date worked perfectly in a short prompt and then, given a real email, put
 * "Thursday's design review" on the Wednesday — and on a second run, eight days
 * later. It is not a prompt that fixes that: a language model counting days
 * forward from a weekday name is doing arithmetic in the one place it has no
 * reason to be reliable, and no amount of "be careful" makes it so.
 *
 * So the work is split at the line each side is actually good at. The model
 * reads the email and copies out the words — "Thursday", "end of day Friday",
 * "3 November" — into `dateText`, which is quotation, not calculation. Then
 * this file does the calendar, deterministically, in code that can be tested.
 *
 * Phrases resolve against the day the EMAIL WAS SENT, not today. An email sent
 * on the Tuesday saying "Thursday" means that Thursday, whenever it is read —
 * and if that is now in the past, a task shown as overdue is the truth. The
 * review card lets the date be changed either way before anything is written.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** A local YYYY-MM-DD, which is what the planner and the date inputs use. */
export function keyOf(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dayStart = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const shift = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** The soonest `weekday` on or after `from`; `skip` jumps a further week. */
function onOrAfter(from, weekday, skip = false) {
  const delta = (weekday - from.getDay() + 7) % 7;
  return shift(from, delta + (skip ? 7 : 0));
}

const MONTH_NAMES = MONTHS.map((m) => m.slice(0, 3)).join('|');

/*
 * Weekdays as a closed list of the forms people actually write, longest first
 * so the alternation prefers "tuesday" over "tue".
 *
 * It is spelled out rather than built from three-letter stems because the stems
 * match inside other words: "end of the month" contains "mon", and a `mon[a-z]*`
 * pattern read it as Monday and put a month-end deadline on the 12th. Every
 * form here is anchored with \b at both ends, so "month", "Montreal" and
 * "sunset" cannot be weekdays.
 */
const WEEKDAY_NAMES = [
  'sundays', 'sunday', 'sun',
  'mondays', 'monday', 'mon',
  'tuesdays', 'tuesday', 'tues', 'tue',
  'wednesdays', 'wednesday', 'weds', 'wed',
  'thursdays', 'thursday', 'thurs', 'thur', 'thu',
  'fridays', 'friday', 'fri',
  'saturdays', 'saturday', 'sat',
].join('|');

const monthIndex = (word) => MONTHS.findIndex((m) => m.startsWith(String(word).slice(0, 3).toLowerCase()));
const weekdayIndex = (word) => WEEKDAYS.findIndex((d) => d.startsWith(String(word).slice(0, 3).toLowerCase()));

/**
 * The date a phrase from an email means, as YYYY-MM-DD, or null.
 *
 * Null is a real answer and the common one — "soon", "when you get a chance"
 * and "ASAP" are not dates, and inventing one for them would be worse than
 * leaving the field empty for the user to fill.
 *
 * @param {string} phrase words copied out of the email ("end of day Friday")
 * @param {{ sentAt?: string|number|Date, now?: Date }} [when]
 * @returns {string|null}
 */
export function resolveDate(phrase, { sentAt, now = new Date() } = {}) {
  if (!phrase) return null;
  const text = String(phrase).toLowerCase().trim();
  if (!text) return null;

  const base = dayStart(sentAt ?? now) ?? dayStart(now);
  if (!base) return null;

  // Already a date. Trusted as given — the model was reading, not counting.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const made = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(made.getTime()) ? null : keyOf(made);
  }

  if (/\b(today|this afternoon|this morning|tonight|this evening|end of (the )?day)\b/.test(text) && !hasWeekday(text)) {
    return keyOf(base);
  }
  if (/\btomorrow\b/.test(text)) return keyOf(shift(base, 1));
  if (/\byesterday\b/.test(text)) return keyOf(shift(base, -1));

  // "3 November", "3rd Nov", "November 3" — with a year if one is given.
  const dayMonth = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})[a-z]*\\b`));
  const monthDay = text.match(new RegExp(`\\b(${MONTH_NAMES})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (dayMonth || monthDay) {
    const day = Number(dayMonth ? dayMonth[1] : monthDay[2]);
    const month = monthIndex(dayMonth ? dayMonth[2] : monthDay[1]);
    const stated = text.match(/\b(20\d{2})\b/);
    return calendarDate(day, month, stated ? Number(stated[1]) : null, base);
  }

  // "15/03", "15/03/2027" — day first, as the rest of the app reads dates.
  const slashed = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashed) {
    const year = slashed[3] ? Number(slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3]) : null;
    return calendarDate(Number(slashed[1]), Number(slashed[2]) - 1, year, base);
  }

  // "in 3 days", "in a fortnight", "within two weeks".
  const inN = text.match(/\b(?:in|within)\s+(a|an|one|two|three|four|five|six|seven|\d+)\s+(day|week|month|fortnight)/);
  if (inN) {
    const n = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }[inN[1]] ?? Number(inN[1]);
    const unit = inN[2];
    if (unit === 'day') return keyOf(shift(base, n));
    if (unit === 'week') return keyOf(shift(base, n * 7));
    if (unit === 'fortnight') return keyOf(shift(base, 14));
    const months = new Date(base);
    months.setMonth(months.getMonth() + n);
    return keyOf(months);
  }

  // Periods before weekdays: "end of the month" must not be read as a Monday.
  if (/\bend of (the )?week\b/.test(text)) return keyOf(onOrAfter(base, 5));
  if (/\bnext week\b/.test(text)) return keyOf(onOrAfter(shift(base, 7), 1));
  if (/\bend of (the )?month\b/.test(text)) {
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return keyOf(last);
  }
  if (/\bnext month\b/.test(text)) {
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return keyOf(next);
  }

  // A weekday, with or without "next". "Next Friday" is the one after the
  // coming Friday — which is how people use it, even though it is ambiguous.
  const weekday = text.match(new RegExp(`\\b(next|this|coming)?\\s*\\b(${WEEKDAY_NAMES})\\b`));
  if (weekday) {
    const index = weekdayIndex(weekday[2]);
    if (index >= 0) return keyOf(onOrAfter(base, index, weekday[1] === 'next'));
  }

  return null;
}

const hasWeekday = (text) => new RegExp(`\\b(${WEEKDAY_NAMES})\\b`).test(text);

/**
 * A day and month with no year, placed in the year that makes it mean what it
 * says: ahead of the email, unless the email itself gave a year.
 *
 * Without this, "3 November" read in December lands eleven months in the past.
 */
function calendarDate(day, month, year, base) {
  if (!(day >= 1 && day <= 31) || !(month >= 0 && month <= 11)) return null;
  if (year) {
    const exact = new Date(year, month, day);
    return exact.getMonth() === month ? keyOf(exact) : null;
  }
  let made = new Date(base.getFullYear(), month, day);
  // More than a month behind the email means they meant the next one round.
  if (made < shift(base, -31)) made = new Date(base.getFullYear() + 1, month, day);
  return made.getMonth() === month ? keyOf(made) : null;
}

/**
 * A time as HH:MM, from whatever an email or a model called it.
 *
 * The model answers this one in the email's own words too — "2:30pm", "14:30",
 * "2.30 pm" and "noon" all arrive here, and `<input type="time">` takes exactly
 * one of those shapes.
 */
export function resolveTime(phrase) {
  if (!phrase) return null;
  const text = String(phrase).toLowerCase().trim();
  if (/\b(noon|midday)\b/.test(text)) return '12:00';
  if (/\bmidnight\b/.test(text)) return '00:00';

  const match = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (Number.isNaN(hour) || hour > 23 || minute > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  // No am/pm and a single digit: an email saying "at 3" about a working day
  // means the afternoon. 9 is the one that reads as morning.
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** An hour after `time`, for an event that was given a start and no end. */
export function anHourAfter(time) {
  // An empty string splits to [''], and Number('') is 0 rather than NaN — so
  // without this the answer to "no time at all" was one o'clock in the morning.
  if (!/^\d{1,2}:\d{2}/.test(String(time ?? ''))) return null;
  const [h, m] = String(time).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

/**
 * How a resolved date reads back to the person checking it.
 *
 * The review card shows this beside the date field, because "2026-10-09" is
 * not something anyone can check at a glance and "Thursday 9 October" is.
 */
export function readDate(key, now = new Date()) {
  if (!key) return null;
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const today = keyOf(now);
  if (key === today) return 'today';
  if (key === keyOf(shift(dayStart(now), 1))) return 'tomorrow';
  if (key === keyOf(shift(dayStart(now), -1))) return 'yesterday';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    // en-GB puts a comma after the weekday once a year is asked for, so the
    // two shapes would read differently in the same column.
    .replace(',', '');
}

/** True when a date has already gone — shown as a warning, not an error. */
export const isPast = (key, now = new Date()) => Boolean(key) && key < keyOf(now);
