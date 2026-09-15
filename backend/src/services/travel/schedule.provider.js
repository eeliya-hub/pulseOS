import { config } from '../../config/env.js';
import { fetchJson } from '../../utils/httpClient.js';

/**
 * Scheduled departure and arrival times for a flight number, from AeroDataBox.
 *
 * The rest of the flight card runs on keyless sources, but none of them carry a
 * timetable: adsbdb is a route database (which aircraft flies where, not when),
 * and the live ADS-B feeds only see an aeroplane that is already in the air.
 * Schedules live behind commercial feeds, so this one provider is key-gated.
 *
 * Optional, like the Places key. Without AERODATABOX_KEY the flight card still
 * works — you type the departure off your booking and the arrival is worked out
 * from the distance and the two airports' time zones.
 *
 * Key: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
 */
const HOST = 'aerodatabox.p.rapidapi.com';

// The free plan is rate limited per SECOND, and a trip with an outbound and a
// return asks for two flights at once. Requests are queued a beat apart rather
// than fired together, because the provider answers a burst with an error body,
// not an error status — which is indistinguishable from "no schedule" unless you
// look, and would otherwise be cached as a flight with no times.
const MIN_GAP_MS = 1200;
let queue = Promise.resolve();
let lastAt = 0;

function serialise(task) {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastAt + MIN_GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return task();
  });
  // The chain must survive a rejection, or one failure stalls every later call.
  queue = run.catch(() => {});
  return run;
}

/** True when the body is one of RapidAPI's error envelopes rather than flights. */
function isError(data) {
  if (!data || typeof data !== 'object') return true;
  if (Array.isArray(data)) return false;
  return 'message' in data || 'error' in data;
}

export const scheduleProvider = {
  get configured() {
    return Boolean(config.travel.scheduleKey);
  },

  /**
   * @param {string} number flight number, e.g. "BA117"
   * @param {string} date   YYYY-MM-DD
   * @returns {Promise<object|null>} times, terminals and gates, or null
   */
  async lookup(number, date) {
    if (!this.configured || !number || !date) return null;

    const url =
      `https://${HOST}/flights/number/${encodeURIComponent(number)}/${encodeURIComponent(date)}` +
      '?withAircraftImage=false&withLocation=false';
    const fetchOnce = () =>
      fetchJson(url, {
        integration: 'AeroDataBox',
        timeoutMs: 9000,
        headers: { 'x-rapidapi-key': config.travel.scheduleKey, 'x-rapidapi-host': HOST },
      }).catch(() => null);

    let data = await serialise(fetchOnce);
    // A rate-limited burst is worth exactly one more try, a second later.
    if (isError(data)) data = await serialise(fetchOnce);
    if (isError(data)) return null;

    // One flight number can be several legs on the same day (a tag flight, or a
    // codeshare listed separately). The operating leg is the useful one.
    const legs = Array.isArray(data) ? data : [data];
    const leg =
      legs.find((f) => f?.codeshareStatus !== 'IsCodeshared' && f?.departure?.scheduledTime) ??
      legs.find((f) => f?.departure?.scheduledTime) ??
      null;
    if (!leg) return null;

    return {
      number: leg.number ?? number,
      status: leg.status ?? null,
      aircraft: leg.aircraft?.model ?? null,
      departure: point(leg.departure),
      arrival: point(leg.arrival),
      source: 'AeroDataBox',
    };
  },
};

/**
 * One end of the flight. AeroDataBox writes local times as
 * "2026-08-20 09:15+01:00" — the wall clock at that airport, which is exactly
 * what the card shows, so the HH:MM is taken straight off it rather than being
 * re-derived through a time zone.
 */
function point(end) {
  // Some legs come back with an arrival that carries a name and nothing else
  // (AeroDataBox marks it `quality: []`). Null is the honest answer — the card
  // then estimates the arrival instead of showing blanks.
  if (!end?.scheduledTime?.local) return null;
  const scheduled = end.scheduledTime.local;
  const revised = end.revisedTime?.local ?? null;
  return {
    iata: end.airport?.iata ?? null,
    icao: end.airport?.icao ?? null,
    date: localDate(scheduled),
    time: localTime(scheduled),
    // What it's actually doing today, when the airline has said so.
    revisedTime: localTime(revised),
    utc: end.scheduledTime?.utc ?? null,
    terminal: end.terminal ?? null,
    gate: end.gate ?? null,
  };
}

const localDate = (value) => (typeof value === 'string' ? value.slice(0, 10) : null);
const localTime = (value) => (typeof value === 'string' && value.length >= 16 ? value.slice(11, 16) : null);
