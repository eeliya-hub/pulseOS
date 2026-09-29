import { createCache } from '../../utils/cache.js';
import { footballDataProvider } from './providers/footballData.provider.js';

const cache = createCache(60 * 60 * 1000); // 1 hour — sports refresh hourly to respect rate limits
const teamsCache = createCache(24 * 60 * 60 * 1000); // squad lists rarely change

const norm = (s) => (s ?? '').toLowerCase();
const sameTeam = (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));

const mapFixture = (m) => ({
  id: m.id,
  homeId: m.homeTeam?.id ?? null,
  homeTeam: m.homeTeam?.name,
  awayTeam: m.awayTeam?.name,
  // The short name is what a person calls the club ("Leeds United", not "Leeds
  // United FC") and the TLA is what a scoreboard shows. Both were being thrown
  // away in favour of the full registered name.
  homeShort: m.homeTeam?.shortName ?? m.homeTeam?.name ?? null,
  awayShort: m.awayTeam?.shortName ?? m.awayTeam?.name ?? null,
  homeTla: m.homeTeam?.tla ?? null,
  awayTla: m.awayTeam?.tla ?? null,
  homeCrest: m.homeTeam?.crest,
  awayCrest: m.awayTeam?.crest,
  date: m.utcDate,
  competition: m.competition?.name,
  competitionEmblem: m.competition?.emblem ?? null,
  status: m.status,
  homeScore: m.score?.fullTime?.home ?? null,
  awayScore: m.score?.fullTime?.away ?? null,
  matchday: m.matchday,
});

/**
 * The ground a fixture is played at, which the match object doesn't carry on the
 * free tier — it comes off the home club instead. Cached for a day, because a
 * stadium is the one thing about a football club that doesn't change weekly, and
 * because the free tier allows ten requests a minute and this is a second call
 * per fixture.
 */
async function homeGround(homeId) {
  if (!homeId) return null;
  return teamsCache
    .wrap(`fb:team:${homeId}`, () => footballDataProvider.team(homeId))
    .then((t) => (t?.venue ? { venue: t.venue, colours: t.clubColors ?? null } : null))
    .catch(() => null);
}

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
    let fixtures = [];
    let results = [];
    if (team) {
      const [nextRaw, lastRaw] = await Promise.all([
        cache.wrap(`fb:teamnext:${team.id}`, () => footballDataProvider.teamMatches(team.id, 'SCHEDULED', 6)).catch(() => ({})),
        cache.wrap(`fb:teamlast:${team.id}`, () => footballDataProvider.teamMatches(team.id, 'FINISHED', 5)).catch(() => ({})),
      ]);
      fixtures = (nextRaw.matches ?? []).map(mapFixture);
      fixture = fixtures[0] ?? null;
      results = (lastRaw.matches ?? []).map(mapFixture).reverse();
      // Only the next one is worth a second call for its ground: it is the only
      // fixture that gets a photograph, and the free tier counts requests.
      if (fixture) {
        const ground = await homeGround(fixture.homeId);
        fixture = { ...fixture, venue: ground?.venue ?? null, homeColours: ground?.colours ?? null };
        fixtures = [fixture, ...fixtures.slice(1)];
      }
    }

    return {
      league: standings.competition,
      badge: team?.crest,
      fixture,
      fixtures,
      results,
      standings: standings.table.map((r) => ({ ...r, me: sameTeam(r.team, teamName) })),
    };
  },
};
