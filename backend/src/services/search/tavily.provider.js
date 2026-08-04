import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

// Tavily — a search API built for LLMs: it returns page content alongside each
// result plus a direct answer, so the model rarely needs a follow-up fetch.
// Free tier: ~1,000 searches/month, no card. https://app.tavily.com
const BASE = 'https://api.tavily.com/search';
const INTEGRATION = 'Tavily';

export const tavilyProvider = {
  id: 'tavily',
  isConfigured: () => Boolean(config.search.tavilyKey),

  async search({ query, max = 8, freshness }) {
    const key = config.search.tavilyKey;
    if (!key) throw ApiError.notConfigured(INTEGRATION);

    // Brave-style freshness codes → Tavily's day window.
    const days = { pd: 1, pw: 7, pm: 30, py: 365 }[freshness];

    const data = await fetchJson(BASE, {
      integration: INTEGRATION,
      method: 'POST',
      timeoutMs: 15_000,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query,
        max_results: Math.min(10, max),
        search_depth: 'basic',
        include_answer: true,
        ...(days ? { days, topic: 'news' } : {}),
      }),
    });

    return {
      provider: this.id,
      answer: typeof data.answer === 'string' ? data.answer.trim() || null : null,
      results: (data.results ?? []).slice(0, max).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: (r.content ?? '').slice(0, 400),
        content: r.raw_content ?? r.content ?? null,
        source: (() => {
          try {
            return new URL(r.url).hostname.replace(/^www\./, '');
          } catch {
            return null;
          }
        })(),
        publishedAt: r.published_date ?? null,
      })),
    };
  },
};
