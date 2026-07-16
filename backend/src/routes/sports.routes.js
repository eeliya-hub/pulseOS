import { Router } from 'express';
import { sportsController } from '../controllers/sports.controller.js';

export const sportsRouter = Router();

// Unified card data for a followed team/constructor.
// GET /api/sports/team?name=Arsenal&sport=football&league=39
sportsRouter.get('/team', sportsController.team);

// Football — Football-Data.org
sportsRouter.get('/football/standings', sportsController.footballStandings); // ?competition=PL
sportsRouter.get('/football/fixtures', sportsController.footballFixtures); // ?competition=PL&type=upcoming|results

// NBA — balldontlie
sportsRouter.get('/nba/standings', sportsController.nbaStandings);
sportsRouter.get('/nba/games', sportsController.nbaGames); // ?type=upcoming|recent

// NFL — balldontlie
sportsRouter.get('/nfl/standings', sportsController.nflStandings);
sportsRouter.get('/nfl/games', sportsController.nflGames); // ?type=upcoming|recent

// Formula 1 — Jolpica
sportsRouter.get('/f1/races', sportsController.f1Races); // ?type=upcoming|last
sportsRouter.get('/f1/standings', sportsController.f1Standings); // ?type=drivers|constructors
