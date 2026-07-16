import { sportsService } from '../services/sports/sports.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const { footballService, nbaService, nflService, f1Service } = sportsService;

export const sportsController = {
  // Unified card data for one followed team/constructor.
  // GET /api/sports/team?name=Arsenal&sport=football&league=39
  team: asyncHandler(async (req, res) => {
    const { name, sport, league, leagueLabel } = req.query;
    res.json(await sportsService.team(name, sport, league, leagueLabel));
  }),

  // ── Football (Football-Data.org) ──────────────────────────────────────────
  footballStandings: asyncHandler(async (req, res) => {
    res.json(await footballService.getStandings(req.query.competition ?? 'PL'));
  }),
  footballFixtures: asyncHandler(async (req, res) => {
    const code = req.query.competition ?? 'PL';
    const fixtures =
      req.query.type === 'results'
        ? await footballService.getRecentResults(code)
        : await footballService.getUpcomingFixtures(code);
    res.json({ competition: code, fixtures });
  }),

  // ── NBA (balldontlie) ─────────────────────────────────────────────────────
  nbaStandings: asyncHandler(async (_req, res) => res.json(await nbaService.getStandings())),
  nbaGames: asyncHandler(async (req, res) => {
    const games = req.query.type === 'recent' ? await nbaService.getRecentGames() : await nbaService.getUpcomingGames();
    res.json({ games });
  }),

  // ── NFL (balldontlie) ─────────────────────────────────────────────────────
  nflStandings: asyncHandler(async (_req, res) => res.json(await nflService.getStandings())),
  nflGames: asyncHandler(async (req, res) => {
    const games = req.query.type === 'recent' ? await nflService.getRecentGames() : await nflService.getUpcomingGames();
    res.json({ games });
  }),

  // ── Formula 1 (Jolpica) ───────────────────────────────────────────────────
  f1Races: asyncHandler(async (req, res) => {
    res.json(req.query.type === 'last' ? await f1Service.getRecentResults() : { races: await f1Service.getUpcomingRaces() });
  }),
  f1Standings: asyncHandler(async (req, res) => {
    const constructors = req.query.type === 'constructors';
    res.json({
      type: constructors ? 'constructors' : 'drivers',
      standings: constructors ? await f1Service.getConstructorStandings() : await f1Service.getDriverStandings(),
    });
  }),
};
