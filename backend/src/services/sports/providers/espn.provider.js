import { fetchJson } from '../../../utils/httpClient.js';

/**
 * ESPN's public standings feed — free, keyless, and complete.
 *
 * The NBA and NFL tables used to be tallied from balldontlie's games endpoint,
 * which the free tier limits to five requests a minute. A full NBA season is
 * 1,230 games — thirteen pages — so the tally was both slow enough to trip the
 * limit and, once capped, built from only the first few hundred games of the
 * season. This returns the real table, already grouped by conference and
 * carrying the seed, games behind and streak, in a single request.
 */
const BASE = 'https://site.api.espn.com/apis/v2/sports';
const PATHS = { nba: 'basketball/nba', nfl: 'football/nfl' };
const INTEGRATION = 'ESPN standings';

const statOf = (entry, name) => entry.stats?.find((s) => s.name === name);
const num = (entry, name) => {
  const raw = statOf(entry, name)?.value;
  return Number.isFinite(raw) ? raw : null;
};
const text = (entry, name) => statOf(entry, name)?.displayValue ?? null;

export const espnProvider = {
  /**
   * One conference-grouped table.
   * @returns {Promise<Array<{conference,seed,team,won,lost,drawn,winPct,gamesBehind,streak}>>}
   */
  async standings(sport) {
    const path = PATHS[sport];
    if (!path) return [];
    const data = await fetchJson(`${BASE}/${path}/standings`, { integration: INTEGRATION, timeoutMs: 12_000 });

    const rows = [];
    for (const group of data.children ?? []) {
      const conference = group.abbreviation || group.name || null;
      for (const entry of group.standings?.entries ?? []) {
        const behind = text(entry, 'gamesBehind');
        rows.push({
          conference,
          seed: num(entry, 'playoffSeed'),
          team: entry.team?.displayName ?? '',
          won: num(entry, 'wins') ?? 0,
          lost: num(entry, 'losses') ?? 0,
          drawn: num(entry, 'ties') ?? 0,
          winPct: num(entry, 'winPercent'),
          // ESPN writes the leader's gap as "-"; everyone else gets a number.
          gamesBehind: behind === '-' ? 0 : Number(behind) || 0,
          streak: text(entry, 'streak'),
        });
      }
    }
    return rows;
  },
};
