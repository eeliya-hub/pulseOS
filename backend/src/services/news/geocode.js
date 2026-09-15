import { fetchJson } from '../../utils/httpClient.js';
import { UK_REGIONS } from './ukRegions.js';

// Resolve a free-typed UK location (e.g. "ashford") to a county region + town
// slug, using OpenStreetMap Nominatim (free, no key). Results are stable, so
// callers cache them.
const INTEGRATION = 'Nominatim';

export const slugify = (s = '') =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Unitary authorities Nominatim reports as the "county", which are not counties
 * in the region table. Without these, some of the largest places in the country
 * (Brighton, Nottingham, Leicester) fall through to national news.
 */
const UNITARY_ALIASES = {
  'brighton-and-hove': 'east-sussex',
  'city-of-bristol': 'bristol',
  'city-of-nottingham': 'nottinghamshire',
  nottingham: 'nottinghamshire',
  leicester: 'leicestershire',
  derby: 'derbyshire',
  'stoke-on-trent': 'staffordshire',
  plymouth: 'devon',
  torbay: 'devon',
  portsmouth: 'hampshire',
  southampton: 'hampshire',
  'milton-keynes': 'buckinghamshire',
  luton: 'bedfordshire',
  reading: 'berkshire',
  slough: 'berkshire',
  'west-berkshire': 'berkshire',
  medway: 'kent',
  peterborough: 'cambridgeshire',
  swindon: 'wiltshire',
  'north-somerset': 'somerset',
  'bath-and-north-east-somerset': 'somerset',
  'south-gloucestershire': 'gloucestershire',
  warrington: 'cheshire',
  halton: 'cheshire',
  blackpool: 'lancashire',
  blackburn: 'lancashire',
  'kingston-upon-hull': 'east-riding-of-yorkshire',
  york: 'north-yorkshire',
  middlesbrough: 'county-durham',
  darlington: 'county-durham',
  hartlepool: 'county-durham',
  'telford-and-wrekin': 'shropshire',
  wokingham: 'berkshire',
  'isle-of-anglesey': 'wales',
};

// Nominatim county/district/city string → our region id. `city` matters because
// London reports as city "Greater London" with no county at all.
function pickRegion(address) {
  for (const candidate of [address.county, address.state_district, address.city, address.region, address.state]) {
    const id = slugify(candidate);
    if (!id) continue;
    if (UK_REGIONS[id]) return id;
    if (UNITARY_ALIASES[id]) return UNITARY_ALIASES[id];
  }
  const blob = Object.values(address).join(' ').toLowerCase();
  if (blob.includes('scotland')) return 'scotland';
  if (blob.includes('wales') || blob.includes('cymru')) return 'wales';
  if (blob.includes('northern ireland')) return 'northern-ireland';
  return null;
}

/**
 * A county named in the text itself — "Ashford, Kent" says which Ashford it is,
 * so there is nothing to look up. Tried before the network, and again if the
 * lookup fails, which is what keeps a typed county working when Nominatim is
 * unreachable. Longest match wins, so "Greater Manchester" beats "Manchester".
 */
export function regionFromText(location = '') {
  const words = slugify(location).split('-').filter(Boolean);
  for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
    for (let i = 0; i + size <= words.length; i += 1) {
      const id = words.slice(i, i + size).join('-');
      if (UK_REGIONS[id]) return id;
    }
  }
  return null;
}

// Nominatim asks for no more than one request a second. Queue them rather than
// firing in parallel: bursts come back 429, and a 429 used to read as "this
// place has no local news".
let nextSlot = Promise.resolve();
const GAP_MS = 1100;
function serialize(fn) {
  const run = nextSlot.then(fn, fn);
  nextSlot = run.then(
    () => new Promise((r) => setTimeout(r, GAP_MS)),
    () => new Promise((r) => setTimeout(r, GAP_MS)),
  );
  return run;
}

/**
 * Resolve a place to its county + town slug. THROWS when the lookup fails, so a
 * transient outage is never mistaken for "nowhere" and cached as such — callers
 * decide what to do with the failure.
 *
 * @returns {Promise<{town:string, name:string, regionId:string|null}|null>}
 */
export async function geocode(location) {
  if (!location?.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=gb&q=${encodeURIComponent(location)}`;
  const fetchOnce = () =>
    fetchJson(url, {
      integration: INTEGRATION,
      timeoutMs: 8000,
      headers: { 'user-agent': 'PulseOS/0.1 (personal dashboard)' },
    });

  let data;
  try {
    data = await serialize(fetchOnce);
  } catch {
    data = await serialize(fetchOnce); // one retry — the usual cause is the rate limit
  }

  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  return {
    town: slugify(hit.name || location),
    name: hit.name || location,
    regionId: pickRegion(hit.address || {}) ?? regionFromText(location),
  };
}
