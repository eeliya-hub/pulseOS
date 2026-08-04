import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

// Brave Search API — the best-quality web results of the keyed providers.
// Free tier: 1 query/second, ~2,000/month. https://api-dashboard.search.brave.com
const BASE = 'https://api.search.brave.com/res/v1/web/search';
const INTEGRATION = 'Brave Search';

export const braveProvider = {
  id: 'brave',
  isConfigured: () => Boolean(config.search.braveKey),

  async search({ query, max = 8, country = 'GB', freshness }) {
    const key = config.search.braveKey;
    if (!key) throw ApiError.notConfigured(INTEGRATION);

    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(20, max)),
      country,
      safesearch: 'moderate',
      text_decorations: 'false',
    });
    // 'pd' past day, 'pw' past week, 'pm' past month, 'py' past year.
    if (freshness) params.set('freshness', freshness);

    const data = await fetchJson(`${BASE}?${params}`, {
      integration: INTEGRATION,
      headers: { accept: 'application/json', 'accept-encoding': 'gzip', 'x-subscription-token': key },
    });

    return {
      provider: this.id,
      // Brave's own summarised answer isn't on the free tier; snippets carry it.
      answer: null,
      results: (data.web?.results ?? []).slice(0, max).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description ?? '',
        source: r.profile?.name ?? r.meta_url?.hostname ?? null,
        publishedAt: r.page_age ?? r.age ?? null,
      })),
    };
  },
};
