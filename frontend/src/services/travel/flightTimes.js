// Departure and arrival times for a booked flight.
//
// Three sources, in this order of trust:
//
//  1. What you typed. It came off your booking; nothing overrules it.
//  2. The airline's timetable, when AERODATABOX_KEY is set. Real scheduled
//     times, filled in for you the moment the flight number resolves.
//  3. Failing both, an estimate: your departure plus the time in the air, read
//     out in the destination's own zone.
//
// The third exists because the keyless flight sources carry no timetable at all
// — adsbdb knows where a flight number goes, not when.
//
// That last part is the whole point. A flight leaving London at 09:15 does not
// land in New York at 17:15, and a red-eye east lands tomorrow. Both airports
// carry an IANA zone from the backend, so the maths survives a trip that crosses
// a daylight-saving change too.

/** Cruise speed plus taxi, the same estimate the flight card has always shown. */
export function durationMinutes(distanceKm) {
  if (!distanceKm) return null;
  return Math.round((distanceKm / 840) * 60 + 35);
}

export function formatDuration(minutes) {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;
}

/** How far `zone` is from UTC at a given instant, in milliseconds. */
function offsetAt(instant, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * A wall-clock time in some zone → the actual instant.
 *
 * Read the naive time as if it were UTC, then step back by the zone's offset.
 * Twice, because the offset itself depends on the instant: a time that falls an
 * hour after a DST change needs the corrected offset, not the first guess.
 */
export function zonedToInstant(date, time, zone) {
  if (!date || !time) return null;
  const naive = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  if (!zone) return naive; // no zone known — treat it as UTC rather than guess
  let instant = new Date(naive.getTime() - offsetAt(naive, zone));
  instant = new Date(naive.getTime() - offsetAt(instant, zone));
  return instant;
}

/** An instant → { date: 'YYYY-MM-DD', time: 'HH:MM' } as read in `zone`. */
export function instantToZoned(instant, zone) {
  if (!instant) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const hour = String(Number(parts.hour) % 24).padStart(2, '0');
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

/** AeroDataBox writes UTC as "2026-08-20 08:15Z" — a space where ISO wants a T. */
function utcMinutesBetween(from, to) {
  const parse = (v) => (typeof v === 'string' ? Date.parse(v.replace(' ', 'T')) : NaN);
  const a = parse(from);
  const b = parse(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 60_000) : null;
}

const dayGap = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Everything the flight card needs to show times.
 *
 * @param {object} flight  the stored flight: { date, departTime, arriveTime }
 * @param {object} data    the looked-up route: { origin, destination, distanceKm }
 * @returns {{
 *   depart: string|null, arrive: string|null, arriveEstimated: boolean,
 *   dayOffset: number, minutes: number|null, originZone: string|null, destZone: string|null,
 * }}
 */
export function flightTimes(flight, data) {
  const originZone = data?.origin?.timeZone ?? null;
  const destZone = data?.destination?.timeZone ?? null;
  const date = flight?.date || null;
  const estimate = durationMinutes(data?.distanceKm);
  const sched = data?.schedule ?? null;

  const depart = flight?.departTime || sched?.departure?.time || null;

  const out = {
    depart,
    arrive: flight?.arriveTime || sched?.arrival?.time || null,
    arriveEstimated: false,
    dayOffset: 0,
    minutes: estimate,
    originZone,
    destZone,
    scheduled: Boolean(sched),
    // What the airline is doing today, when it differs from the timetable.
    revisedDepart: sched?.departure?.revisedTime ?? null,
    revisedArrive: sched?.arrival?.revisedTime ?? null,
    terminal: sched?.departure?.terminal ?? null,
    gate: sched?.departure?.gate ?? null,
  };
  if (!depart || !date) return out;

  // Both ends straight off the timetable: it already knows the real duration and
  // which day the flight lands on, including the rare second midnight. No need
  // to re-derive either from wall clocks.
  const fromTimetable = sched && !flight?.departTime && !flight?.arriveTime && sched.departure?.time && sched.arrival?.time;
  if (fromTimetable) {
    const took = utcMinutesBetween(sched.departure.utc, sched.arrival.utc);
    if (took != null) out.minutes = took;
    if (sched.departure.date && sched.arrival.date) {
      out.dayOffset = dayGap(sched.departure.date, sched.arrival.date);
    }
    return out;
  }

  const departAt = zonedToInstant(date, depart, originZone);
  if (!departAt) return out;

  // An arrival you typed in wins — it came off the booking. Its duration is then
  // the real one, not the distance estimate.
  if (out.arrive) {
    let arriveAt = zonedToInstant(date, out.arrive, destZone);
    if (arriveAt) {
      // A landing "before" take-off is the next day, not a mistake.
      if (arriveAt < departAt) arriveAt = new Date(arriveAt.getTime() + 86_400_000);
      out.minutes = Math.round((arriveAt - departAt) / 60_000);
      const local = instantToZoned(arriveAt, destZone);
      out.dayOffset = dayGap(date, local.date);
    }
    return out;
  }

  if (estimate == null) return out;
  const arriveAt = new Date(departAt.getTime() + estimate * 60_000);
  const local = instantToZoned(arriveAt, destZone);
  out.arrive = local.time;
  out.arriveEstimated = true;
  out.dayOffset = dayGap(date, local.date);
  return out;
}
