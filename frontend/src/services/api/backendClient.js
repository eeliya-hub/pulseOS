// Thin client for the Pulse OS Express backend. This is the single place the
// frontend talks to real integrations — swap the existing mock services
// (weather.js, markets.js, …) over to these calls one view at a time.
//
// Travel keeps its trips local; only its live data (flights, rates, places)
// comes from here.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

// The backend is a local process that gets restarted, redeployed and briefly
// paused. A single blip used to surface as a hard failure at every call site,
// and callers turned that into "nothing is connected" — so a two-second restart
// read as "your calendars are gone". Reads are retried and time-limited instead.
const TIMEOUT_MS = 12_000;
const RETRY_DELAYS = [250, 900]; // reads only, and only when nothing answered

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the request never reached the server — as opposed to being refused. */
export const isOffline = (error) => Boolean(error?.offline);

async function request(path, { method = 'GET', body, params, retries } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') url.searchParams.set(k, v);
    });
  }

  // Only reads are replayed: retrying a POST could create the same event twice.
  const attempts = retries ?? (method === 'GET' ? RETRY_DELAYS.length : 0);
  let lastError;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      // Never reached the server: no response, so nothing was acted on.
      lastError = new Error('Could not reach the Pulse backend.');
      lastError.offline = true;
      lastError.cause = cause;
      if (attempt < attempts) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      throw lastError;
    }

    const data = await res.json().catch(() => null);
    if (res.ok) return data;

    const err = new Error(data?.error?.message ?? `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code;
    // A server that is still starting up answers 502/503 for a moment.
    if (res.status >= 500 && attempt < attempts) {
      lastError = err;
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }
    throw err;
  }
  throw lastError;
}

export const api = {
  status: () => request('/status'),
  // How much of each AI provider's usage cap is spent, and when it resets.
  usage: () => request('/usage'),

  weather: {
    current: (params) => request('/weather', { params }),
    forecast: (params) => request('/weather/forecast', { params }),
    summary: (params) => request('/weather/summary', { params }),
  },
  stocks: {
    quotes: (symbols) => request('/stocks', { params: { symbols: symbols.join(',') } }),
    quote: (symbol) => request(`/stocks/${symbol}`),
    ticker: () => request('/stocks/ticker'),
  },
  news: {
    headlines: (params) => request('/news', { params }),
    search: (q) => request('/news/search', { params: { q } }),
    local: (q) => request('/news/local', { params: { q } }),
    // Follow a live-TV redirector the browser can't (its 302 carries no CORS).
    stream: (url) => request('/news/stream', { params: { url } }),
    // Play a channel through the backend, for the ones whose segments carry no
    // CORS header of their own. Returns a URL for hls.js, not a request.
    hlsUrl: (url) => `${BASE_URL}/news/hls?url=${encodeURIComponent(url)}`,
  },
  // Live web search (keyless by default — see backend/src/services/search).
  search: Object.assign((q, params) => request('/search', { params: { q, ...params } }), {
    status: () => request('/search/status'),
  }),
  sports: {
    // Unified card data for a followed team/constructor.
    team: (name, sport, league, leagueLabel) =>
      request('/sports/team', { params: { name, sport, league, leagueLabel } }),
    // Per-sport endpoints backing the dedicated frontend service modules.
    football: {
      standings: (competition) => request('/sports/football/standings', { params: { competition } }),
      fixtures: (competition, type) => request('/sports/football/fixtures', { params: { competition, type } }),
    },
    nba: {
      standings: () => request('/sports/nba/standings'),
      games: (type) => request('/sports/nba/games', { params: { type } }),
    },
    nfl: {
      standings: () => request('/sports/nfl/standings'),
      games: (type) => request('/sports/nfl/games', { params: { type } }),
    },
    f1: {
      races: (type) => request('/sports/f1/races', { params: { type } }),
      standings: (type) => request('/sports/f1/standings', { params: { type } }),
    },
  },
  ai: {
    chat: (payload) => request('/ai/chat', { method: 'POST', body: payload }),
    // One-shot spoken sample of a prebuilt voice → { audio (base64 wav), mimeType }.
    voicePreview: (voice) => request('/ai/voice-preview', { method: 'POST', body: { voice } }),
    // WebSocket endpoint for the real-time Gemini Live voice session. The name,
    // instructions and voice go in the first message on the socket, not here —
    // a long instruction set overflowed the upgrade request's header limit.
    voiceWsUrl: () => `${BASE_URL.replace(/^http/i, 'ws')}/voice`,
  },
  launch: Object.assign((app, url) => request('/launch', { method: 'POST', body: { app, url } }), {
    apps: () => request('/launch/apps'),
    iconUrl: (app) => `${BASE_URL}/launch/icon?app=${encodeURIComponent(app)}`,
  }),
  calendar: {
    status: () => request('/calendar/status'),
    calendars: () => request('/calendar/calendars'),
    googleAuthUrl: () => request('/calendar/google/auth'),
    googleDisconnect: () => request('/calendar/google/disconnect', { method: 'POST' }),
    appleConnect: (appleId, appPassword) =>
      request('/calendar/apple/connect', { method: 'POST', body: { appleId, appPassword } }),
    appleDisconnect: () => request('/calendar/apple/disconnect', { method: 'POST' }),
    events: (params) => request('/calendar/events', { params }),
    createEvent: (event) => request('/calendar/events', { method: 'POST', body: event }),
    updateEvent: (event) => request('/calendar/events', { method: 'PATCH', body: event }),
    deleteEvent: (event) => request('/calendar/events', { method: 'DELETE', body: event }),
  },
  geo: (q) => request('/geo', { params: { q } }),
  travel: {
    // Typed place → coordinates, time zone, currency, country facts and a photo.
    destination: (q) => request('/travel/destination', { params: { q } }),
    // A flight's route: airline, both airports, distance. `live` is off by
    // default — the dashboard shows the booked route, not whichever aircraft
    // happens to be flying that number today.
    flight: (code, date, live = false) =>
      request('/travel/flight', { params: { code, date, live: live ? '1' : '0' } }),
    aircraft: (registration) => request('/travel/aircraft', { params: { registration } }),
    // Live rate + 30 days of history for the converter's trend line.
    fx: (from, to, amount) => request('/travel/fx', { params: { from, to, amount } }),
    // Hotels, food and sights — Google Places when keyed, OpenStreetMap otherwise.
    places: (params) => request('/travel/places', { params }),
    place: (id) => request(`/travel/places/${encodeURIComponent(id)}`),
    // Pictures for a place or landmark — Google photos when keyed, Wikipedia otherwise.
    photos: (params) => request('/travel/photos', { params }),
    // Google photos are proxied so the API key never reaches the browser.
    photoUrl: (ref, width = 640) =>
      `${BASE_URL}/travel/photo?ref=${encodeURIComponent(ref)}&w=${width}`,
  },
  music: {
    authUrl: () => request('/music/auth'),
    token: () => request('/music/token'),
    transfer: (deviceId, play = true) =>
      request('/music/transfer', { method: 'PUT', body: { deviceId, play } }),
    // Spotify Connect: what can play, what is playing, and controlling whichever
    // device holds the music.
    devices: () => request('/music/devices'),
    player: () => request('/music/player'),
    command: (body) => request('/music/command', { method: 'PUT', body }),
    play: (payload) => request('/music/play', { method: 'PUT', body: payload }),
    nowPlaying: () => request('/music/now-playing'),
    playlists: () => request('/music/playlists'),
    recentlyPlayed: () => request('/music/recently-played'),
    search: (q) => request('/music/search', { params: { q } }),
    // Time-synced lyrics for the immersive player → { found, synced, lines[] }
    lyrics: (params) => request('/music/lyrics', { params }),
    // Spotify's own musical timeline; { available:false } when Spotify withholds it.
    analysis: (trackId) => request(`/music/analysis/${trackId}`),
    features: (trackId) => request(`/music/features/${trackId}`),
  },
};
