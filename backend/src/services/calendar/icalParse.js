// Shared mapping of parsed iCalendar (node-ical output) → normalized events,
// with recurrence (RRULE) expansion inside a time window. Used by both the iCal
// URL provider and the Apple CalDAV provider.
const DAY = 86_400_000;
const iso = (d) => (d ? new Date(d).toISOString() : null);

export function eventsFromParsed(parsed, { timeMin, timeMax, source = 'ical' } = {}) {
  const start = timeMin ? new Date(timeMin) : new Date(Date.now() - DAY);
  const end = timeMax ? new Date(timeMax) : new Date(Date.now() + 60 * DAY);

  const out = [];
  for (const entry of Object.values(parsed ?? {})) {
    if (entry?.type !== 'VEVENT') continue;

    const base = {
      title: entry.summary,
      description: entry.description,
      location: entry.location,
      allDay: entry.datetype === 'date',
      recurring: Boolean(entry.rrule),
      uid: entry.uid,
      source,
    };
    const durationMs =
      entry.end && entry.start ? new Date(entry.end).getTime() - new Date(entry.start).getTime() : 0;

    if (entry.rrule) {
      const excluded = new Set(Object.values(entry.exdate ?? {}).map((d) => new Date(d).getTime()));
      for (const dt of entry.rrule.between(start, end, true)) {
        if (excluded.has(dt.getTime())) continue;
        out.push({
          ...base,
          id: `${entry.uid}-${dt.getTime()}`,
          start: iso(dt),
          end: iso(new Date(dt.getTime() + durationMs)),
        });
      }
    } else if (entry.start) {
      const s = new Date(entry.start);
      const e = entry.end ? new Date(entry.end) : s;
      if (e >= start && s <= end) {
        out.push({ ...base, id: entry.uid, start: iso(s), end: iso(e) });
      }
    }
  }
  return out;
}
