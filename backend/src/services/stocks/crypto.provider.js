import { fetchJson } from '../../utils/httpClient.js';

/**
 * Spot crypto prices, keyless, from Binance.
 *
 * This replaced CoinGecko, which stopped answering us at all: its free API now
 * returns 403 behind CloudFront with a user agent and 429 without one, which is
 * why the coins quietly disappeared off the marquee and left only the equities.
 * Binance needs no key, no account and no attribution, and covers everything a
 * person would put on a tape.
 *
 * Symbols are quoted against USDT, which tracks the dollar closely enough for a
 * ticker; a coin with no USDT spot pair is simply not a coin as far as this is
 * concerned, and that doubles as the check for whether a typed symbol means a
 * coin at all.
 */
const BASE = 'https://api.binance.com/api/v3';
const INTEGRATION = 'Binance';

export const cryptoProvider = {
  /**
   * @param {string[]} symbols plain tickers, e.g. ['BTC', 'ETH', 'SOL']
   * @returns {Promise<Map<string, {usd: number, change: number}>>} only the ones
   *   that are actually traded; anything else is absent rather than zero.
   */
  async prices(symbols) {
    const wanted = [...new Set((symbols ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
    if (!wanted.length) return new Map();

    // One small request each, rather than one batch: Binance rejects a batch
    // outright if a single symbol in it is not a real pair, and the whole point
    // here is that we do not know yet which of these are coins.
    const settled = await Promise.allSettled(
      wanted.map(async (symbol) => {
        const data = await fetchJson(`${BASE}/ticker/24hr?symbol=${encodeURIComponent(symbol)}USDT`, {
          integration: INTEGRATION,
          timeoutMs: 8000,
        });
        return [symbol, data];
      }),
    );

    const out = new Map();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const [symbol, data] = result.value;
      const usd = Number(data?.lastPrice);
      if (!Number.isFinite(usd) || usd <= 0) continue;
      out.set(symbol, { usd, change: Number(data?.priceChangePercent) || 0 });
    }
    return out;
  },
};
