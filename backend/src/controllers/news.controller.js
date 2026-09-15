import { liveStreamService, relayStream } from '../services/news/liveStream.service.js';
import { Readable } from 'node:stream';
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

  // GET /api/news/stream?url=…  — follow a live-TV redirector the browser can't.
  stream: asyncHandler(async (req, res) => {
    res.json(await liveStreamService.resolve(req.query.url));
  }),

  // GET /api/news/hls?url=…  — relay a channel whose segments carry no CORS.
  hls: asyncHandler(async (req, res) => {
    const toProxyUrl = (url) => `/api/news/hls?url=${encodeURIComponent(url)}`;
    const result = await relayStream(req.query.url, { toProxyUrl });

    res.set('access-control-allow-origin', '*');
    res.set('cache-control', 'no-store'); // live: every segment is wanted fresh
    res.type(result.contentType);
    if (result.kind === 'playlist') {
      res.send(result.body);
      return;
    }
    // Stream the bytes rather than buffering a segment at a time.
    Readable.fromWeb(result.stream).pipe(res);
  }),
};
