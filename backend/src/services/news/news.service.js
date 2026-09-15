import { createCache } from '../../utils/cache.js';
import { geocode, regionFromText } from './geocode.js';
import { gnewsProvider } from './gnews.provider.js';
import { rssProvider } from './rss.provider.js';
import { DEFAULT_FEED, UK_REGIONS } from './ukRegions.js';

// Cache so we refresh regularly but never hammer providers. Geocoding is stable,
// so it gets a long TTL of its own. Stale-on-error keeps news showing on a blip.
const cache = createCache(30 * 60 * 1000); // 30 min — reduce GNews requests
const geoCache = createCache(24 * 60 * 60 * 1000);

const normalizeGnews = (a) => ({
  title: a.title,
  description: a.description,
  url: a.url,
  image: a.image,
  source: a.source?.name,
  publishedAt: a.publishedAt,
});

const cap = (s) => s.replace(/(^|[-\s])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()).replace(/-/g, ' ');

// Drop duplicate stories (same link or same headline), which are common when a
// syndicated piece appears across a network's feeds.
function dedupe(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    const byUrl = (a.url || '').split('?')[0].replace(/\/$/, '').toLowerCase();
    const byTitle = `t:${(a.title || '').trim().toLowerCase()}`;
    if ((byUrl && seen.has(byUrl)) || (a.title && seen.has(byTitle))) return false;
    if (byUrl) seen.add(byUrl);
    if (a.title) seen.add(byTitle);
    return true;
  });
}

// Fetch several RSS feeds in parallel, tolerating individual failures.
async function fetchFeeds(feeds = []) {
  if (!feeds.length) return [];
  const results = await Promise.all(feeds.map((f) => rssProvider.fetch(f).catch(() => [])));
  return results.flat();
}

// Combine a primary feed with extra outlets. When outlets are mixed, order by
// recency so the two sources interleave; a single source keeps its native order.
function mergeFeeds(primary, extra = []) {
  const merged = dedupe([...primary, ...extra]);
  if (!extra.length) return merged;
  return merged.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

export const newsService = {
  async headlines(params) {
    return cache.wrap(`gnews:headlines:${JSON.stringify(params)}`, async () => {
      const raw = await gnewsProvider.topHeadlines(params);
      return { total: raw.totalArticles ?? 0, articles: dedupe((raw.articles ?? []).map(normalizeGnews)) };
    });
  },

  async search(params) {
    return cache.wrap(`gnews:search:${JSON.stringify(params)}`, async () => {
      const raw = await gnewsProvider.search(params);
      return { total: raw.totalArticles ?? 0, articles: dedupe((raw.articles ?? []).map(normalizeGnews)) };
    });
  },

  /**
   * Local news for a free-typed location. Resolution ladder (best → general):
   *   1. town-specific feed on the county's local paper (Reach `all-about/<town>`)
   *   2. the county's own outlet (Reach or BBC Local)
   *   3. national UK news
   */
  async local(location) {
    const query = (location || 'UK').trim();
    return cache.wrap(`local:${query.toLowerCase()}`, async () => {
      // A typed county name (e.g. "Kent", "Greater Manchester") maps directly —
      // no geocode needed. Otherwise geocode the town → its county.
      // A county named in the query resolves with no network at all — either as
      // the whole string ("Kent") or inside it ("Ashford, Kent").
      let region = UK_REGIONS[regionFromText(query) ?? ''] ?? null;
      let geo = null;
      // Geocode when we have no region at all, and also when the region we found
      // runs town-level papers — that branch needs the town, which only the
      // lookup can give us.
      if (!region || region.reach) {
        // A failed lookup must NOT be cached: it used to be swallowed into a
        // null, stored as a perfectly good answer for 24 hours, and quietly pin
        // local news to national for the rest of the day.
        try {
          geo = await geoCache.wrap(`geo:${query.toLowerCase()}`, async () => {
            const found = await geocode(query);
            if (!found) throw new Error('no geocode match');
            return found;
          });
        } catch {
          geo = null;
        }
        region = region ?? (geo?.regionId ? UK_REGIONS[geo.regionId] : null);
      }

      // 1. Town-specific feed on a Reach paper (merged with any extra outlets).
      if (region?.reach && geo?.town) {
        const townArticles = await rssProvider
          .fetch(`${region.reach}/all-about/${geo.town}?service=rss`)
          .catch(() => []);
        if (townArticles.length >= 3) {
          // Prefer a town-specific outlet feed (e.g. KentOnline's Ashford paper);
          // otherwise fall back to the county-wide extra outlets.
          const extraFeeds = region.townFeeds?.[geo.town] ? [region.townFeeds[geo.town]] : region.extraFeeds;
          const extra = await fetchFeeds(extraFeeds);
          return {
            place: `${cap(geo.town)}, ${region.label}`,
            scope: 'town',
            articles: mergeFeeds(townArticles, extra),
          };
        }
      }

      // 2. County outlet(s) — the primary feed plus any extra local outlets.
      if (region) {
        const [primary, extra] = await Promise.all([
          rssProvider.fetch(region.feed).catch(() => []),
          fetchFeeds(region.extraFeeds),
        ]);
        return { place: region.label, scope: 'county', articles: mergeFeeds(primary, extra) };
      }

      // 3. Generalise to national.
      return { place: 'UK', scope: 'national', articles: dedupe(await rssProvider.fetch(DEFAULT_FEED)) };
    });
  },
};
