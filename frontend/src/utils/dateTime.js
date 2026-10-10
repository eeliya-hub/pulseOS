import { getSettings } from '../hooks/useSettings.js';

const twelveHour = () => getSettings().clock24 === false;

/** Whether today is the birthday set in Settings ('MM-DD'). */
export function isBirthday(date = new Date(), birthday = getSettings().birthday) {
  if (!birthday) return false;
  return birthday === `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The greeting, or — on the day — the one that matters more. */
export function greetingFor(date = new Date()) {
  return isBirthday(date) ? 'Happy birthday' : getGreeting(date);
}

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The time as the big clocks show it, in 24 or 12 hours as Settings says. The
 * 12-hour clock leaves off am and pm — see meridiem() for setting them small.
 */
export function formatClock(date = new Date()) {
  if (twelveHour()) return `${date.getHours() % 12 || 12} : ${String(date.getMinutes()).padStart(2, '0')}`;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(':', ' : ');
}

export function formatLongDate(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(date);
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';

  return `${weekday} ${day}${suffix} ${month} ${date.getFullYear()}`;
}

export function formatShortDate(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
  const year = String(date.getFullYear()).slice(-2);

  return `${weekday} ${date.getDate()} ${month} ${year}`;
}

/** 'am' or 'pm' on the 12-hour clock; nothing on the 24-hour one. */
export const meridiem = (date = new Date()) => (twelveHour() ? (date.getHours() < 12 ? 'am' : 'pm') : '');

/**
 * How long ago, the way a mail client says it: the time for today, a weekday
 * within the week, a date before that, and the year once it is a different one.
 *
 * Deliberately not "3 days ago" — a list of mail is scanned by when things
 * landed relative to each other, and a weekday does that better than a count.
 */
export function mailTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: twelveHour() });
  }
  const days = Math.round((now - date) / 86_400_000);
  if (days < 7) return date.toLocaleDateString('en-GB', { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** The full stamp the reader shows: weekday, date and time. */
export function mailTimeFull(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit', hour12: twelveHour() },
  )}`;
}
