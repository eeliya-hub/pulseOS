// Minimal VCALENDAR/VEVENT builder for writing events to CalDAV (Apple iCloud).
const pad = (n) => String(n).padStart(2, '0');

function icsDate(value, allDay) {
  const d = new Date(value);
  const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  if (allDay) return ymd;
  return `${ymd}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const esc = (s = '') =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');

export function buildICS({ uid, title, description, location, start, end, allDay }) {
  const stamp = icsDate(new Date());
  const dtEnd = end || new Date(new Date(start).getTime() + (allDay ? 86_400_000 : 3_600_000));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PulseOS//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${icsDate(start, true)}` : `DTSTART:${icsDate(start)}`,
    allDay ? `DTEND;VALUE=DATE:${icsDate(dtEnd, true)}` : `DTEND:${icsDate(dtEnd)}`,
    `SUMMARY:${esc(title)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
