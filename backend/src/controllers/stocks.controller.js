import { stocksService } from '../services/stocks/stocks.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const stocksController = {
  getQuote: asyncHandler(async (req, res) => {
    res.json(await stocksService.getQuote(req.params.symbol));
  }),

  // GET /api/stocks?symbols=AAPL,MSFT,TSLA
  getQuotes: asyncHandler(async (req, res) => {
    const symbols = (req.query.symbols ?? '').split(',').filter(Boolean);
    res.json({ quotes: await stocksService.getQuotes(symbols) });
  }),

  // GET /api/stocks/ticker — fixed live marquee (equities + crypto)
  getTicker: asyncHandler(async (_req, res) => {
    res.json({ ticker: await stocksService.getTicker() });
  }),
};
