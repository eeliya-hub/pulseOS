import { createCache } from '../../utils/cache.js';
import { constructorLogo } from './f1Logos.js';
import { jolpicaProvider } from './providers/jolpica.provider.js';

// Formula 1 via Jolpica (Ergast). Maps the deeply-nested MRData responses into
// the flat models the UI consumes. Cached ~15 min; every method returns a safe
// default on failure instead of throwing.
const cache = createCache(60 * 60 * 1000); // 1 hour

const mapRace = (r) => ({
  id: `${r.season}-${r.round}`,
  name: r.raceName,
  round: Number(r.round),
  season: Number(r.season),
  date: r.date,
  time: r.time ? r.time.replace('Z', '').slice(0, 5) : null,
  circuit: r.Circuit?.circuitName,
  venue: r.Circuit?.circuitName,
  country: r.Circuit?.Location?.country,
});

const driverName = (d) => `${d?.givenName ?? ''} ${d?.familyName ?? ''}`.trim();

const mapDriverStanding = (d) => ({
  position: Number(d.position),
  driverName: driverName(d.Driver),
  team: d.Constructors?.[0]?.name,
  badge: constructorLogo(d.Constructors?.[0]?.name),
  points: Number(d.points),
  wins: Number(d.wins),
});

const mapConstructorStanding = (c) => ({
  position: Number(c.position),
  constructor: c.Constructor?.name,
  badge: constructorLogo(c.Constructor?.name),
  points: Number(c.points),
  wins: Number(c.wins),
});

const mapResult = (r) => ({
  position: Number(r.position),
  driver: driverName(r.Driver),
  team: r.Constructor?.name,
  time: r.Time?.time ?? r.status,
});

async function safe(key, loader, fallback) {
  try {
    return await cache.wrap(key, loader);
  } catch {
    return fallback;
  }
}

export const f1Service = {
  async getUpcomingRaces() {
    return safe(
      'f1:upcoming',
      async () => {
        const data = await jolpicaProvider.get('current.json');
        const races = data?.MRData?.RaceTable?.Races ?? [];
        const today = new Date().toISOString().slice(0, 10);
        return races.filter((r) => r.date >= today).map(mapRace);
      },
      [],
    );
  },

  async getRecentResults() {
    return safe(
      'f1:last',
      async () => {
        const data = await jolpicaProvider.get('current/last/results.json');
        const race = data?.MRData?.RaceTable?.Races?.[0];
        if (!race) return { race: null, results: [] };
        return { race: mapRace(race), results: (race.Results ?? []).map(mapResult) };
      },
      { race: null, results: [] },
    );
  },

  async getDriverStandings() {
    return safe(
      'f1:drivers',
      async () => {
        const data = await jolpicaProvider.get('current/driverstandings.json');
        const list = data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
        return list.map(mapDriverStanding);
      },
      [],
    );
  },

  async getConstructorStandings() {
    return safe(
      'f1:constructors',
      async () => {
        const data = await jolpicaProvider.get('current/constructorstandings.json');
        const list = data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
        return list.map(mapConstructorStanding);
      },
      [],
    );
  },
};
