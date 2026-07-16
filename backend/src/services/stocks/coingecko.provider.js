import { fetchJson } from '../../utils/httpClient.js';

// CoinGecko simple price — free, no API key. Used for the crypto entries in the
// ticker (Finnhub's free /quote covers US equities only).
const BASE = 'https://api.coingecko.com/api/v3';
const INTEGRATION = 'CoinGecko';

export const coingeckoProvider = {
  // ids: e.g. ['bitcoin','ethereum'] -> { bitcoin: { usd, usd_24h_change }, ... }
  async prices(ids) {
    if (!ids?.length) return {};
    const url = `${BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    return fetchJson(url, { integration: INTEGRATION, headers: { 'user-agent': 'PulseOS/0.1' } });
  },
};
