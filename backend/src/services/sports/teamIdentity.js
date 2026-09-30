import { createCache } from '../../utils/cache.js';
import { fetchJson } from '../../utils/httpClient.js';

/**
 * What a team looks like: its colour, its crest and its three letters.
 *
 * One keyless source for every sport the app follows. ESPN publishes a team
 * list per league carrying the club's own hex colour and a 500px badge, which
 * is the only place this project has found that answers for the Premier League,
 * the Champions League, the NBA and the NFL in the same shape.
 *
 * It exists because the card had crests for some teams and not others — the
 * two clubs in a football fixture had them, the twenty in the table underneath
 * did not — and had no idea what colour anyone played in.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const INTEGRATION = 'ESPN teams';

// The leagues a followed team can belong to, by the competition code the rest
// of the service already speaks. Champions League is listed last on purpose:
// a club in it is also in its domestic league, and the domestic entry is the
// one whose colour and badge people expect.
const LEAGUES = {
  PL: 'soccer/eng.1',
  PD: 'soccer/esp.1',
  SA: 'soccer/ita.1',
  BL1: 'soccer/ger.1',
  FL1: 'soccer/fra.1',
  DED: 'soccer/ned.1',
  PPL: 'soccer/por.1',
  CL: 'soccer/uefa.champions',
  nba: 'basketball/nba',
  nfl: 'football/nfl',
};

// A day: a club changes its badge once a decade and its colours less often.
const cache = createCache(24 * 60 * 60 * 1000);

/** Lower-cased, punctuation-free, and without the suffixes that differ per feed. */
const key = (name) =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(fc|afc|cf|sc|ac|ssc|club|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function leagueTeams(code) {
  const path = LEAGUES[code];
  if (!path) return new Map();
  return cache
    .wrap(`teams:${code}`, async () => {
      const data = await fetchJson(`${BASE}/${path}/teams`, { integration: INTEGRATION, timeoutMs: 12_000 });
      const teams = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
      const out = new Map();
      for (const entry of teams) {
        const t = entry?.team;
        if (!t?.displayName) continue;
        const identity = {
          name: t.displayName,
          short: t.shortDisplayName ?? t.name ?? t.displayName,
          tla: t.abbreviation ?? null,
          colour: t.color ? `#${t.color}` : null,
          altColour: t.alternateColor ? `#${t.alternateColor}` : null,
          crest: (t.logos ?? [])[0]?.href ?? null,
        };
        // Findable by full name, short name and nickname, because the three
        // feeds this has to meet in the middle each use a different one.
        for (const alias of [t.displayName, t.shortDisplayName, t.name, t.nickname]) {
          const k = key(alias);
          if (k && !out.has(k)) out.set(k, identity);
        }
      }
      // Never cache a league we failed to read; the next request should retry.
      if (!out.size) throw new Error('no teams');
      return out;
    })
    .catch(() => new Map());
}

/**
 * Identities for one competition, as a lookup by team name.
 *
 * @param {string} code a competition code ('PL', 'nba', 'nfl', …)
 * @returns {Promise<(name: string) => object|null>}
 */
export async function identityLookup(code) {
  // A club playing in Europe appears in two lists; its domestic one wins.
  const codes = code === 'CL' ? ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'] : [code];
  const maps = await Promise.all(codes.map(leagueTeams));

  return (name) => {
    const k = key(name);
    if (!k) return null;
    for (const map of maps) {
      const hit = map.get(k);
      if (hit) return hit;
    }
    // "Nottingham" should still find "Nottingham Forest", and the other way.
    for (const map of maps) {
      for (const [candidate, identity] of map) {
        if (candidate.includes(k) || k.includes(candidate)) return identity;
      }
    }
    return null;
  };
}

/**
 * The colour a competition is known by, for when no team's own colour applies
 * — a grand prix, or a club the team list doesn't carry.
 */
export const COMPETITION_COLOUR = {
  PL: '#3d195b',
  CL: '#0a3d91',
  PD: '#ee8707',
  SA: '#0b5fa5',
  BL1: '#d20515',
  FL1: '#091c3e',
  nba: '#c8102e',
  nfl: '#013369',
  f1: '#e10600',
};
