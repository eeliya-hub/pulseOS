import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

/**
 * Place lookup for hotels, restaurants and sights.
 *
 * Two backends behind one shape: Google Places (New) when GOOGLE_PLACES_API_KEY
 * is set — ratings, price level, opening state and real photos — and
 * OpenStreetMap's Nominatim when it isn't, so searching for a hotel works out of
 * the box with no key and no billing account. Callers get the same normalized
 * place either way and never see which one answered, apart from `source`.
 */
const GOOGLE = 'https://places.googleapis.com/v1';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = 'PulseOS/0.1 (personal dashboard)';

// What the UI asks for → the Google place type, and the word to search OSM for.
const KINDS = {
  hotel: { google: 'lodging', osm: 'hotel' },
  food: { google: 'restaurant', osm: 'restaurant' },
  cafe: { google: 'cafe', osm: 'cafe' },
  bar: { google: 'bar', osm: 'bar' },
  sight: { google: 'tourist_attraction', osm: 'attraction' },
  museum: { google: 'museum', osm: 'museum' },
  shopping: { google: 'shopping_mall', osm: 'mall' },
  transport: { google: 'transit_station', osm: 'station' },
};

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.photos',
  'places.websiteUri',
  'places.internationalPhoneNumber',
  'places.currentOpeningHours.openNow',
  'places.primaryTypeDisplayName',
  'places.googleMapsUri',
].join(',');

