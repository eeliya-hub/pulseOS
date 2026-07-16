import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { usageMeter } from '../../utils/usageMeter.js';

/**
 * Hard spend cap for the AI providers.
 *
 * Rate limiting (middleware/rateLimit.js) shapes *bursts*; this caps *totals*.
 * They are separate on purpose: 10 requests/minute is still ~14k requests/day,
 * which would blow through Gemini's free tier by two orders of magnitude.
 *
 * The counters are persisted (utils/usageMeter.js), so restarts don't refill
 * the day's budget, and the check runs BEFORE the upstream call — a cap can be
 * reached but never exceeded.
 *
 * The Gemini defaults (config.ai.quota.gemini) sit under Google's free-tier
 * limits for Flash. Staying under them means Google has nothing to bill, even
 * if the key belongs to a project with billing enabled.
 */
const scopeOf = (providerId) => `ai:${providerId}`;

/** Throws 429 if this provider has already reached one of its caps. */
export function assertQuota(providerId) {
  const limits = config.ai.quota[providerId];
  if (!limits) return;

  const hit = usageMeter.exceeded(scopeOf(providerId), limits);
  if (!hit) return;

  const unit = hit.metric === 'tokens' ? 'token' : 'request';
  logger.warn(`AI quota reached: ${providerId} used ${hit.used}/${hit.limit} ${unit}s this ${hit.period}`);

  throw ApiError.tooManyRequests(
    `${providerId} ${unit} cap reached (${hit.used}/${hit.limit} this ${hit.period}). ` +
      `This cap exists to keep usage inside the free tier — it resets at ${hit.resetAt}.`,
    {
      code: 'AI_QUOTA_EXCEEDED',
      details: { provider: providerId, ...hit },
    },
  );
}

/**
 * Counts an attempt, BEFORE it goes upstream. Failed calls count too: otherwise
 * a client retrying against a broken key (or a provider erroring after the model
 * has already run — which is still billable) could loop past the cap all day.
 */
export function recordRequest(providerId) {
  usageMeter.record(scopeOf(providerId), { requests: 1 });
}

/** Adds the tokens a completed call actually burned, once the provider reports them. */
export function recordTokens(providerId, usage) {
  const tokens = usage?.totalTokens ?? 0;
  if (tokens > 0) usageMeter.record(scopeOf(providerId), { requests: 0, tokens });
}

/** Snapshot for GET /api/usage — what's been spent and what's left. */
export function quotaSnapshot() {
  return Object.fromEntries(
    Object.entries(config.ai.quota).map(([providerId, limits]) => {
      const used = usageMeter.peek(scopeOf(providerId), Object.keys(limits));
      const periods = Object.fromEntries(
        Object.entries(limits).map(([period, limit]) => [
          period,
          {
            requests: { used: used[period].requests, limit: limit.requests ?? null },
            tokens: { used: used[period].tokens, limit: limit.tokens ?? null },
            resetAt: used[period].resetAt,
          },
        ]),
      );
      return [providerId, { blocked: Boolean(usageMeter.exceeded(scopeOf(providerId), limits)), periods }];
    }),
  );
}
