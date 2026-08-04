import { config } from '../../config/env.js';
import { fetchJson } from '../../utils/httpClient.js';

/**
 * Flight data from the open ADS-B ecosystem — no keys, no quotas.
 *
 * - Routes (airline, origin and destination airports with coordinates) come from
 *   adsbdb, a community flight-route database.
 * - Live positions come from adsb.lol, with airplanes.live as a second opinion:
 *   both aggregate volunteer ADS-B receivers, so an aircraft appears the moment
 *   it's airborne and in range of any of them.
 *
 * What this can't give you, honestly: gate numbers and scheduled times. Those
 * live behind paid airline feeds. Everything here is the aeroplane itself.
 */
const ADSBDB = 'https://api.adsbdb.com/v0';
const PLANESPOTTERS = 'https://api.planespotters.net/pub/photos';
const LIVE_FEEDS = [
  { name: 'adsb.lol', url: (cs) => `https://api.adsb.lol/v2/callsign/${cs}` },
  { name: 'airplanes.live', url: (cs) => `https://api.airplanes.live/v2/callsign/${cs}` },
];

export const flightsProvider = {
  /**
   * Look up a flight's route. Tries each candidate callsign in turn and returns
   * the first hit, so a ticket number and a transponder callsign both work.
   *
   * @param {string[]} candidates from `callsignCandidates()`
   */
  async route(candidates) {
    for (const callsign of candidates) {
      const data = await fetchJson(`${ADSBDB}/callsign/${encodeURIComponent(callsign)}`, {
        integration: 'adsbdb',
        timeoutMs: 8000,
      }).catch(() => null);

      const found = data?.response?.flightroute;
      if (found) return normalizeRoute(found);
    }
    return null;
  },

  /**
   * Where the aircraft is right now, or null when it isn't broadcasting — on the
   * ground with transponders off, or outside receiver coverage (mid-ocean).
   */
  async live(callsigns) {
    for (const callsign of callsigns) {
      for (const feed of LIVE_FEEDS) {
        const data = await fetchJson(feed.url(encodeURIComponent(callsign)), {
          integration: feed.name,
          timeoutMs: 8000,
        }).catch(() => null);

        const aircraft = (data?.ac ?? []).find((a) => a?.lat != null && a?.lon != null);
        if (aircraft) return normalizeLive(aircraft, feed.name);
      }
    }
    return null;
  },

  /**
   * The aeroplane behind a registration: what it is, who operates it, and a
   * photograph of that exact airframe.
   *
   * Type and operator come from adsbdb's registry; the picture comes from
   * Planespotters, whose photos are free to use with a credit (adsbdb's own
   * photo links point at airport-data.com, which now 404s).
   */
  async aircraft(registration) {
    const reg = (registration || '').trim().toUpperCase();
    if (!reg) return null;

    const [registry, photo] = await Promise.all([
      fetchJson(`${ADSBDB}/aircraft/${encodeURIComponent(reg)}`, { integration: 'adsbdb', timeoutMs: 8000 })
        .then((data) => data?.response?.aircraft ?? null)
        .catch(() => null),
      aircraftPhoto(reg),
    ]);

    if (!registry && !photo) return null;
    return {
      registration: registry?.registration ?? reg,
      type: registry?.type ?? null,
      manufacturer: registry?.manufacturer ?? null,
      owner: registry?.registered_owner ?? null,
      ownerCountry: registry?.registered_owner_country_name ?? null,
      photo,
    };
  },
};

/**
 * Airline artwork, keyed by ICAO code. The files are named `BAW.png`, `JAL.png`
 * and so on, so knowing the code is enough — no lookup call. Coverage isn't
 * complete (some carriers have a logo but no banner), which is why the UI treats
 * both as optional and falls back to its own glyph.
 */
function airlineArt(icao) {
  const base = config.travel.airlineArtBase;
  const code = (icao || '').trim().toUpperCase();
  if (!base || !/^[A-Z]{3}$/.test(code)) return { logo: null, banner: null };
  return {
    logo: `${base}%2Flogos%2F${code}.png?alt=media`,
    banner: `${base}%2Fbanners%2F${code}.png?alt=media`,
  };
}

/**
 * A photo of one airframe, with the credit its licence asks for. Planespotters
 * rejects requests whose User-Agent carries no way to contact the caller, hence
 * the contact string from config.
 */
async function aircraftPhoto(registration) {
  const data = await fetchJson(`${PLANESPOTTERS}/reg/${encodeURIComponent(registration)}`, {
    integration: 'Planespotters',
    timeoutMs: 8000,
    headers: { 'user-agent': `PulseOS/0.1 (+${config.travel.photoContact})` },
  }).catch(() => null);

  const shot = data?.photos?.[0];
  if (!shot?.thumbnail_large?.src) return null;
  return {
    url: shot.thumbnail_large.src,
    thumb: shot.thumbnail?.src ?? null,
    width: shot.thumbnail_large.size?.width ?? null,
    height: shot.thumbnail_large.size?.height ?? null,
    photographer: shot.photographer ?? null,
    link: shot.link ?? null,
    credit: 'Planespotters.net',
  };
}

function normalizeRoute(route) {
  const art = airlineArt(route.airline?.icao);
  return {
    callsign: route.callsign ?? null,
    callsignIcao: route.callsign_icao ?? null,
    callsignIata: route.callsign_iata ?? null,
    airline: route.airline
      ? {
          name: route.airline.name ?? null,
          iata: route.airline.iata ?? null,
          icao: route.airline.icao ?? null,
          country: route.airline.country ?? null,
          logo: art.logo,
          banner: art.banner,
        }
      : null,
    origin: normalizeAirport(route.origin),
    destination: normalizeAirport(route.destination),
  };
}

function normalizeAirport(airport) {
  if (!airport) return null;
  return {
    name: airport.name ?? null,
    iata: airport.iata_code ?? null,
    icao: airport.icao_code ?? null,
    city: airport.municipality ?? null,
    country: airport.country_name ?? null,
    countryCode: airport.country_iso_name ?? null,
    lat: airport.latitude ?? null,
    lon: airport.longitude ?? null,
    elevation: airport.elevation ?? null,
  };
}

function normalizeLive(ac, source) {
  // alt_baro reads "ground" while taxiing; everything else is feet.
  const onGround = ac.alt_baro === 'ground';
  return {
    source,
    hex: ac.hex ?? null,
    callsign: (ac.flight || '').trim() || null,
    registration: ac.r ?? null,
    aircraftType: ac.t ?? null,
    lat: ac.lat,
    lon: ac.lon,
    altitude: onGround ? 0 : Number(ac.alt_baro) || null,
    onGround,
    groundSpeed: ac.gs != null ? Math.round(ac.gs) : null,
    heading: ac.track ?? ac.true_heading ?? null,
    verticalRate: ac.baro_rate ?? ac.geom_rate ?? null,
    squawk: ac.squawk ?? null,
    // How many seconds ago the position was seen — anything under a minute is live.
    seenSeconds: ac.seen_pos != null ? Math.round(ac.seen_pos) : null,
  };
}
