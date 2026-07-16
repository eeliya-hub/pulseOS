import { ApiError } from '../../utils/ApiError.js';
import { createCache } from '../../utils/cache.js';
import { coingeckoProvider } from './coingecko.provider.js';
import { finnhubProvider } from './finnhub.provider.js';

// Quotes: short cache to stay well under Finnhub's 60 req/min free limit.
// Company profiles barely change, so cache them for a day.
const quoteCache = createCache(60 * 1000);
const profileCache = createCache(24 * 60 * 60 * 1000);
const tickerCache = createCache(60 * 1000);

// Fixed marquee for the top-of-page ticker (matches the original mock — no
// customisation). Equities go through Finnhub, crypto through CoinGecko.
const TICKER = [
  { symbol: 'AAPL', kind: 'stock' },
  { symbol: 'NVDA', kind: 'stock' },
  { symbol: 'TSLA', kind: 'stock' },
  { symbol: 'BTC', kind: 'crypto', id: 'bitcoin' },
  { symbol: 'ETH', kind: 'crypto', id: 'ethereum' },
  // VUSA (LSE) isn't on Finnhub's free tier; VOO is Vanguard's identical S&P 500 fund.
  { symbol: 'VOO', kind: 'stock' },
];

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
   * Live data for the fixed top-of-page ticker. Equities via Finnhub, crypto via
   * CoinGecko (no key). Returns { symbol, price, change } where `change` is a
   * fraction (e.g. 0.018 = +1.8%). Any source that fails is simply omitted, so a
   * missing Finnhub key still leaves the crypto entries live.
   */
  async getTicker() {
    return tickerCache.wrap('ticker', async () => {
      const stockSymbols = TICKER.filter((t) => t.kind === 'stock').map((t) => t.symbol);
      const cryptoIds = TICKER.filter((t) => t.kind === 'crypto').map((t) => t.id);

      const [quotes, prices] = await Promise.all([
        this.getQuotes(stockSymbols).catch(() => []),
        coingeckoProvider.prices(cryptoIds).catch(() => ({})),
      ]);

      const byStock = new Map(quotes.map((q) => [q.symbol, q]));
      const rows = [];
      for (const t of TICKER) {
        if (t.kind === 'stock') {
          const q = byStock.get(t.symbol);
          if (q?.price) rows.push({ symbol: t.symbol, price: q.price, change: (q.changePercent ?? 0) / 100 });
        } else {
          const p = prices[t.id];
          if (p?.usd) rows.push({ symbol: t.symbol, price: p.usd, change: (p.usd_24h_change ?? 0) / 100 });
        }
      }
      return rows;
    });
  },
};
