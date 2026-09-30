import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Airline crests and banners, served from here rather than from their bucket.
 *
 * The artwork lives in Firebase Storage, which answers every request with
 * `cache-control: private, max-age=0` — so the browser is told in as many words
 * not to keep it. That made the crest the slowest thing on the flight card and
 * made it slow *every time*: warming it during launch achieved nothing, because
 * the fetch on arrival was never going to be a cache hit.
 *
 * Proxying gives it headers that mean what we mean. An airline's logo is the
 * definition of immutable.
 */
const cache = new Map(); // `${kind}:${icao}` → { buffer, type }
const TIMEOUT_MS = 8000;

export const airlineArtService = {
  get configured() {
    return Boolean(config.travel.airlineArtBase);
  },

  /**
   * @param {string} icao a three-letter airline code, e.g. "BAW"
   * @param {'logos'|'banners'} kind
   */
  async fetch(icao, kind) {
    const code = (icao ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw ApiError.badRequest('Provide a three-letter ICAO airline code.');
    if (kind !== 'logos' && kind !== 'banners') throw ApiError.badRequest('Unknown artwork kind.');
    if (!this.configured) throw ApiError.notConfigured('Airline artwork');

    const key = `${kind}:${code}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const url = `${config.travel.airlineArtBase}%2F${kind}%2F${code}.png?alt=media`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      // Coverage isn't complete — plenty of carriers have a logo and no banner
      // — so a miss is an ordinary answer, not an error worth shouting about.
      if (!res.ok) throw ApiError.notFound(`No ${kind.slice(0, -1)} for ${code}.`);
      const entry = { buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/png' };
      cache.set(key, entry);
      return entry;
    } finally {
      clearTimeout(timer);
    }
  },
};