const DETAIL_FIELDS = FIELDS.replace(/places\./g, '');

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export const placesProvider = {
  /** 'google' when a Places key is configured, otherwise 'openstreetmap'. */
  source: () => (config.travel.placesKey ? 'google' : 'openstreetmap'),

  /**
   * Search for places by free text, optionally biased to a point.
   *
   * @param {object} p
   * @param {string} [p.q]     what to look for ("Trunk Hotel", "ramen")
   * @param {number} [p.lat]   bias/centre point
   * @param {number} [p.lon]
   * @param {string} [p.kind]  one of KINDS — narrows the search to a category
   * @param {number} [p.limit]
   */
  async search({ q, lat, lon, kind, limit = 8 }) {
    const kindSpec = KINDS[kind] ?? null;
    const text = (q || '').trim() || kindSpec?.osm || '';
    if (!text) throw ApiError.badRequest('Provide a `q` search term or a `kind`.');

    return config.travel.placesKey
      ? googleSearch({ text, lat, lon, kindSpec, limit })
      : osmSearch({ text, lat, lon, limit });
  },

  /** Full detail for one place id returned by `search`. */
  async details(id) {
    const placeId = (id || '').trim();
    if (!placeId) throw ApiError.badRequest('Provide a place id.');

    if (placeId.startsWith('osm:')) {
      const [, type, osmId] = placeId.split(':');
      const data = await fetchJson(
        `${NOMINATIM}/details?format=json&osmtype=${type?.[0]?.toUpperCase()}&osmid=${osmId}&addressdetails=1`,
        { integration: 'Nominatim', headers: { 'user-agent': UA } },
      );
      return normalizeOsmDetails(data);
    }

    if (!config.travel.placesKey) throw ApiError.notConfigured('Google Places');
    const data = await fetchJson(`${GOOGLE}/places/${encodeURIComponent(placeId)}`, {
      integration: 'Google Places',
      headers: { 'X-Goog-Api-Key': config.travel.placesKey, 'X-Goog-FieldMask': DETAIL_FIELDS },
    });
    return normalizeGoogle(data);
  },

  /**
   * Fetch a Google place photo as bytes. The key never leaves the backend, so
   * the frontend asks us for `/api/travel/photo?ref=…` instead of Google.
   *
   * @returns {Promise<{buffer: Buffer, contentType: string}>}
   */
  async photo(ref, width = 800) {
    if (!config.travel.placesKey) throw ApiError.notConfigured('Google Places');
    const name = (ref || '').trim();
    if (!name.includes('/photos/')) throw ApiError.badRequest('Invalid photo reference.');

    const px = Math.min(1600, Math.max(120, Number(width) || 800));
    const url = `${GOOGLE}/${name}/media?maxWidthPx=${px}&key=${config.travel.placesKey}`;
    const response = await fetch(url);
    if (!response.ok) throw ApiError.upstream('Google Places', `${response.status} ${response.statusText}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'image/jpeg',
    };
  },
};

async function googleSearch({ text, lat, lon, kindSpec, limit }) {
  const body = {
    textQuery: text,
    maxResultCount: Math.min(20, limit),
  };
  if (kindSpec?.google) body.includedType = kindSpec.google;
  if (lat != null && lon != null) {
    // A 25km circle is wide enough to cover a whole city without dragging in
    // same-named places from the next country.
    body.locationBias = { circle: { center: { latitude: Number(lat), longitude: Number(lon) }, radius: 25000 } };
  }

  const data = await fetchJson(`${GOOGLE}/places:searchText`, {
    integration: 'Google Places',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': config.travel.placesKey,
      'X-Goog-FieldMask': FIELDS,
    },
    body: JSON.stringify(body),
  });

  return (data.places ?? []).map(normalizeGoogle);
}

async function osmSearch({ text, lat, lon, limit }) {
  const query = (bounded) => {
    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: String(Math.min(20, limit)),
      q: text,
      addressdetails: '1',
      extratags: '1',
      'accept-language': 'en',
    });
    // Confine the search to a ~55km box around the trip, so a bare "ramen" or
    // "hotel" finds one in this city rather than the most famous one on earth.
    if (bounded && lat != null && lon != null) {
      const d = 0.25;
      params.set('viewbox', `${Number(lon) - d},${Number(lat) + d},${Number(lon) + d},${Number(lat) - d}`);
      params.set('bounded', '1');
    }
    return params;
  };

  const run = (bounded) =>
    fetchJson(`${NOMINATIM}/search?${query(bounded)}`, {
      integration: 'Nominatim',
      headers: { 'user-agent': UA, 'accept-language': 'en' },
    });

  let data = await run(true);
  // Nothing nearby — fall back to a worldwide search so an out-of-town landmark
  // (or a hotel in the next city over) is still findable.
  if (!Array.isArray(data) || data.length === 0) data = await run(false);

  return (Array.isArray(data) ? data : []).map(normalizeOsm);
}

function normalizeGoogle(place) {
  // Up to six photos per place: enough for a cover plus a strip to choose from,
  // without dragging a hundred references through every search response.
  const photos = (place.photos ?? [])
    .slice(0, 6)
    .map((photo) => ({ ref: photo.name, url: null }))
    .filter((photo) => photo.ref);
  return {
    id: place.id,
    source: 'google',
    name: place.displayName?.text ?? '',
    address: place.formattedAddress ?? '',
    lat: place.location?.latitude ?? null,
    lon: place.location?.longitude ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
    priceLevel: PRICE_LEVELS[place.priceLevel] ?? null,
    openNow: place.currentOpeningHours?.openNow ?? null,
    website: place.websiteUri ?? null,
    phone: place.internationalPhoneNumber ?? null,
    category: place.primaryTypeDisplayName?.text ?? null,
    mapsUrl: place.googleMapsUri ?? null,
    photos,
    photo: photos[0] ?? null,
  };
}

function normalizeOsm(hit) {
  const tags = hit.extratags ?? {};
  return {
    id: `osm:${hit.osm_type}:${hit.osm_id}`,
    source: 'osm',
    name: hit.name || hit.display_name?.split(',')[0] || '',
    address: hit.display_name ?? '',
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    rating: null,
    ratingCount: null,
    priceLevel: null,
    openNow: null,
    website: tags.website || tags['contact:website'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    category: hit.type ? hit.type.replace(/_/g, ' ') : null,
    mapsUrl: `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}`,
    photos: tags.image ? [{ ref: null, url: tags.image }] : [],
    photo: tags.image ? { ref: null, url: tags.image } : null,
  };
}

function normalizeOsmDetails(data) {
  const tags = data.extratags ?? {};
  return {
    id: `osm:${data.osm_type}:${data.osm_id}`,
    source: 'osm',
    name: data.localname || data.names?.name || '',
    address: data.addresstags
      ? Object.values(data.addresstags).filter(Boolean).join(', ')
      : '',
    lat: Number(data.centroid?.coordinates?.[1] ?? data.geometry?.coordinates?.[1] ?? 0) || null,
    lon: Number(data.centroid?.coordinates?.[0] ?? data.geometry?.coordinates?.[0] ?? 0) || null,
    rating: null,
    ratingCount: null,
    priceLevel: null,
    openNow: null,
    website: tags.website || null,
    phone: tags.phone || null,
    category: data.category ? `${data.category} · ${data.type}` : null,
    mapsUrl: `https://www.openstreetmap.org/${data.osm_type}/${data.osm_id}`,
    photos: tags.image ? [{ ref: null, url: tags.image }] : [],
    photo: tags.image ? { ref: null, url: tags.image } : null,
  };
}
