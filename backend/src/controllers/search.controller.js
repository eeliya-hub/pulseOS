import { searchService } from '../services/search/search.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const FRESHNESS = new Set(['pd', 'pw', 'pm', 'py']);

export const searchController = {
  // GET /api/search?q=…&max=6&freshness=pw
  web: asyncHandler(async (req, res) => {
    const max = Number(req.query.max);
    const freshness = String(req.query.freshness || '');
    res.json(
      await searchService.search({
        query: req.query.q,
        max: Number.isFinite(max) ? Math.min(10, Math.max(1, max)) : undefined,
        freshness: FRESHNESS.has(freshness) ? freshness : undefined,
        readPages: req.query.readPages !== 'false',
      }),
    );
  }),

  // GET /api/search/status — which search provider is live.
  status: asyncHandler(async (_req, res) => {
    res.json(searchService.status());
  }),
};
