import { ApiError } from '../../utils/ApiError.js';
import { createCache } from '../../utils/cache.js';
import { cryptoProvider } from './crypto.provider.js';
import { finnhubProvider } from './finnhub.provider.js';

// Quotes: short cache to stay well under Finnhub's 60 req/min free limit.
// Company profiles barely change, so cache them for a day.
const quoteCache = createCache(60 * 1000);
const profileCache = createCache(24 * 60 * 60 * 1000);
const tickerCache = createCache(60 * 1000);

// What the marquee runs when nobody has said otherwise. VUSA (LSE) isn't on
// Finnhub's free tier; VOO is Vanguard's identical S&P 500 fund.
const DEFAULT_TICKER = ['AAPL', 'NVDA', 'TSLA', 'BTC', 'ETH', 'VOO'];
const coinCache = createCache(10 * 60 * 1000);

const normalizeQuote = (symbol, q, profile) => ({
  symbol,
  name: profile?.name,
  price: q.c,
  change: q.d,
  changePercent: q.dp,
  high: q.h,
  low: q.l,
  open: q.o,
  previousClose: q.pc,
  currency: profile?.currency,
  logo: profile?.logo,
  asOf: q.t ? q.t * 1000 : Date.now(),
});

export const stocksService = {
  async getQuote(symbol) {
    if (!symbol) throw ApiError.badRequest('Provide a stock `symbol` (e.g. AAPL).');
    const sym = symbol.toUpperCase();
    const [quote, profile] = await Promise.all([
      quoteCache.wrap(`q:${sym}`, () => finnhubProvider.quote(sym)),
      profileCache.wrap(`p:${sym}`, () => finnhubProvider.profile(sym)).catch(() => ({})),
    ]);
    return normalizeQuote(sym, quote, profile);
  },

  /**
   * Batch quotes for a watchlist. Finnhub free tier is per-request, so fan out.
   * Individual failures are dropped rather than failing the whole list.
   */
  async getQuotes(symbols) {
    if (!symbols?.length) throw ApiError.badRequest('Provide a comma-separated `symbols` list.');
    const results = await Promise.allSettled(symbols.map((s) => this.getQuote(s.trim())));
    return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  },

  /**
   * Live data for the top-of-page marquee, for whatever symbols it is set to.
   *
   * Nothing declares up front whether a symbol is an equity or a coin, because
   * asking someone to say so is asking them to know which of the two APIs we
   * happen to use. Crypto is asked first and an unlisted symbol falls through to
   * Finnhub. That order matters: there are thinly traded equities ticking as
   * BTC, ETH and XRP, and Finnhub answers for them, so asking it first put
   * Bitcoin on the tape at thirty-seven dollars.
   *
   * Returns { symbol, price, change } where `change` is a fraction (0.018 =
   * +1.8%). A source that fails is omitted rather than fatal, so a missing
   * Finnhub key still leaves the crypto entries running.
   *
   * @param {string[]} [symbols] defaults to DEFAULT_TICKER
   */
  async getTicker(symbols) {
    const wanted = (symbols?.length ? symbols : DEFAULT_TICKER)
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 24); // a marquee, not a portfolio
    if (!wanted.length) return [];

    return tickerCache.wrap(`ticker:${wanted.join(',')}`, async () => {
      const coins = await coinCache
        .wrap(`coins:${wanted.join(',')}`, () => cryptoProvider.prices(wanted))
        .catch(() => new Map());

      const rest = wanted.filter((s) => !coins.has(s));
      const quotes = rest.length ? await this.getQuotes(rest).catch(() => []) : [];
      const byStock = new Map(quotes.filter((q) => q.price).map((q) => [q.symbol, q]));

      const rows = [];
      for (const symbol of wanted) {
        const coin = coins.get(symbol);
        if (coin) {
          rows.push({ symbol, price: coin.usd, change: coin.change / 100 });
          continue;
        }
        const q = byStock.get(symbol);
        if (q) rows.push({ symbol, price: q.price, change: (q.changePercent ?? 0) / 100 });
      }
      return rows;
    });
  },
};
