import { Router } from 'express';
import { stocksController } from '../controllers/stocks.controller.js';

export const stocksRouter = Router();

// GET /api/stocks?symbols=AAPL,MSFT
stocksRouter.get('/', stocksController.getQuotes);
// GET /api/stocks/ticker — fixed live marquee (must precede /:symbol)
stocksRouter.get('/ticker', stocksController.getTicker);
// GET /api/stocks/AAPL
stocksRouter.get('/:symbol', stocksController.getQuote);
