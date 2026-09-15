// Minimal VCALENDAR/VEVENT builder for writing events to CalDAV (Apple iCloud).
import { addDays, allDayKey, compactDay } from './dayKey.js';

const pad = (n) => String(n).padStart(2, '0');

// A timed value is a real instant → UTC stamp. An all-day value is a calendar
// day → written verbatim, never converted (converting shifts it a day east of UTC).
function icsDate(value, allDay) {
  if (allDay) return compactDay(allDayKey(value));
  const d = new Date(value);
  const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  return `${ymd}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const esc = (s = '') =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');

export function buildICS({ uid, title, description, location, start, end, allDay }) {
  const stamp = icsDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PulseOS//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
  ];

  if (allDay) {
    // DTEND is exclusive for VALUE=DATE and must be past DTSTART — callers send
    // the last day (often the same day), so push it to at least the next one.
    const startKey = allDayKey(start);
    const endKey = allDayKey(end);
    const dtEnd = endKey && endKey > startKey ? endKey : addDays(startKey, 1);
    lines.push(`DTSTART;VALUE=DATE:${compactDay(startKey)}`, `DTEND;VALUE=DATE:${compactDay(dtEnd)}`);
  } else {
    const dtEnd = end || new Date(new Date(start).getTime() + 3_600_000);
    lines.push(`DTSTART:${icsDate(start)}`, `DTEND:${icsDate(dtEnd)}`);
  }

  lines.push(
    `SUMMARY:${esc(title)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}
