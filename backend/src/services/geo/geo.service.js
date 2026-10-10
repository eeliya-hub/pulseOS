import { createCache } from '../../utils/cache.js';
import { fetchJson } from '../../utils/httpClient.js';

// Address → coordinates via OpenStreetMap Nominatim (free, no key). Cached long
// since a given address doesn't move. Used to place a pin on event maps.
const cache = createCache(24 * 60 * 60 * 1000);

export const geoService = {
  /**
   * @param {string} query
   * @param {{ country?: string }} [options] an ISO code to keep the search inside
   */
  async geocode(query, { country } = {}) {
    const q = (query || '').trim();
    if (!q) return null;
    const within = country ? `&countrycodes=${encodeURIComponent(country.toLowerCase())}` : '';
    return cache.wrap(`geo:${q.toLowerCase()}${within}`, async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}${within}`;
      const data = await fetchJson(url, {
        integration: 'Nominatim',
        headers: { 'user-agent': 'PulseOS/0.1 (personal dashboard)' },
      });
      const hit = Array.isArray(data) ? data[0] : null;
      if (!hit) return null;
      return { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name };
    });
  },
};
