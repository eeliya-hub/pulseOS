import { newsService } from '../services/news/news.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const newsController = {
  headlines: asyncHandler(async (req, res) => {
    res.json(
      await newsService.headlines({
        category: req.query.category,
        lang: req.query.lang,
        country: req.query.country,
        max: req.query.max ? Number(req.query.max) : undefined,
      }),
    );
  }),

  search: asyncHandler(async (req, res) => {
    res.json(
      await newsService.search({
        query: req.query.q,
        lang: req.query.lang,
        max: req.query.max ? Number(req.query.max) : undefined,
      }),
    );
  }),

  // GET /api/news/local?q=ashford  (resolves the location → best local feed)
  local: asyncHandler(async (req, res) => {
    res.json(await newsService.local(req.query.q));
  }),
};
