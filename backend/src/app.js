import cors from 'cors';
import express from 'express';
import { config } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/index.js';

/**
 * Builds and configures the Express app WITHOUT starting a listener.
 *
 * Keeping construction separate from `listen()` is what makes this
 * Firebase-Functions ready: locally, src/index.js calls app.listen(); later,
 * functions/index.js can do `export const api = onRequest(createApp())` with no
 * changes to any route or service.
 */
// Allow the configured origins, plus ANY localhost/127.0.0.1 port in development
// (Vite hops to the next free port, e.g. 5176+, when the default is taken).
function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true); // curl, same-origin, server-to-server
  if (config.corsOrigins.includes(origin)) return callback(null, true);
  if (config.env !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
}

export function createApp() {
  const app = express();

  // Rate limiting keys off req.ip, so Express must read the real client IP from
  // X-Forwarded-For rather than seeing every request as coming from the proxy
  // (Firebase Functions, or any reverse proxy in front of the API).
  app.set('trust proxy', true);

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'Pulse OS API', status: 'ok' });
  });

  // Global ceiling for every API route. Stricter per-area limits (AI, writes)
  // are layered on inside routes/index.js.
  app.use('/api', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
