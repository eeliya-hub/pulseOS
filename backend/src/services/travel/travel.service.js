import { createCache } from '../../utils/cache.js';
import { callsignCandidates } from './airlines.js';
import { countryFacts } from './countryFacts.js';
import { banknotePhoto, currencyProvider } from './currency.provider.js';
import { destinationProvider } from './destination.provider.js';
import { flightsProvider } from './flights.provider.js';
import { placesProvider } from './places.provider.js';

/**
 * Travel business logic: stitches the keyless providers into the exact shapes
 * the Travel view renders, and caches each on the rhythm its data actually
 * changes — a city's time zone for a day, a flight's position for 20 seconds.
 */
const destinations = createCache(24 * 60 * 60 * 1000);
const zones = createCache(24 * 60 * 60 * 1000);
const flights = createCache(20 * 1000);
const rates = createCache(30 * 60 * 1000);
const placeSearches = createCache(60 * 60 * 1000);
const photoLookups = createCache(6 * 60 * 60 * 1000);
// A currency's notes don't change; a week is a conservative refresh.
const banknotes = createCache(7 * 24 * 60 * 60 * 1000);

export const travelService = {
  /**
   * Resolve a destination the user typed into everything a trip header needs:
   * where it is, what time it is there, what money they'll use, and a photo.
   */
  async destination(query) {
    const q = (query || '').trim();
    if (!q) return null;

    const place = await destinations.wrap(`dest:${q.toLowerCase()}`, async () => {
      const found = await destinationProvider.geocode(q);
      if (!found) return null;

      const profile = await destinationProvider.profile(found.city, found.country, {
        coords: { lat: found.lat, lon: found.lon },
        region: found.region,
      });
      return {
        city: found.city,
        country: found.country,
        countryCode: found.countryCode,
        label: found.label,
        lat: found.lat,
        lon: found.lon,
        blurb: profile?.blurb ?? null,
        extract: profile?.extract ?? null,
        photo: profile?.photo ?? null,
        wikiUrl: profile?.wikiUrl ?? null,
        ...countryFacts(found.countryCode),
      };
    });
    if (!place) return null;

    // Resolved outside the destination cache and merged in per request: a time
    // zone lookup that blips shouldn't leave the city without a clock for the
    // next 24 hours — the next request retries it.
    const zone = await timeZoneFor(place.lat, place.lon);
    return {
      ...place,
      timeZone: zone?.timeZone ?? null,
      utcOffsetSeconds: zone?.offsetSeconds ?? null,
    };
  },

  /**
   * Track a flight by number, for a given date.
   *
   * The date matters: airlines reuse a flight number every day, so looking up
   * BA117 three weeks before departure would happily show today's aircraft over
   * the Atlantic as if it were yours. Live positions are therefore only fetched
   * when the flight is actually flying — the day it departs, or the morning
   * after for an overnight long-haul. Any other day returns the route on its own
   * with a scheduled/completed status.
   *
   * @param {string} code  flight number or callsign
   * @param {string} [date] YYYY-MM-DD departure date; omit to always track live
   * @param {object} [opts]
   * @param {boolean} [opts.live] set false for the route only, no position lookup
   */
  async flight(code, date, { live: wantLive = true } = {}) {
    const input = (code || '').trim();
    if (!input) return null;

    const timing = flightTiming(date, wantLive);
    // A position goes stale in seconds; a route doesn't change at all, so the
    // route-only lookup is cached for hours instead.
    const ttlMs = timing.trackLive ? 20 * 1000 : 6 * 60 * 60 * 1000;
    return flights.wrap(`flight:${input.toUpperCase()}:${timing.key}`, async () => {
      const candidates = callsignCandidates(input);
      if (!candidates.length) return null;

      const route = await flightsProvider.route(candidates);
      // Wikipedia's lead image for an airline is nearly always a photo of one of
      // its aircraft — which is the picture the flight card wants, and needs no
      // tail number to find. "airline" in the search query keeps carriers whose
      // name means something else (Emirates) on the right article.
      const airlinePhoto = route?.airline?.name
        ? await destinationProvider
            .profile(route.airline.name, 'airline')
            .then((profile) => profile?.photo ?? null)
            .catch(() => null)
        : null;
      // Once the route is known, its ICAO callsign is the one being broadcast —
      // look for that first rather than the ticket number the user typed.
      const liveCandidates = [...new Set([route?.callsignIcao, route?.callsign, ...candidates].filter(Boolean))];
      const live = timing.trackLive ? await flightsProvider.live(liveCandidates) : null;

      if (!route && !live) return { code: input.toUpperCase(), found: false, status: 'unknown', ...timing.meta };

      const progress = computeProgress(route, live);
      return {
        code: input.toUpperCase(),
        found: true,
        callsign: live?.callsign || route?.callsignIcao || candidates[0],
        flightNumber: route?.callsignIata ?? input.toUpperCase(),
        airline: route?.airline ? { ...route.airline, photo: airlinePhoto } : null,
        origin: route?.origin ?? null,
        destination: route?.destination ?? null,
        live,
        status: timing.trackLive ? flightStatus(route, live, progress) : timing.status,
        ...timing.meta,
        ...progress,
        updatedAt: Date.now(),
      };
    }, ttlMs);
  },

  /** Aircraft details for a registration, e.g. the tail on today's flight. */
  aircraft: (registration) => flightsProvider.aircraft(registration),

  /**
   * Exchange rate between two currencies, with a 30-day history for the trend
   * line. `amount` is echoed back converted so the UI can show one number.
   */
  async fx({ from, to, amount = 1, history = true }) {
    const key = `fx:${from}:${to}:${history ? 'h' : 'n'}`;
    const data = await rates.wrap(key, async () => {
      const [rate, series] = await Promise.all([
        currencyProvider.rate(from, to),
        history ? currencyProvider.series(from, to, 30) : Promise.resolve([]),
      ]);
      return { rate, series };
    });

    if (!data.rate) return null;

    const photo = await banknotes
      .wrap(`notes:${(to || '').toUpperCase()}`, async () => {
        const found = await banknotePhoto(to);
        if (!found) throw new Error('no banknote photo'); // don't cache a miss
        return found;
      })
      .catch(() => null);

    const value = Number(amount);
    return {
      from: (from || '').toUpperCase(),
      to: (to || '').toUpperCase(),
      rate: data.rate.rate,
      inverse: data.rate.rate ? 1 / data.rate.rate : null,
      date: data.rate.date,
      source: data.rate.source,
      amount: Number.isFinite(value) ? value : 1,
      converted: Number.isFinite(value) ? value * data.rate.rate : null,
      series: data.series,
      photo,
    };
  },

  /** Search hotels, restaurants and sights near the trip. */
  places(params) {
    const key = `places:${params.kind ?? 'any'}:${params.q ?? ''}:${params.lat ?? ''},${params.lon ?? ''}`;
    return placeSearches.wrap(key, () => placesProvider.search(params));
  },

  /**
   * Pictures for something on the itinerary — a hotel, a restaurant, a landmark.
   *
   * With a Places key that's several real photos of the venue. Without one it
   * falls back to Wikipedia, which has no key, no quota, and for a landmark is
   * often the better picture anyway. Either way the caller gets the same list of
   * `{ ref, url }`, and refs are redeemed through our own photo proxy.
   */
  async photos({ q, placeId, lat, lon, limit = 6 }) {
    const query = (q || '').trim();
    if (!query && !placeId) return [];

    return photoLookups.wrap(`photos:${placeId ?? ''}:${query}:${lat ?? ''},${lon ?? ''}`, async () => {
      const found = [];

      if (placesProvider.source() === 'google') {
        // A Google place id is the precise route to its photos, but ids from the
        // seed data or an OSM result won't resolve — fall through to searching
        // for the place by name rather than giving up on it.
        const byId =
          placeId && !String(placeId).startsWith('osm:')
            ? await placesProvider.details(placeId).catch(() => null)
            : null;
        const place =
          byId?.photos?.length
            ? byId
            : (await placesProvider.search({ q: query, lat, lon, limit: 1 }).catch(() => []))[0];
        found.push(...(place?.photos ?? []));
      }

      if (!found.length && query) {
        const profile = await destinationProvider
          .profile(query, null, { coords: lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null })
          .catch(() => null);
        if (profile?.photo?.url) found.push({ ref: null, url: profile.photo.url, credit: 'Wikipedia' });
      }

      return found.slice(0, limit);
    });
  },

  placeDetails: (id) => placesProvider.details(id),
  placePhoto: (ref, width) => placesProvider.photo(ref, width),
  placesSource: () => placesProvider.source(),
};

