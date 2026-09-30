import { createCache } from '../../utils/cache.js';
import { teamGroup } from './teamGroups.js';
import { balldontlieProvider } from './providers/balldontlie.provider.js';

// NBA + NFL share balldontlie's shape, so one factory builds both services.
const cache = createCache(60 * 60 * 1000); // 1 hour — sports refresh hourly to respect rate limits
// Standings are derived by paging through the whole season's games (several
// requests) — cache them much longer than games/fixtures so we don't burn the
// free tier's tight rate limit on every card refresh.
const standingsCache = createCache(60 * 60 * 1000);

const norm = (s) => (s ?? '').toLowerCase();
const sameTeam = (a, b) => Boolean(a) && Boolean(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));
const teamName = (t) =>
  t?.full_name ?? [t?.city ?? t?.location, t?.name].filter(Boolean).join(' ') ?? t?.name ?? '';
const dayOf = (d) => (d ?? '').slice(0, 10);
const finished = (g) => /final|closed|complete/i.test(g.status ?? '');

function currentSeason(sport, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  // NBA tips off in Oct, NFL in Sep. Standings/recent results should stay on
  // the season that is currently active or most recently completed.
  return sport === 'nba' ? (m >= 9 ? y : y - 1) : m >= 8 ? y : y - 1;
}

function seasonQuery(sport, season) {
  const params = new URLSearchParams({ per_page: '100' });
  params.append('seasons[]', String(season));
  return params.toString();
}

function dateWindowQuery(startOffset, endOffset) {
  return `start_date=${offsetDay(startOffset)}&end_date=${offsetDay(endOffset)}&per_page=100`;
}

function offsetDay(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const mapGame = (sport) => (g) => ({
  id: g.id,
  homeTeam: teamName(g.home_team),
  awayTeam: teamName(g.visitor_team),
  date: g.date ?? g.datetime,
  status: g.status,
  homeScore: g.home_team_score ?? null,
  awayScore: g.visitor_team_score ?? null,
  competition: sport.toUpperCase(),
  week: g.week ?? null,
});

// balldontlie's /standings endpoint requires a paid plan (401 on free keys).
// Derive the table ourselves by tallying the season's finished games instead —
// works on every plan since /games is free-tier.
/**
 * Build the table from finished games, keeping each team's results in order so
 * form and streak come out of the same pass — both are the sort of thing these
 * tables are read for, and the games are already in hand.
 */
function tallyStandings(games, sport) {
  const rows = new Map();
  const bump = (name, result) => {
    if (!name) return;
    const row = rows.get(name) ?? { team: name, played: 0, won: 0, lost: 0, drawn: 0, sequence: [] };
    row.played += 1;
    row[result] += 1;
    row.sequence.push(result === 'won' ? 'W' : result === 'lost' ? 'L' : 'T');
    rows.set(name, row);
  };

  // Oldest first, so the tail of `sequence` is the most recent run.
  const played = games
    .filter((g) => g.homeScore != null && g.awayScore != null)
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));

  for (const g of played) {
    if (g.homeScore === g.awayScore) {
      bump(g.homeTeam, 'drawn');
      bump(g.awayTeam, 'drawn');
    } else if (g.homeScore > g.awayScore) {
      bump(g.homeTeam, 'won');
      bump(g.awayTeam, 'lost');
    } else {
      bump(g.awayTeam, 'won');
      bump(g.homeTeam, 'lost');
    }
  }

  return [...rows.values()].map((r) => {
    const { conference, division } = teamGroup(sport, r.team);
    return {
      ...r,
      points: null,
      conference,
      division,
      form: r.sequence.slice(-5), // last five, oldest of the five first
      streak: streakOf(r.sequence),
      record: `${r.won}-${r.lost}${r.drawn ? `-${r.drawn}` : ''}`,
      sequence: undefined,
    };
  });
}

/** "W3", "L2" — the run the team is currently on. */
function streakOf(sequence = []) {
  if (!sequence.length) return null;
  const last = sequence[sequence.length - 1];
  let run = 0;
  for (let i = sequence.length - 1; i >= 0 && sequence[i] === last; i -= 1) run += 1;
  return `${last}${run}`;
}

/**
 * Games behind the conference leader — the number every NBA and NFL table
 * leads with, and the one thing that says how live a playoff race is.
 */
function gamesBehind(leader, row) {
  if (!leader || leader === row) return 0;
  return ((leader.won - row.won) + (row.lost - leader.lost)) / 2;
}

function winPercentage(r) {
  if (!r.played) return 0;
  return (r.won + r.drawn * 0.5) / r.played;
}

async function safeWith(store, key, loader, fallback) {
  try {
    return await store.wrap(key, loader);
  } catch {
    return fallback;
  }
}
const safe = (key, loader, fallback) => safeWith(cache, key, loader, fallback);

// Follow balldontlie's cursor pagination up to a page cap (a full NFL season is
// ~300 games; NBA windows stay small so 1–2 pages suffice).
async function allGames(sport, query, maxPages = 4) {
  let cursor;
  let pages = 0;
  const out = [];
  do {
    const q = query + (cursor ? `&cursor=${cursor}` : '');
    const data = await balldontlieProvider.games(sport, `?${q}`);
    out.push(...(data.data ?? []));
    cursor = data.meta?.next_cursor;
    pages += 1;
  } while (cursor && pages < maxPages);
  return out;
}

