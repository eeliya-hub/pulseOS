import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import { fetchJson } from '../../../utils/httpClient.js';

// Football-Data.org v4. Auth via X-Auth-Token. Free tier: ~10 req/min, major
// competitions (PL, PD, SA, BL1, FL1, CL, …). Must be called server-side (no CORS).
const BASE = 'https://api.football-data.org/v4';
const INTEGRATION = 'Football-Data.org';

function get(path) {
  const key = config.sports.footballDataKey;
  if (!key) throw ApiError.notConfigured(INTEGRATION);
  return fetchJson(`${BASE}${path}`, {
    integration: INTEGRATION,
    timeoutMs: 12_000,
    headers: { 'X-Auth-Token': key },
  });
}

export const footballDataProvider = {
  standings: (code) => get(`/competitions/${code}/standings`),
  competitionMatches: (code, status) => get(`/competitions/${code}/matches?status=${status}`),
  teams: (code) => get(`/competitions/${code}/teams`),
  teamMatches: (teamId, status, limit = 5) =>
    get(`/teams/${teamId}/matches?status=${status}&limit=${limit}`),
};
