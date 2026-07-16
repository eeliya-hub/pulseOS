import { createCache } from '../../utils/cache.js';
import { footballService } from './football.service.js';
import { nbaService, nflService } from './balldontlie.service.js';
import { constructorLogo } from './f1Logos.js';
import { f1Service } from './f1.service.js';
import { nbaLogo, nflLogo } from './teamLogos.js';

// Dispatcher that adapts the four per-sport services into the single shape the
// Sports card already consumes. Keeps API-specific concerns out of the UI.
const cache = createCache(60 * 60 * 1000); // 1 hour — sports refresh hourly to respect rate limits

// Map the catalog's league identifiers (API-Sports ids or labels) to
// Football-Data.org competition codes.
const FD_BY_ID = { 39: 'PL', 140: 'PD', 135: 'SA', 78: 'BL1', 61: 'FL1', 2: 'CL' };
const FD_BY_LABEL = {
  'premier league': 'PL',
  'la liga': 'PD',
  'serie a': 'SA',
  bundesliga: 'BL1',
  'ligue 1': 'FL1',
  'champions league': 'CL',
};

function competitionCode(league, label) {
  if (league != null && league !== '') {
    const s = String(league).trim();
    if (/^[A-Za-z]{2,4}\d?$/.test(s) && Number.isNaN(Number(s))) return s.toUpperCase();
    if (FD_BY_ID[Number(s)]) return FD_BY_ID[Number(s)];
  }
  if (label && FD_BY_LABEL[label.toLowerCase()]) return FD_BY_LABEL[label.toLowerCase()];
  return 'PL';
}

const splitIso = (iso) => {
  if (!iso) return { date: null, time: '' };
  const s = String(iso);
  return { date: s.slice(0, 10), time: s.length > 10 ? s.slice(11, 16) : '' };
};

function fixtureCard(f, sep) {
  if (!f) return null;
  const { date, time } = splitIso(f.date);
  return { name: `${f.homeTeam} ${sep} ${f.awayTeam}`, venue: f.competition ?? null, date, time };
}

const resultRow = (f) => ({
  id: f.id,
  homeTeam: f.homeTeam,
  awayTeam: f.awayTeam,
  homeScore: f.homeScore,
  awayScore: f.awayScore,
});

async function footballCard(name, code) {
  const sum = await footballService.teamSummary(code, name);
  return {
    found: true,
    kind: 'team',
    statSport: 'football',
    sport: 'Soccer',
    name,
    badge: sum.badge ?? null,
    league: sum.league,
    fixture: fixtureCard(sum.fixture, 'vs'),
    results: sum.results.map(resultRow),
    standings: sum.standings.map((r) => ({
      rank: r.position,
      team: r.team,
      played: r.played,
      won: r.won,
      lost: r.lost,
      goalDiff: r.goalDifference,
      points: r.points,
      me: r.me,
    })),
  };
}

async function ballCard(service, name, sportLabel, statSport) {
  const sum = await service.teamSummary(name);
  const logo = service === nbaService ? nbaLogo : nflLogo;
  return {
    found: true,
    kind: 'team',
    statSport,
    sport: sportLabel,
    name,
    badge: logo(name),
    league: sum.league,
    fixture: fixtureCard(sum.fixture, '@'),
    results: sum.results.map(resultRow),
    standings: sum.standings.map((r) => ({
      rank: r.position,
      team: r.team,
      crest: logo(r.team),
      played: r.played,
      won: r.won,
      lost: r.lost,
      goalDiff: null,
      points: r.won,
      me: r.me,
      record: r.record,
    })),
  };
}

async function f1Card(teamName) {
  const [upcoming, last, drivers, constructors] = await Promise.all([
    f1Service.getUpcomingRaces(),
    f1Service.getRecentResults(),
    f1Service.getDriverStandings(),
    f1Service.getConstructorStandings(),
  ]);
  const next = upcoming[0] ?? null;
  const me = (teamName || '').toLowerCase();
  const mine = (team) => Boolean(me) && Boolean(team) && team.toLowerCase().includes(me);
  const badge = constructorLogo(teamName) ?? constructors.find((c) => mine(c.constructor))?.badge ?? null;
  return {
    found: true,
    kind: 'f1',
    statSport: 'f1',
    sport: 'Motorsport',
    name: 'Formula 1',
    badge,
    league: 'Formula 1',
    fixture: next ? { name: next.name, venue: next.circuit, date: next.date, time: next.time } : null,
    lastRace: last.race
      ? { name: last.race.name, podium: last.results.slice(0, 3) }
      : null,
    driverStandings: drivers.map((d) => ({ ...d, me: mine(d.team), crest: constructorLogo(d.team) })),
    constructorStandings: constructors.map((c) => ({
      ...c,
      me: mine(c.constructor),
      crest: constructorLogo(c.constructor),
    })),
    results: [],
    standings: [],
  };
}

export const sportsService = {
  footballService,
  nbaService,
  nflService,
  f1Service,

  // Everything the Sports card needs for one followed team/constructor.
  async team(name, sport, league, leagueLabel) {
    const s = (sport || '').toLowerCase();
    if (!name?.trim() && !['f1', 'formula1', 'formula-1', 'motorsport'].includes(s)) {
      return { found: false, query: name };
    }
    return cache.wrap(`card:${s}:${league ?? ''}:${(name || '').toLowerCase()}`, async () => {
      if (['f1', 'formula1', 'formula-1', 'motorsport'].includes(s)) return f1Card(name);
      if (['football', 'soccer'].includes(s)) return footballCard(name, competitionCode(league, leagueLabel));
      if (['basketball', 'nba'].includes(s)) return ballCard(nbaService, name, 'Basketball', 'basketball');
      if (['nfl', 'american-football'].includes(s)) return ballCard(nflService, name, 'NFL', 'nfl');
      return { found: false, query: name };
    });
  },
};
