import { fetchJson } from '../../utils/httpClient.js';

/**
 * The bits of Wikipedia the Travel module leans on: a page summary (blurb,
 * extract, lead image, coordinates) and a full-text search.
 *
 * Wikimedia's API policy rejects requests whose User-Agent doesn't identify the
 * caller — without one every call comes back 429 — so the header is set here
 * once rather than at each call site.
 */
const WIKI = 'https://en.wikipedia.org';
const UA = 'PulseOS/0.1 (personal dashboard)';
const HEADERS = { 'user-agent': UA, 'api-user-agent': UA };

/**
 * A page's summary, or null when it doesn't exist or is a disambiguation list
 * (which has no subject of its own to show).
 */
export async function wikiSummary(title) {
  const data = await fetchJson(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    integration: 'Wikipedia',
    timeoutMs: 8000,
    headers: HEADERS,
  }).catch(() => null);

  if (!data || data.type === 'disambiguation') return null;
  return {
    title: data.title ?? title,
    coordinates: data.coordinates ?? null,
    blurb: data.description ?? null,
    extract: data.extract ?? null,
    // The full-size image is often 4000px of JPEG; the thumbnail is the one to
    // render, with the original kept for anything that wants to go bigger.
    photo: data.thumbnail?.source
      ? { url: upscale(data.thumbnail.source), url2x: data.originalimage?.source ?? null, ref: null }
      : null,
    wikiUrl: data.content_urls?.desktop?.page ?? null,
  };
}

/** Full-text search, best match first. Returns page keys (titles with underscores). */
export async function wikiSearch(query, limit = 5) {
  const q = (query || '').trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, limit: String(limit) });
  const data = await fetchJson(`${WIKI}/w/rest.php/v1/search/page?${params}`, {
    integration: 'Wikipedia',
    timeoutMs: 8000,
    headers: HEADERS,
  }).catch(() => null);
  return data?.pages ?? [];
}

// Wikipedia hands back a 320px thumb by default; the same URL at 1280 is a
// crisp card background and still a fraction of the original's weight.
const upscale = (url) => url.replace(/\/(\d{2,4})px-/, '/1280px-');

/** True when a summary has something worth showing. */
export const usableSummary = (profile) => Boolean(profile?.photo || profile?.extract);
