import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import { fetchJson } from '../../../utils/httpClient.js';

// balldontlie — one key covers NBA (/nba/v1) and NFL (/nfl/v1). Auth via the
// Authorization header (raw key, no "Bearer").
const BASE = 'https://api.balldontlie.io';
const INTEGRATION = 'balldontlie';

/**
 * One request at a time, spaced out, with a retry when the tier says no.
 *
 * The free plan is rate limited per minute, and the card used to fire three
 * paginated reads at once — so the biggest of them (the whole season, four
 * pages) reliably came back 429 and the standings table silently arrived empty.
 * Queuing costs a little latency on a cold card and is the difference between a
 * table and no table at all.
 */
const GAP_MS = 300;
const RETRY_DELAYS = [700, 1800];
let queue = Promise.resolve();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimited = (error) => /429|too many requests/i.test(error?.message ?? '');

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(() => wait(GAP_MS), () => wait(GAP_MS));
  return run;
}

function get(sport, path) {
  const key = config.sports.balldontlieKey;
  if (!key) throw ApiError.notConfigured(INTEGRATION);
  const once = () =>
    fetchJson(`${BASE}/${sport}/v1${path}`, {
      integration: INTEGRATION,
      timeoutMs: 12_000,
      headers: { Authorization: key },
    });

  return enqueue(async () => {
    let lastError;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      try {
        return await once();
      } catch (error) {
        lastError = error;
        if (!isRateLimited(error) || attempt === RETRY_DELAYS.length) throw error;
        await wait(RETRY_DELAYS[attempt]);
      }
    }
    throw lastError;
  });
}

export const balldontlieProvider = {
  games: (sport, query = '') => get(sport, `/games${query}`),
  standings: (sport, season) => get(sport, `/standings?${new URLSearchParams({ season: String(season) })}`),
};
