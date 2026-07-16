import { createCache } from '../../utils/cache.js';
import { footballDataProvider } from './providers/footballData.provider.js';

const cache = createCache(60 * 60 * 1000); // 1 hour — sports refresh hourly to respect rate limits
const teamsCache = createCache(24 * 60 * 60 * 1000); // squad lists rarely change

const norm = (s) => (s ?? '').toLowerCase();
const sameTeam = (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));

const mapFixture = (m) => ({
  id: m.id,
  homeTeam: m.homeTeam?.name,
  awayTeam: m.awayTeam?.name,
  homeCrest: m.homeTeam?.crest,
  awayCrest: m.awayTeam?.crest,
  date: m.utcDate,
  competition: m.competition?.name,
  status: m.status,
  homeScore: m.score?.fullTime?.home ?? null,
  awayScore: m.score?.fullTime?.away ?? null,
  matchday: m.matchday,
});

const mapStanding = (r) => ({
  position: r.position,
  team: r.team?.name,
  crest: r.team?.crest,
  played: r.playedGames,
  won: r.won,
  drawn: r.draw,
  lost: r.lost,
  goalDifference: r.goalDifference,
  points: r.points,
});

async function safe(key, loader, fallback) {
  try {
    return await cache.wrap(key, loader);
  } catch {
    return fallback;
  }
}

export const footballService = {
  async getStandings(competition) {
    return safe(
      `fb:standings:${competition}`,
      async () => {
        const data = await footballDataProvider.standings(competition);
        const total = (data.standings ?? []).find((s) => s.type === 'TOTAL') ?? (data.standings ?? [])[0];
        // Football-Data.org returns position:1 for every row before a ball is
        // kicked (pre-season, all-zero stats) — renumber by table order instead
        // of trusting the API's position field.
        const table = (total?.table ?? []).map(mapStanding).map((r, i) => ({ ...r, position: i + 1 }));
        return { competition: data.competition?.name, table };
      },
      { competition: null, table: [] },
    );
  },

  async getUpcomingFixtures(competition) {
    return safe(
      `fb:upcoming:${competition}`,
      async () => (await footballDataProvider.competitionMatches(competition, 'SCHEDULED')).matches?.map(mapFixture) ?? [],
      [],
    );
  },

  async getRecentResults(competition) {
    return safe(
      `fb:results:${competition}`,
      async () => {
        const data = await footballDataProvider.competitionMatches(competition, 'FINISHED');
        return (data.matches ?? [])
          .map(mapFixture)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
      },
      [],
    );
  },

  // Powers the unified team card: the team's next fixture, recent results, and
  // the league table with that team flagged.
  async teamSummary(competition, teamName) {
    const standings = await this.getStandings(competition);
    const team = await teamsCache
      .wrap(`fb:teams:${competition}`, () => footballDataProvider.teams(competition))
      .then((d) => (d.teams ?? []).find((t) => sameTeam(t.name, teamName)) ?? null)
      .catch(() => null);

    let fixture = null;
    let results = [];
    if (team) {
      const [nextRaw, lastRaw] = await Promise.all([
        cache.wrap(`fb:teamnext:${team.id}`, () => footballDataProvider.teamMatches(team.id, 'SCHEDULED', 1)).catch(() => ({})),
        cache.wrap(`fb:teamlast:${team.id}`, () => footballDataProvider.teamMatches(team.id, 'FINISHED', 5)).catch(() => ({})),
      ]);
      fixture = (nextRaw.matches ?? []).map(mapFixture)[0] ?? null;
      results = (lastRaw.matches ?? []).map(mapFixture).reverse();
    }

    return {
      league: standings.competition,
      badge: team?.crest,
      fixture,
      results,
      standings: standings.table.map((r) => ({ ...r, me: sameTeam(r.team, teamName) })),
    };
  },
};
