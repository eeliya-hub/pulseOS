import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * Dependency-free, in-memory fixed-window rate limiter.
 *
 * Per (limiter, client) we keep a counter that resets when its window rolls
 * over. That's enough for a single-user dashboard whose real job is to stop a
 * runaway render loop or a stuck `setInterval` from hammering upstream
 * providers and burning their free-tier quotas.
 *
 * Caveat worth knowing: the counters live in the process. Behind several
 * Firebase Functions instances each instance gets its own window, so the
 * effective limit is `max × instances`. The AI spend cap does NOT rely on this
 * — see services/ai/quota.js, which is enforced against persisted counters.
 */
const buckets = new Map(); // `${name}:${client}` → { count, resetAt }

// Sweep expired entries so a long-running process doesn't grow a bucket per IP
// forever. Unref'd: an idle sweeper must not hold the event loop open.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000);
sweeper.unref?.();

/** Client identity: the real IP when behind a proxy (app sets `trust proxy`). */
const clientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/**
 * @param {object} options
 * @param {string} options.name    limiter id (also the bucket namespace)
 * @param {number} options.windowMs
 * @param {number} options.max     requests allowed per window per client (0 = disabled)
 * @param {(req) => string} [options.key] custom client key
 */
export function rateLimit({ name, windowMs, max, key = clientKey }) {
  return function rateLimitMiddleware(req, res, next) {
    if (!max || max <= 0) return next(); // cap of 0 disables the limiter

    const now = Date.now();
    const id = `${name}:${key(req)}`;
    let bucket = buckets.get(id);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    // IETF draft `RateLimit-*` headers — the frontend can read these to back off.
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(resetSeconds));

    if (bucket.count > max) {
      res.set('Retry-After', String(resetSeconds));
      logger.warn(`rate limit "${name}" hit by ${key(req)} → ${req.method} ${req.originalUrl}`);
      return next(
        ApiError.tooManyRequests(`Too many requests. Try again in ${resetSeconds}s.`, {
          details: { limiter: name, limit: max, windowMs, retryAfterSeconds: resetSeconds },
        }),
      );
    }

    return next();
  };
}

/** Broad ceiling for every /api route — catches runaway polling loops. */
export const apiLimiter = rateLimit({
  name: 'api',
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
});

/** Tighter ceiling for the AI route: paid-by-the-token, so it gets its own budget. */
export const aiLimiter = rateLimit({
  name: 'ai',
  windowMs: config.rateLimit.aiWindowMs,
  max: config.rateLimit.aiMax,
});

const writeLimiter = rateLimit({
  name: 'write',
  windowMs: config.rateLimit.writeWindowMs,
  max: config.rateLimit.writeMax,
});

/**
 * Mutations only (calendar events, playback control). Reads pass straight
 * through to the global limiter; anything that changes state upstream gets its
 * own, much smaller budget.
 */
export function mutationLimiter(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return writeLimiter(req, res, next);
}
