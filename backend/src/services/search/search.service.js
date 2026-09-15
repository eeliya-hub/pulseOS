import { createCache } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { braveProvider } from './brave.provider.js';
import { openWebProvider } from './openWeb.provider.js';
import { isReadableUrl, readPage } from './pageText.js';
import { tavilyProvider } from './tavily.provider.js';

// Search the live internet. Providers are tried best-first; the keyless open-web
// provider is last and always available, so search NEVER hard-fails for want of
// an API key — adding one just makes the results better.
const CHAIN = [braveProvider, tavilyProvider, openWebProvider];

// Long enough that a chatty back-and-forth about one topic hits the cache,
// short enough that "what's happening now" stays genuinely now.
const cache = createCache(10 * 60 * 1000);

// How many thin results get their page fetched, and how much text we keep. Two
// pages in parallel costs ~1–2s and is the difference between the model quoting
// a search snippet and it actually knowing what the page says.
const ENRICH_COUNT = 4;
const ENRICH_CHARS = 2500;
// Search snippets top out around 200 characters — rarely enough to answer from,
// so anything under this counts as thin and gets its page read.
const THIN_SNIPPET = 500;

/**
 * Fetch the readable text of the first few results whose snippet is too thin to
 * answer from. Failures are silent — enrichment is a bonus, never a dependency.
 */
async function enrich(results) {
  // Skip results we already have the text of, and links that can't be read
  // (redirect wrappers), so the budget goes to pages that will actually return.
  const targets = results
    .filter((r) => !r.content && (r.snippet || '').length < THIN_SNIPPET && isReadableUrl(r.url))
    .slice(0, ENRICH_COUNT);
  if (!targets.length) return results;

  await Promise.all(
    targets.map(async (r) => {
      const text = await readPage(r.url, { maxChars: ENRICH_CHARS });
      if (text) r.content = text;
    }),
  );
  return results;
}

export const searchService = {
  /** Which provider will be used, and what else is available. */
  status() {
    const active = CHAIN.find((p) => p.isConfigured());
    return {
      active: active?.id ?? openWebProvider.id,
      brave: braveProvider.isConfigured(),
      tavily: tavilyProvider.isConfigured(),
      // The keyless fallback needs nothing, so search is always on.
      keyless: true,
    };
  },

  /**
   * @param {object} p
   * @param {string} p.query
   * @param {number} [p.max]        how many results to return (default 6)
   * @param {'pd'|'pw'|'pm'|'py'} [p.freshness]  restrict to the past day/week/month/year
   * @param {boolean} [p.readPages] fetch page text for thin results (default true)
   */
  async search({ query, max = 8, freshness, readPages = true } = {}) {
    const q = (query || '').trim();
    if (!q) throw ApiError.badRequest('Provide a `q` query parameter to search the web.');

    return cache.wrap(`search:${q.toLowerCase()}:${max}:${freshness ?? ''}:${readPages}`, async () => {
      let lastError = null;

      for (const provider of CHAIN) {
        if (!provider.isConfigured()) continue;
        try {
          const res = await provider.search({ query: q, max, freshness });
          if (!res.results?.length) {
            lastError = new Error(`${provider.id} returned no results`);
            continue; // fall through to the next provider rather than answer empty
          }
          const results = readPages ? await enrich(res.results) : res.results;
          return { query: q, provider: res.provider ?? provider.id, answer: res.answer ?? null, results };
        } catch (err) {
          lastError = err;
          logger.warn(`Search provider ${provider.id} failed: ${err.message}`);
        }
      }

      // Everything came back empty. That's an answer in itself — "I searched and
      // found nothing" is far more useful to the assistant than an exception it
      // has to interpret, which is how "I can't access the internet" slips out.
      logger.warn(`Search found nothing for "${q}": ${lastError?.message ?? 'no results'}`);
      return {
        query: q,
        provider: 'none',
        answer: null,
        results: [],
        note: 'No results came back — the keyless search engines are rate-limiting. Say you could not find anything rather than guessing, and suggest trying again shortly.',
      };
    });
  },
};
