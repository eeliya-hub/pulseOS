import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

const BASE = 'https://gnews.io/api/v4';
const INTEGRATION = 'GNews';

function requireKey() {
  const key = config.news.gnewsKey;
  if (!key) throw ApiError.notConfigured(INTEGRATION);
  return key;
}

export const gnewsProvider = {
  async topHeadlines({ category = 'general', lang = 'en', country, max = 10 } = {}) {
    const key = requireKey();
    const params = new URLSearchParams({ category, lang, max: String(max), apikey: key });
    if (country) params.set('country', country); // omit for worldwide (more varied sources)
    return fetchJson(`${BASE}/top-headlines?${params}`, { integration: INTEGRATION });
  },

  async search({ query, lang = 'en', max = 10 }) {
    const key = requireKey();
    if (!query) throw ApiError.badRequest('Provide a `q` query parameter to search news.');
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&lang=${lang}&max=${max}&apikey=${key}`;
    return fetchJson(url, { integration: INTEGRATION });
  },
};