/**
 * What a departure date means for tracking: whether to ask the ADS-B feeds for a
 * position at all, what to call the flight if not, and how long until (or since)
 * it flies. A flight with no date always tracks live — that's the "what's this
 * callsign doing right now" case.
 */
function flightTiming(date, wantLive = true) {
  const iso = (date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { key: wantLive ? 'live' : 'route', trackLive: wantLive, status: null, meta: { date: null, daysAway: null } };
  }

  const day = Date.parse(`${iso}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const daysAway = Math.round((day - today) / 86_400_000);

  // Today, or yesterday — an overnight long-haul is still airborne the morning
  // after it departs.
  const trackLive = wantLive && (daysAway === 0 || daysAway === -1);
  return {
    key: trackLive ? 'live' : `${iso}:${wantLive ? 'l' : 'r'}`,
    trackLive,
    status: daysAway > 0 ? 'scheduled' : daysAway < 0 ? 'completed' : 'today',
    meta: { date: iso, daysAway },
  };
}

/**
 * Time zone for a point, cached only on success — the loader throws when the
 * lookup comes back empty, which `createCache` leaves uncached, so the next
 * request tries again rather than living with a blank clock all day.
 */
async function timeZoneFor(lat, lon) {
  return zones
    .wrap(`tz:${lat},${lon}`, async () => {
      const zone = await destinationProvider.timeZone(lat, lon);
      if (!zone) throw new Error('no time zone');
      return zone;
    })
    .catch(() => null);
}

/* ── Geometry ─────────────────────────────────────────────────────────────── */

const R_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two {lat, lon} points. */
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far along the route the aircraft is.
 *
 * Progress is measured as flown ÷ (flown + remaining) rather than against the
 * straight-line route length: on a diversion or a holding pattern the sum grows,
 * which keeps the bar honest instead of letting it run past 100%.
 */
function computeProgress(route, live) {
  const origin = route?.origin;
  const destination = route?.destination;
  const totalKm = distanceKm(origin, destination);

  if (!live || live.lat == null || !origin || !destination) {
    return { distanceKm: round(totalKm), flownKm: null, remainingKm: null, progress: null, etaMinutes: null };
  }

  const flownKm = distanceKm(origin, live);
  const remainingKm = distanceKm(live, destination);
  const travelled = flownKm + remainingKm;
  const progress = travelled > 0 ? Math.max(0, Math.min(1, flownKm / travelled)) : null;

  // Ground speed is in knots; 1 kt = 1.852 km/h.
  const speedKmh = live.groundSpeed ? live.groundSpeed * 1.852 : null;
  const etaMinutes = speedKmh && speedKmh > 40 ? Math.round((remainingKm / speedKmh) * 60) : null;

  return {
    distanceKm: round(totalKm),
    flownKm: round(flownKm),
    remainingKm: round(remainingKm),
    progress,
    etaMinutes,
  };
}

/**
 * A plain-language state. Deliberately conservative: without a paid schedule
 * feed we describe what the aircraft is doing, never what it's meant to do.
 */
function flightStatus(route, live, progress) {
  if (!live) return route ? 'no-signal' : 'unknown';
  if (live.onGround) {
    const nearDestination = progress?.remainingKm != null && progress.remainingKm < 25;
    return nearDestination ? 'landed' : 'on-ground';
  }
  if (progress?.remainingKm != null && progress.remainingKm < 60) return 'approaching';
  if (live.verticalRate != null && live.verticalRate > 500 && progress?.flownKm != null && progress.flownKm < 150) {
    return 'climbing';
  }
  return 'airborne';
}

const round = (km) => (km == null ? null : Math.round(km));
