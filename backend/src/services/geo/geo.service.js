import { createCache } from '../../utils/cache.js';
import { fetchJson } from '../../utils/httpClient.js';

// Address → coordinates via OpenStreetMap Nominatim (free, no key). Cached long
// since a given address doesn't move. Used to place a pin on event maps.
const cache = createCache(24 * 60 * 60 * 1000);

export const geoService = {
  async geocode(query) {
    const q = (query || '').trim();
    if (!q) return null;
    return cache.wrap(`geo:${q.toLowerCase()}`, async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
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