function makeService(sport) {
  const gmeta = mapGame(sport);

  /**
   * Every game of a season, fetched once and shared.
   *
   * The table, the recent results and the next fixture all come out of this one
   * read. They used to be three separate paginated calls fired together, which
   * on a rate-limited tier meant they competed with each other and the table —
   * the biggest of the three — was usually the one that lost.
   */
  const seasonGames = (season) =>
    safeWith(
      standingsCache,
      `${sport}:games:${season}`,
      async () => {
        const games = (await allGames(sport, seasonQuery(sport, season))).map(gmeta);
        // An empty read is the tier saying no, not a season with no games in
        // it. Throwing leaves it uncached, so the next request tries again
        // rather than living with the blank for an hour.
        if (!games.length) throw new Error('no games');
        return games;
      },
      [],
    );

  // Windows to look back through, nearest first. A month of an NBA season is
  // about 360 games, which two pages covers; the wider spans only come into
  // play out of season, when there are few games in them by definition.
  const LOOKBACK = [
    [-30, 0],
    [-75, -30],
    [-150, -75],
    [-300, -150],
  ];

  /** The most recent window that has any games in it. */
  const latestWindow = async () => {
    for (const [from, to] of LOOKBACK) {
      const games = await windowGames(from, to);
      if (games.length) return games;
    }
    return [];
  };

  /** Games in a window around today. NBA only — the NFL endpoint ignores dates. */
  const windowGames = (from, to) =>
    safeWith(
      cache,
      `${sport}:window:${from}:${to}:${offsetDay(0)}`,
      async () => {
        const games = (await allGames(sport, dateWindowQuery(from, to), 2)).map(gmeta);
        if (!games.length) throw new Error('no games');
        return games;
      },
      [],
    );

  const service = {
    async getStandings() {
      const build = (season) =>
        safeWith(
          standingsCache,
          `${sport}:standings:${season}`,
          async () => {
            const games = (await seasonGames(season)).filter(finished);
            // Never cache an empty table. The season read is allowed to come back
            // empty when the tier says no, and storing that as the answer pins the
            // card to "no standings" for the whole hour — which is exactly how the
            // table came to be blank most of the time.
            if (!games.length) throw new Error('no finished games to tally');

            const byRecord = (a, b) =>
              winPercentage(b) - winPercentage(a) ||
              b.won - a.won ||
              a.lost - b.lost ||
              a.team.localeCompare(b.team);

            const table = tallyStandings(games, sport).sort(byRecord);

            // Seed within the conference as well as overall: the conference race
            // is what decides the playoffs, so that is the rank worth showing.
            const leaders = new Map();
            const seeds = new Map();
            for (const row of table) {
              if (!row.conference) continue;
              if (!leaders.has(row.conference)) leaders.set(row.conference, row);
              const seed = (seeds.get(row.conference) ?? 0) + 1;
              seeds.set(row.conference, seed);
              row.seed = seed;
              row.gamesBehind = gamesBehind(leaders.get(row.conference), row);
            }
            return table.map((r, i) => ({ position: i + 1, season, ...r }));
          },
          [],
        );

      const season = currentSeason(sport);
      const current = await build(season);
      if (current.length) return current;
      // Before a season has been played there is nothing to tally. Rather than an
      // empty table, show the one that just finished — which is what is actually
      // being talked about in the weeks before kickoff.
      return build(season - 1);
    },

    /**
     * The games still to come.
     *
     * In September the NBA's current season is the one that just ended, so the
     * fixtures belong to a season that has not started — which used to mean a
     * second whole-season read, four more paginated requests on a tier that is
     * rate limited per minute. With four followed teams warming at launch those
     * reads collided, came back 429, and the card said "no fixture" for an hour
     * over data that was sitting right there.
     *
     * The NBA endpoint honours start_date and end_date, so its fixtures come
     * from a window instead: one request, and no season arithmetic to be wrong
     * about. The NFL endpoint accepts those same parameters and ignores them
     * — asking it for June 2026 returns games from 2002 — so it keeps the
     * season read, which for the NFL is the season actually being played and is
     * the same cached list its results come from.
     */
    async getUpcomingGames() {
      const today = offsetDay(0);
      const pool = sport === 'nba' ? await windowGames(0, 120) : await seasonGames(currentSeason(sport));
      return pool
        .filter((g) => !finished(g) && dayOf(g.date) >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    /**
     * The games just played.
     *
     * The season read is paginated oldest-first and stops after four pages,
     * which for the NBA is about four hundred of roughly thirteen hundred
     * games — so "recent results" in September were games from the previous
     * December. The NFL season is short enough that four pages is all of it,
     * so it keeps the season read; the NBA walks back through date windows,
     * newest first, and stops at the first one with anything in it. That finds
     * the last games actually played in one or two requests whether the season
     * is running, in the playoffs, or three months over.
     */
    async getRecentGames() {
      const pool = sport === 'nba' ? await latestWindow() : await seasonGames(currentSeason(sport));
      return pool.filter(finished).sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // Powers the unified team card.
    async teamSummary(team) {
      // Standings come from ESPN now (one keyless request for the real table),
      // so this only pays for the fixture and recent results — both of which
      // read from the same cached season fetch.
      const upcoming = await this.getUpcomingGames();
      const recent = await this.getRecentGames();
      const involves = (g) => sameTeam(g.homeTeam, team) || sameTeam(g.awayTeam, team);
      const mine = upcoming.filter(involves);
      return {
        league: sport.toUpperCase(),
        fixture: mine[0] ?? null,
        fixtures: mine.slice(0, 6),
        results: recent.filter(involves).slice(0, 5),
        standings: [], // filled by the caller from ESPN; getStandings() is the fallback
      };
    },
  };

  return service;
}

export const nbaService = makeService('nba');
export const nflService = makeService('nfl');
