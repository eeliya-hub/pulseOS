import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

const BASE = 'https://finnhub.io/api/v1';
const INTEGRATION = 'Finnhub';

function requireKey() {
  const key = config.stocks.finnhubKey;
  if (!key) throw ApiError.notConfigured(INTEGRATION);
  return key;
}

export const finnhubProvider = {
  async quote(symbol) {
    const key = requireKey();
    const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    return fetchJson(url, { integration: INTEGRATION });
  },

  async profile(symbol) {
    const key = requireKey();
    const url = `${BASE}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    return fetchJson(url, { integration: INTEGRATION });
  },
};
