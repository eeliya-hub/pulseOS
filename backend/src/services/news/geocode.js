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

// Nominatim county/district string → our region id.
function pickRegion(address) {
  for (const candidate of [address.county, address.state_district, address.region, address.state]) {
    const id = slugify(candidate);
    if (id && UK_REGIONS[id]) return id;
  }
  const blob = Object.values(address).join(' ').toLowerCase();
  if (blob.includes('scotland')) return 'scotland';
  if (blob.includes('wales') || blob.includes('cymru')) return 'wales';
  if (blob.includes('northern ireland')) return 'northern-ireland';
  return null;
}

/**
 * @returns {Promise<{town:string, name:string, regionId:string|null}|null>}
 */
export async function geocode(location) {
  if (!location?.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=gb&q=${encodeURIComponent(location)}`;
  const data = await fetchJson(url, {
    integration: INTEGRATION,
    timeoutMs: 8000,
    headers: { 'user-agent': 'PulseOS/0.1 (personal dashboard)' },
  });
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  return {
    town: slugify(hit.name || location),
    name: hit.name || location,
    regionId: pickRegion(hit.address || {}),
  };
}
