import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import { fetchJson } from '../../../utils/httpClient.js';

// balldontlie — one key covers NBA (/nba/v1) and NFL (/nfl/v1). Auth via the
// Authorization header (raw key, no "Bearer").
const BASE = 'https://api.balldontlie.io';
const INTEGRATION = 'balldontlie';

function get(sport, path) {
  const key = config.sports.balldontlieKey;
  if (!key) throw ApiError.notConfigured(INTEGRATION);
  return fetchJson(`${BASE}/${sport}/v1${path}`, {
    integration: INTEGRATION,
    timeoutMs: 12_000,
    headers: { Authorization: key },
  });
}

export const balldontlieProvider = {
  games: (sport, query = '') => get(sport, `/games${query}`),
  standings: (sport, season) => get(sport, `/standings?${new URLSearchParams({ season: String(season) })}`),
};
