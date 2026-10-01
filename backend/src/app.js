import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { isAllowedOrigin } from './config/env.js';
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
// (Vite hops to the next free port, e.g. 5176+, when the default is taken). The
// predicate is shared with the WebSocket gateway via isAllowedOrigin().
function corsOrigin(origin, callback) {
  callback(null, isAllowedOrigin(origin));
}

/**
 * Builds the app, and serves the built front end alongside it when there is one.
 *
 * @param {object} [opts]
 * @param {string} [opts.webRoot] a directory of built frontend files to serve
 */
export function createApp({ webRoot } = {}) {
  const app = express();

  // Rate limiting keys off req.ip, so Express must read the real client IP from
  // X-Forwarded-For rather than seeing every request as coming from the proxy
  // (Firebase Functions, or any reverse proxy in front of the API).
  app.set('trust proxy', true);

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  // Global ceiling for every API route. Stricter per-area limits (AI, writes)
  // are layered on inside routes/index.js.
  app.use('/api', apiLimiter, apiRouter);

  /*
   * The desktop build serves the front end from here too, so the whole app is
   * one origin on one port.
   *
   * That is not a convenience. Both OAuth redirects already point at this port,
   * every cookie and CORS rule is written for it, and the alternative — a
   * window loading file:// and talking across to localhost:4000 — turns every
   * one of those into a special case. Served from here there is nothing to
   * special-case: the window loads http://localhost:4000 and is same-origin
   * with its own API.
   *
   * In development this is simply absent, and Vite keeps serving the front end
   * with its hot reload.
   */
  if (webRoot && fs.existsSync(webRoot)) {
    app.use(express.static(webRoot, { index: false }));

    // Anything that isn't an API route or a real file is the single-page app,
    // which does its own routing — but only if it could be a route at all.
    //
    // A request with a file extension is asking for a file, and if it is not
    // there the honest answer is that it is not there. Handing it index.html
    // with a 200 is how a missing asset becomes invisible: MapLibre's worker
    // was fetched, served the HTML shell, failed to parse as JavaScript, and
    // took the whole map down without a single error in the console or a
    // single 404 in the network log.
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (path.extname(req.path)) return next();
      return res.sendFile(path.join(webRoot, 'index.html'), (error) => (error ? next() : undefined));
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ name: 'Pulse OS API', status: 'ok' });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
