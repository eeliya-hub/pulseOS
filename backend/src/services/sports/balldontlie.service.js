import { createCache } from '../../utils/cache.js';
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

function upcomingSeason(sport, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  // During the offseason, upcoming fixtures belong to the next season even
  // though standings still belong to the season that just finished.
  if (sport === 'nba') return m >= 6 ? y : currentSeason(sport, date);
  return m >= 2 ? y : currentSeason(sport, date);
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
function tallyStandings(games) {
  const rows = new Map();
  const bump = (name, result) => {
    if (!name) return;
    const row = rows.get(name) ?? { team: name, played: 0, won: 0, lost: 0, drawn: 0 };
    row.played += 1;
    row[result] += 1;
    rows.set(name, row);
  };
  for (const g of games) {
    if (g.homeScore == null || g.awayScore == null) continue;
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
  return [...rows.values()].map((r) => ({
    ...r,
    points: null,
    conference: null,
    record: `${r.won}-${r.lost}${r.drawn ? `-${r.drawn}` : ''}`,
  }));
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

  const upcomingQuery = () =>
    sport === 'nba'
      ? dateWindowQuery(0, 180)
      : seasonQuery(sport, upcomingSeason(sport));

  const recentQuery = () =>
    sport === 'nba'
      ? dateWindowQuery(-120, 0)
      : seasonQuery(sport, currentSeason(sport));

  const service = {
    async getStandings() {
      const season = currentSeason(sport);
      return safeWith(
        standingsCache,
        `${sport}:standings:${season}`,
        async () => {
          const games = (await allGames(sport, seasonQuery(sport, season))).filter(finished).map(gmeta);
          return tallyStandings(games)
            .sort(
              (a, b) =>
                winPercentage(b) - winPercentage(a) ||
                b.won - a.won ||
                a.lost - b.lost ||
                a.team.localeCompare(b.team),
            )
            .map((r, i) => ({ position: i + 1, ...r }));
        },
        [],
      );
    },

    async getUpcomingGames() {
      const today = offsetDay(0);
      return safe(
        `${sport}:upcoming`,
        async () =>
          (await allGames(sport, upcomingQuery()))
            .map(gmeta)
            .filter((g) => !finished(g) && dayOf(g.date) >= today)
            .sort((a, b) => new Date(a.date) - new Date(b.date)),
        [],
      );
    },

    async getRecentGames() {
      return safe(
        `${sport}:recent`,
        async () =>
          (await allGames(sport, recentQuery()))
            .filter(finished)
            .map(gmeta)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
        [],
      );
    },

    // Powers the unified team card.
    async teamSummary(team) {
      const [standings, upcoming, recent] = await Promise.all([
        this.getStandings(),
        this.getUpcomingGames(),
        this.getRecentGames(),
      ]);
      const involves = (g) => sameTeam(g.homeTeam, team) || sameTeam(g.awayTeam, team);
      return {
        league: sport.toUpperCase(),
        fixture: upcoming.find(involves) ?? null,
        results: recent.filter(involves).slice(0, 5),
        standings: standings.map((r) => ({ ...r, me: sameTeam(r.team, team) })),
      };
    },
  };

  return service;
}

export const nbaService = makeService('nba');
export const nflService = makeService('nfl');
