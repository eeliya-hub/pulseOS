import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';
import { tokenStore } from '../../utils/tokenStore.js';

// Spotify Web API — OAuth 2.0 Authorization Code flow.
//
// Flow: GET /api/music/auth → redirect to Spotify consent
//       GET /api/music/callback?code=... → exchange + store tokens
//       GET /api/music/now-playing | /playlists | /recently-played
const INTEGRATION = 'Spotify';
const SCOPES = [
  // read
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-recently-played',
  'playlist-read-private',
  // in-tab Web Playback SDK player (requires Premium)
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
].join(' ');

function requireCreds() {
  const { clientId, clientSecret } = config.spotify;
  if (!clientId || !clientSecret) throw ApiError.notConfigured(INTEGRATION);
}

const basicAuth = () =>
  `Basic ${Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64')}`;

async function exchange(params) {
  return fetchJson('https://accounts.spotify.com/api/token', {
    integration: INTEGRATION,
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: basicAuth(),
    },
    body: new URLSearchParams(params).toString(),
  });
}

// Refresh well before expiry. The Web Playback SDK is a long-lived singleton that
// caches whatever token we hand it, so a tight margin let it run a token to expiry
// mid-session → `storage-resolve` 403 (audio won't stream) even though the account
// is fine. A 10-minute buffer keeps the SDK's token comfortably fresh.
const TOKEN_REFRESH_BUFFER_MS = 10 * 60_000;

async function accessToken(user) {
  const tokens = tokenStore.get('spotify', user);
  if (!tokens) throw ApiError.unauthorized('Spotify not connected. Visit /api/music/auth first.');

  if (Date.now() < (tokens.expires_at ?? 0) - TOKEN_REFRESH_BUFFER_MS) return tokens.access_token;

  // refresh
  const refreshed = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
  const next = {
    ...tokens,
    access_token: refreshed.access_token,
    expires_at: Date.now() + refreshed.expires_in * 1000,
    ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
  };
  tokenStore.set('spotify', next, user);
  return next.access_token;
}

async function api(path, user) {
  const token = await accessToken(user);
  return fetchJson(`https://api.spotify.com/v1${path}`, {
    integration: INTEGRATION,
    headers: { authorization: `Bearer ${token}` },
  });
}

// Player-control calls (PUT, usually 204 No Content).
async function apiWrite(path, { method = 'PUT', body } = {}, user) {
  const token = await accessToken(user);
  return fetchJson(`https://api.spotify.com/v1${path}`, {
    integration: INTEGRATION,
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const spotifyProvider = {
  getAuthUrl() {
    requireCreds();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.spotify.clientId,
      scope: SCOPES,
      redirect_uri: config.spotify.redirectUri,
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  },

  async handleCallback(code, user) {
    requireCreds();
    if (!code) throw ApiError.badRequest('Missing `code` from Spotify OAuth callback.');
    const data = await exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.spotify.redirectUri,
    });
    tokenStore.set(
      'spotify',
      {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
      },
      user,
    );
    return { connected: true };
  },

  isConnected: (user) => tokenStore.has('spotify', user),

  // Fresh access token for the browser Web Playback SDK (getOAuthToken).
  async token(user) {
    const access = await accessToken(user);
    const tokens = tokenStore.get('spotify', user);
    return { accessToken: access, expiresAt: tokens?.expires_at };
  },

  // Make the in-tab SDK device the active playback target.
  async transfer({ deviceId, play = true }, user) {
    if (!deviceId) throw ApiError.badRequest('Provide the SDK `deviceId` to transfer playback.');
    await apiWrite('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } }, user);
    return { transferred: true };
  },

  // Start / resume playback on a device. Optionally a playlist/album (contextUri) or tracks (uris).
  async play({ deviceId, contextUri, uris } = {}, user) {
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const body = contextUri ? { context_uri: contextUri } : uris ? { uris } : undefined;
    await apiWrite(`/me/player/play${query}`, { method: 'PUT', body }, user);
    return { playing: true };
  },

  async nowPlaying(user) {
    const data = await api('/me/player/currently-playing', user);
    if (!data?.item) return { playing: false };
    return {
      playing: data.is_playing,
      track: data.item.name,
      uri: data.item.uri,
      artists: data.item.artists?.map((a) => a.name),
      album: data.item.album?.name,
      image: data.item.album?.images?.[0]?.url,
      progressMs: data.progress_ms,
      durationMs: data.item.duration_ms,
    };
  },

  async playlists(user) {
    const data = await api('/me/playlists?limit=20', user);
    return (data.items ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      uri: p.uri,
      tracks: p.tracks?.total,
      image: p.images?.[0]?.url,
    }));
  },

  async recentlyPlayed(user) {
    const data = await api('/me/player/recently-played?limit=20', user);
    return (data.items ?? []).map((i) => ({
      track: i.track?.name,
      uri: i.track?.uri,
      artists: i.track?.artists?.map((a) => a.name),
      image: i.track?.album?.images?.[0]?.url,
      durationMs: i.track?.duration_ms,
      playedAt: i.played_at,
    }));
  },

  // Search the whole Spotify catalogue (tracks). Needs only a valid token.
  async search(query, user) {
    if (!query?.trim()) return [];
    // Note: apps in Spotify "Development mode" cap the search `limit` low — 10 is safe,
    // 20 returns "Invalid limit". Raise this after requesting extended quota.
    const data = await api(`/search?q=${encodeURIComponent(query)}&type=track&limit=10`, user);
    return (data.tracks?.items ?? []).map((t) => ({
      track: t.name,
      uri: t.uri,
      artists: t.artists?.map((a) => a.name),
      album: t.album?.name,
      image: t.album?.images?.[0]?.url,
      durationMs: t.duration_ms,
    }));
  },
};
