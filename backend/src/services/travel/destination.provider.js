import { fetchJson } from '../../utils/httpClient.js';
import { openWeatherProvider } from '../weather/openweather.provider.js';
import { usableSummary, wikiSearch, wikiSummary } from './wikipedia.js';

/**
 * Everything needed to turn "Tokyo" into a destination: coordinates and country
 * (Nominatim), the IANA time zone for that point (TimeAPI), and a photo plus a
 * one-line description (Wikipedia). All keyless.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TIMEAPI = 'https://timeapi.io/api';
const UA = 'PulseOS/0.1 (personal dashboard)';

export const destinationProvider = {
  /** Free-typed place → { city, country, countryCode, lat, lon, label }. */
  async geocode(query) {
    const q = (query || '').trim();
    if (!q) return null;

    // accept-language keeps names in English — without it Tokyo comes back as
    // 東京都, which is charming but not what the trip card wants to render.
    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
      'accept-language': 'en',
      q,
    });
    const data = await fetchJson(`${NOMINATIM}/search?${params}`, {
      integration: 'Nominatim',
      headers: { 'user-agent': UA, 'accept-language': 'en' },
    }).catch(() => null);

    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;

    const address = hit.address ?? {};
    return {
      city: hit.name || address.city || address.town || address.village || address.state || q,
      country: address.country ?? null,
      // County/state — what Wikipedia uses to disambiguate same-named towns.
      region: address.county || address.state || address.region || null,
      countryCode: (address.country_code ?? '').toUpperCase() || null,
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      label: hit.display_name ?? q,
    };
  },

  /**
   * The IANA zone for a coordinate ("Asia/Tokyo") plus its current UTC offset in
   * seconds. The zone name is what matters — it keeps local times correct across
   * a daylight-saving change mid-trip, which a fixed offset would not.
   *
   * If TimeAPI is unreachable we still return the offset from OpenWeather (whose
   * key is already configured for the dashboard), so the destination clock keeps
   * working with a plain offset instead of showing nothing.
   */
  async timeZone(lat, lon) {
    if (lat == null || lon == null) return null;

    const data = await fetchJson(`${TIMEAPI}/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`, {
      integration: 'TimeAPI',
      timeoutMs: 8000,
    }).catch(() => null);

    if (data?.timeZone) {
      return { timeZone: data.timeZone, offsetSeconds: data.currentUtcOffset?.seconds ?? null };
    }

    const weather = await openWeatherProvider.getCurrent({ lat, lon }).catch(() => null);
    if (weather?.timezone == null) return null;
    return { timeZone: null, offsetSeconds: weather.timezone };
  },

  /**
   * A hero photo and a sentence about the place, from Wikipedia.
   *
   * The title is tried directly first (exact for most cities), then full-text
   * search. Candidates are checked against the destination's coordinates before
   * being accepted — that's what stops "Ashford" landing on the football club
   * and "New York" on the disambiguation page.
   */
  async profile(city, country, { coords = null, region = null } = {}) {
    const name = (city || '').trim();
    if (!name) return null;

    // Wikipedia disambiguates places by region — "Ashford, Kent" is the article,
    // while bare "Ashford" is a disambiguation page. Try both forms before
    // resorting to search.
    let fallback = null;
    for (const title of [name, region && `${name}, ${region}`, country && `${name}, ${country}`].filter(Boolean)) {
      const candidate = await wikiSummary(title);
      if (usableSummary(candidate) && nearby(candidate, coords)) return candidate;
      fallback = fallback ?? (usableSummary(candidate) ? candidate : null);
    }

    const pages = await wikiSearch([name, country].filter(Boolean).join(' '), 5);
    // "Ashford, Kent" outranks "Ashford United F.C." — an article titled after
    // the place itself is the one about the place.
    const ranked = [...pages].sort((a, b) => titleScore(b.key, name) - titleScore(a.key, name));
    for (const page of ranked) {
      const candidate = await wikiSummary(page.key);
      if (usableSummary(candidate) && nearby(candidate, coords)) return candidate;
    }
    return fallback;
  },
};

/** How much an article title looks like it names the place itself. */
function titleScore(key, city) {
  const title = (key || '').replace(/_/g, ' ').toLowerCase();
  const name = city.toLowerCase();
  if (title === name) return 3;
  if (title.startsWith(`${name},`)) return 2;
  if (title.startsWith(`${name} `)) return 1;
  return 0;
}


/**
 * Is this article about the place we geocoded? An article with no coordinates
 * gets the benefit of the doubt; one 60km away is a different subject entirely.
 */
function nearby(profile, coords) {
  if (!coords || profile?.coordinates?.lat == null) return true;
  const dLat = (profile.coordinates.lat - coords.lat) * 111;
  const dLon = (profile.coordinates.lon - coords.lon) * 111 * Math.cos((coords.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon) < 60;
}
