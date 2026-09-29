import { createCache } from '../../utils/cache.js';
import { footballService } from './football.service.js';
import { nbaService, nflService } from './balldontlie.service.js';
import { constructorLogo } from './f1Logos.js';
import { f1Service } from './f1.service.js';
import { nbaLogo, nflLogo } from './teamLogos.js';
import { PLAYOFF_LINES, teamGroup } from './teamGroups.js';
import { espnProvider } from './providers/espn.provider.js';

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

/**
 * The next fixture, as two sides rather than one sentence.
 *
 * It used to flatten to "Arsenal FC vs Leeds United FC" and put the competition
 * in `venue`, which meant the card said "Premier League" twice and had no way to
 * show a crest for the opponent, a three-letter code, or the ground — all of
 * which the providers were already handing us. `name` stays for anything still
 * reading it; everything else is new.
 */
function fixtureCard(f, sep) {
  if (!f) return null;
  const { date, time } = splitIso(f.date);
  const side = (name, short, tla, crest) => ({
    name: name ?? null,
    short: short ?? name ?? null,
    // Not every sport gives a three-letter code; the initials of the short name
    // are a decent stand-in, and the UI falls back to the name when neither fits.
    tla: tla ?? initials(short ?? name),
    crest: crest ?? null,
  });
  return {
    name: `${f.homeTeam} ${sep} ${f.awayTeam}`,
    home: side(f.homeTeam, f.homeShort, f.homeTla, f.homeCrest),
    away: side(f.awayTeam, f.awayShort, f.awayTla, f.awayCrest),
    // `sep` doubles as which way round the fixture reads: football lists the
    // home side first, the American sports list the visitor first.
    homeFirst: sep !== '@',
    competition: f.competition ?? null,
    competitionEmblem: f.competitionEmblem ?? null,
    matchday: f.matchday ?? null,
    venue: f.venue ?? null,
    date,
    time,
  };
}

/** "Leeds United" → "LEE" — a stand-in for a code the provider didn't give. */
function initials(name) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const letters = words.length >= 3 ? words.slice(0, 3).map((w) => w[0]) : words[0].slice(0, 3).split('');
  return letters.join('').toUpperCase();
}

/**
 * A finished match, from the point of view of the team being followed.
 *
 * The row used to be four bare fields, so the UI could print a scoreline and
 * nothing else — no date, no crests, and no way to say whether it was a good
 * day. Which team is "mine" is known here and nowhere else downstream, so the
 * verdict is worked out here too.
 */
const resultRow = (me) => (f) => {
  const { date, time } = splitIso(f.date);
  const iAmHome = sameName(f.homeTeam, me);
  const mineScore = iAmHome ? f.homeScore : f.awayScore;
  const theirScore = iAmHome ? f.awayScore : f.homeScore;
  const decided = Number.isFinite(mineScore) && Number.isFinite(theirScore);
  return {
    id: f.id,
    homeTeam: f.homeTeam,
    awayTeam: f.awayTeam,
    homeShort: f.homeShort ?? f.homeTeam ?? null,
    awayShort: f.awayShort ?? f.awayTeam ?? null,
    homeCrest: f.homeCrest ?? null,
    awayCrest: f.awayCrest ?? null,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    competition: f.competition ?? null,
    date,
    time,
    // The other side, and how it went: 'W' | 'D' | 'L' | null.
    opponent: (iAmHome ? f.awayShort ?? f.awayTeam : f.homeShort ?? f.homeTeam) ?? null,
    opponentCrest: (iAmHome ? f.awayCrest : f.homeCrest) ?? null,
    home: iAmHome,
    outcome: decided ? (mineScore > theirScore ? 'W' : mineScore < theirScore ? 'L' : 'D') : null,
  };
};

/** Loose name match, the way "Lakers" should find "Los Angeles Lakers". */
function sameName(a, b) {
  const x = (a ?? '').toLowerCase().trim();
  const y = (b ?? '').toLowerCase().trim();
  return Boolean(x) && Boolean(y) && (x.includes(y) || y.includes(x));
}

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
    fixtures: (sum.fixtures ?? []).map((f) => fixtureCard(f, 'vs')).filter(Boolean),
    results: sum.results.map(resultRow(name)),
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

const espnCache = createCache(15 * 60 * 1000);

// "Lakers" should find "Los Angeles Lakers", either way round.
const sameTeam = (a, b) => {
  const x = (a ?? '').toLowerCase().trim();
  const y = (b ?? '').toLowerCase().trim();
  return Boolean(x) && Boolean(y) && (x.includes(y) || y.includes(x));
};

/**
 * The conference table, from ESPN if it answers and from our own tally of
 * balldontlie's games if it doesn't. ESPN is preferred because it is the real
 * table — complete, seeded and grouped — in one keyless request.
 */
async function ballStandings(sportKey, service, team) {
  const mine = (name) => sameTeam(name, team);
  try {
    const rows = await espnCache.wrap(`espn:${sportKey}`, () => espnProvider.standings(sportKey));
    if (rows.length) {
      return rows.map((r) => ({ ...r, division: teamGroup(sportKey, r.team).division, me: mine(r.team) }));
    }
  } catch {
    /* fall through to the tally */
  }
  const tallied = await service.getStandings();
  return tallied.map((r) => ({ ...r, me: mine(r.team) }));
}

async function ballCard(service, name, sportLabel, statSport) {
  const sportKey = statSport === 'basketball' ? 'nba' : 'nfl';
  const logo = service === nbaService ? nbaLogo : nflLogo;
  const [sum, standings] = await Promise.all([
    service.teamSummary(name),
    ballStandings(sportKey, service, name),
  ]);

  return {
    found: true,
    kind: 'team',
    statSport,
    sport: sportLabel,
    name,
    badge: logo(name),
    league: sum.league,
    fixture: fixtureCard(sum.fixture, '@'),
    fixtures: (sum.fixtures ?? []).map((f) => fixtureCard(f, '@')).filter(Boolean),
    results: sum.results.map(resultRow(name)),
    conferences: [...new Set(standings.map((r) => r.conference).filter(Boolean))],
    playoffs: PLAYOFF_LINES[sportKey] ?? null,
    ties: standings.some((r) => (r.drawn ?? 0) > 0), // NFL only, and only when there are any
    standings: standings.map((r, i) => ({
      rank: r.position ?? i + 1,
      seed: r.seed ?? null,
      conference: r.conference ?? null,
      division: r.division ?? null,
      team: r.team,
      crest: logo(r.team),
      played: r.played ?? (r.won ?? 0) + (r.lost ?? 0) + (r.drawn ?? 0),
      won: r.won,
      lost: r.lost,
      drawn: r.drawn ?? 0,
      winPct: r.winPct ?? null,
      gamesBehind: r.gamesBehind ?? null,
      streak: r.streak ?? null,
      form: r.form ?? [],
      goalDiff: null,
      points: r.won,
      me: r.me,
      record: r.record ?? `${r.won}-${r.lost}${r.drawn ? `-${r.drawn}` : ''}`,
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
    // A season has a calendar, and the panel shows it. Shaped like every other
    // sport's fixture list so one component draws all four.
    fixtures: upcoming.slice(0, 6).map((r) => ({
      name: r.name,
      competition: 'Formula 1',
      venue: r.circuit,
      date: r.date,
      time: r.time,
      round: r.round,
      country: r.country ?? null,
    })),
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
