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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PAGE_SIZE = 10; // hard cap while the app is in Spotify Development mode
const SEARCH_RESULTS = 12; // how many unique songs to hand back

// Reissue noise: the same recording listed again under a different release.
// Deliberately NOT here — live, acoustic, remix, instrumental, demo — those are
// different renditions, and collapsing them would hide music you searched for.
const REISSUE =
  /\b(remaster(?:ed)?|re-?master|mono|stereo|explicit|clean|bonus track|deluxe|expanded|anniversary edition|radio edit|single version|album version)\b/i;

/**
 * An identity for "the same song", so one track listed across an album, a
 * single, and three compilations collapses to one row. Keyed on the title (with
 * release noise and featured-artist billing stripped, since those vary per
 * release) plus the lead artist — which keeps genuine covers by other artists.
 */
export function songKey(name, artists = []) {
  const title = (name || '')
    // "(2011 Remaster)", "[Deluxe Edition]" → gone
    .replace(/\s*[([][^)\]]*[)\]]/g, (m) => (REISSUE.test(m) ? '' : m))
    // "- 2011 Remaster", "- Radio Edit" trailing off the end → gone
    .replace(/\s*[-–]\s*[^-–]*$/, (m) => (REISSUE.test(m) ? '' : m))
    // Featured artists get billed inconsistently between releases.
    .replace(/\s*[([]?\s*(?:feat|ft)\.?\s[^)\]]*[)\]]?/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const lead = (artists[0] || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${title}|${lead}`;
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

  /**
   * Every Spotify device this account can play on — phone, desktop app, speaker,
   * plus the in-tab player this app registers.
   *
   * Playback is an account-level thing on Spotify, not a per-app one, so the
   * dashboard can hand a track to any of these and keep the controls.
   */
  async devices(user) {
    const data = await api('/me/player/devices', user);
    return {
      devices: (data.devices ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type, // Computer | Smartphone | Speaker | TV | …
        active: Boolean(d.is_active),
        volume: d.volume_percent ?? null,
        restricted: Boolean(d.is_restricted), // can't be controlled through the API
      })),
    };
  },

  /**
   * What the account is playing, wherever it is playing.
   *
   * The Web Playback SDK only knows about its own tab, so when a speaker has
   * the music this is the only way to keep the app's controls in step with it.
   */
  async playerState(user) {
    const data = await api('/me/player', user).catch(() => null);
    if (!data || !data.item) return { playing: false, device: null, track: null };
    const track = data.item;
    return {
      playing: Boolean(data.is_playing),
      progressMs: data.progress_ms ?? 0,
      durationMs: track.duration_ms ?? 0,
      shuffle: Boolean(data.shuffle_state),
      repeat: data.repeat_state ?? 'off',
      device: data.device
        ? { id: data.device.id, name: data.device.name, type: data.device.type, volume: data.device.volume_percent ?? null }
        : null,
      track: {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artists: (track.artists ?? []).map((a) => a.name).join(', '),
        album: track.album?.name ?? null,
        image: track.album?.images?.[0]?.url ?? null,
      },
    };
  },

  /**
   * Transport for playback happening somewhere else. The in-tab player has its
   * own SDK methods; these are for when a speaker or a phone has the music.
   */
  async command(action, { deviceId, positionMs, volumePercent } = {}, user) {
    const target = deviceId ? `device_id=${encodeURIComponent(deviceId)}` : '';
    const withDevice = (path) => `${path}${target ? (path.includes('?') ? '&' : '?') + target : ''}`;

    switch (action) {
      case 'pause':
        await apiWrite(withDevice('/me/player/pause'), { method: 'PUT' }, user);
        break;
      case 'resume':
        await apiWrite(withDevice('/me/player/play'), { method: 'PUT' }, user);
        break;
      case 'next':
        await apiWrite(withDevice('/me/player/next'), { method: 'POST' }, user);
        break;
      case 'previous':
        await apiWrite(withDevice('/me/player/previous'), { method: 'POST' }, user);
        break;
      case 'seek':
        await apiWrite(withDevice(`/me/player/seek?position_ms=${Math.max(0, Math.round(positionMs ?? 0))}`), { method: 'PUT' }, user);
        break;
      case 'volume':
        await apiWrite(
          withDevice(`/me/player/volume?volume_percent=${Math.min(100, Math.max(0, Math.round(volumePercent ?? 50)))}`),
          { method: 'PUT' },
          user,
        );
        break;
      default:
        throw ApiError.badRequest(`Unknown player command "${action}".`);
    }
    return { ok: true, action };
  },

  /**
   * Make a device the active playback target.
   *
   * Spotify answers the first attempt with 404 "Not found." more often than
   * not: a speaker that has been idle isn't holding a connection, and Spotify
   * only wakes it once something asks for it. Try again a moment later and the
   * same call succeeds — which is why pressing the button twice always worked.
   * So the wait happens here instead of being handed to the person pressing it.
   *
   * Only the transient shapes are retried: a 404 (device asleep or not yet
   * registered), a 5xx, and a request that never landed. Anything Spotify has a
   * real opinion about — 401, 403, 403 Premium-required — fails immediately.
   */
  async transfer({ deviceId, play = true }, user) {
    if (!deviceId) throw ApiError.badRequest('Provide the `deviceId` to transfer playback to.');

    const delays = [400, 900, 1500]; // ~2.8s of patience, then give up
    let lastError;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        await apiWrite('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } }, user);
        return { transferred: true, attempts: attempt + 1 };
      } catch (error) {
        const status = error?.details?.error?.status;
        const networkFailure = error?.code === 'UPSTREAM_ERROR' && error?.details === undefined;
        const transient = status === 404 || (status >= 500 && status < 600) || networkFailure;
        if (!transient || attempt === delays.length) throw error;
        lastError = error;
        await sleep(delays[attempt]);
      }
    }
    throw lastError;
  },

  // Start / resume playback on a device. Optionally a playlist/album (contextUri) or tracks (uris).
  async play({ deviceId, contextUri, uris } = {}, user) {
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const body = contextUri ? { context_uri: contextUri } : uris ? { uris } : undefined;
    await apiWrite(`/me/player/play${query}`, { method: 'PUT', body }, user);
    return { playing: true };
  },

  /**
   * Spotify's own analysis of a track: tempo, time signature, and the beat, bar,
   * section, tatum and segment timelines.
   *
   * Spotify restricted /audio-analysis and /audio-features in November 2024 —
   * apps in Development mode get 403, regardless of scopes (a token that 403s
   * here still returns 200 from /me). So a failure is reported as
   * `{ available: false }` rather than thrown: the visualiser is expected to run
   * without it, and lights up automatically if access is ever granted.
   */
  async audioAnalysis(trackId, user) {
    if (!trackId) throw ApiError.badRequest('Provide a Spotify track id.');
    try {
      const data = await api(`/audio-analysis/${trackId}`, user);
      return {
        available: true,
        tempo: data.track?.tempo ?? 0,
        tempoConfidence: data.track?.tempo_confidence ?? 0,
        timeSignature: data.track?.time_signature ?? 4,
        key: data.track?.key ?? -1,
        mode: data.track?.mode ?? -1,
        loudness: data.track?.loudness ?? 0,
        duration: data.track?.duration ?? 0,
        // Trimmed to what a visualiser can use: full segment data is megabytes
        // and most of it is spectral detail the live FFT already provides.
        beats: (data.beats ?? []).map((b) => ({ start: b.start, duration: b.duration, confidence: b.confidence })),
        bars: (data.bars ?? []).map((b) => ({ start: b.start, duration: b.duration, confidence: b.confidence })),
        tatums: (data.tatums ?? []).map((b) => ({ start: b.start, duration: b.duration })),
        sections: (data.sections ?? []).map((x) => ({
          start: x.start,
          duration: x.duration,
          loudness: x.loudness,
          tempo: x.tempo,
          key: x.key,
          mode: x.mode,
          timeSignature: x.time_signature,
          confidence: x.confidence,
        })),
      };
    } catch (err) {
      return { available: false, reason: err?.message ?? 'Audio analysis is not available for this app.' };
    }
  },

  /** Track-level features: danceability, energy, valence and friends. */
  async audioFeatures(trackId, user) {
    if (!trackId) throw ApiError.badRequest('Provide a Spotify track id.');
    try {
      const d = await api(`/audio-features/${trackId}`, user);
      return {
        available: true,
        tempo: d.tempo,
        timeSignature: d.time_signature,
        key: d.key,
        mode: d.mode,
        loudness: d.loudness,
        energy: d.energy,
        valence: d.valence,
        danceability: d.danceability,
        acousticness: d.acousticness,
        instrumentalness: d.instrumentalness,
        speechiness: d.speechiness,
        durationMs: d.duration_ms,
      };
    } catch (err) {
      return { available: false, reason: err?.message ?? 'Audio features are not available for this app.' };
    }
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

  /**
   * What is queued up after the current track.
   *
   * This is how the app shows a playlist's contents at all. Spotify refuses
   * `/playlists/{id}/tracks` with a flat 403 "Forbidden" for apps in
   * Development mode — even the user's own playlists — and no scope fixes it.
   * The queue endpoint is not in that bucket, so playing a playlist and reading
   * the queue back is the one route to "what is on this list".
   *
   * The catch is inherent: it reports what is COMING, not the list from the
   * top, and it only says anything once something is playing.
   */
  async queue(user) {
    const data = await api('/me/player/queue', user);
    const shape = (t) =>
      t && {
        track: t.name,
        uri: t.uri,
        artists: t.artists?.map((a) => a.name),
        album: t.album?.name,
        image: t.album?.images?.[0]?.url,
        durationMs: t.duration_ms,
      };
    const current = shape(data.currently_playing);

    // Playing a bare track with `uris` gives Spotify no context to queue from,
    // and it answers by echoing the current track ten times over. Deduping by
    // uri kills that; if nothing survives but the song already playing, there
    // is genuinely no queue and saying so is better than showing a wall of the
    // same row.
    const seen = new Set(current?.uri ? [current.uri] : []);
    const queue = [];
    for (const item of data.queue ?? []) {
      const track = shape(item);
      if (!track?.uri || seen.has(track.uri)) continue;
      seen.add(track.uri);
      queue.push(track);
      if (queue.length >= 20) break;
    }

    return { current, queue };
  },

  /**
   * A radio off one track: more from the same artist, shuffled, queued up.
   *
   * Spotify's own recommender is gone for us — /recommendations now 404s
   * outright, and /artists/{id}/top-tracks and /related-artists both 403 under
   * Development mode. What still answers is the artist's own catalogue
   * (/artists/{id}/albums and /albums/{id}/tracks) and search. So this is an
   * ARTIST radio rather than a true similarity radio: honest about what it can
   * reach, rather than pretending to know what sounds alike.
   */
  async radio(seedUri, { limit = 14 } = {}, user) {
    const seedId = String(seedUri ?? '').split(':').pop();
    if (!seedId) throw ApiError.badRequest('Provide a track uri to seed the radio.');

    const seed = await api(`/tracks/${seedId}`, user);
    const artist = seed.artists?.[0];
    if (!artist?.id) return { seed: seed.name, tracks: [] };

    const pool = new Map();
    const add = (t) => {
      // A nameless entry is a local or unavailable track; it would queue as a blank row.
      if (!t?.uri || !t?.name || t.uri === seedUri || pool.has(t.uri)) return;
      pool.set(t.uri, {
        track: t.name,
        uri: t.uri,
        artists: (t.artists ?? []).map((a) => a.name),
        album: t.album?.name ?? seed.album?.name,
        image: (t.album?.images ?? seed.album?.images)?.[0]?.url,
        durationMs: t.duration_ms,
      });
    };

    // Search first: one call, and it skews to what the artist is known for,
    // which is what a radio should open with. The catalogue crawl below is
    // several calls, so it only runs if search did not fill the list.
    try {
      const found = await api(
        `/search?q=${encodeURIComponent(`artist:"${artist.name}"`)}&type=track&limit=${PAGE_SIZE}`,
        user,
      );
      for (const t of found.tracks?.items ?? []) add(t);
    } catch {
      /* fall through to the catalogue */
    }

    if (pool.size < limit) {
      try {
        const albums = await api(
          `/artists/${artist.id}/albums?include_groups=album,single&limit=8`,
          user,
        );
        for (const album of (albums.items ?? []).slice(0, 3)) {
          if (pool.size >= limit * 2) break;
          const tracks = await api(`/albums/${album.id}/tracks?limit=${PAGE_SIZE}`, user);
          for (const t of tracks.items ?? []) add({ ...t, album });
        }
      } catch {
        /* whatever search found is enough */
      }
    }

    // Shuffled, or a radio plays the same album in order every time.
    const tracks = [...pool.values()];
    for (let i = tracks.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }

    return { seed: seed.name, artist: artist.name, tracks: tracks.slice(0, limit) };
  },

  async recentlyPlayed(user) {
    const data = await api('/me/player/recently-played?limit=20', user);
    // Play a song three times and Spotify lists it three times. Keep the most
    // recent play of each (the list is newest-first) so this reads as "what
    // you've been listening to" rather than a repetitive log.
    const seen = new Set();
    return (data.items ?? [])
      .filter((i) => {
        const key = i.track?.uri;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((i) => ({
        track: i.track?.name,
        uri: i.track?.uri,
        artists: i.track?.artists?.map((a) => a.name),
        album: i.track?.album?.name,
        image: i.track?.album?.images?.[0]?.url,
        durationMs: i.track?.duration_ms,
        playedAt: i.played_at,
      }));
  },

  // Search the whole Spotify catalogue (tracks). Needs only a valid token.
  async search(query, user) {
    if (!query?.trim()) return [];
    // Apps in Spotify "Development mode" cap the search `limit` at 10 — 20 returns
    // "Invalid limit" — but `offset` still pages, so ask for two pages at once.
    // Deduping throws a good share of them away, and this keeps enough to show.
    const pages = await Promise.all(
      [0, PAGE_SIZE].map((offset) =>
        api(`/search?q=${encodeURIComponent(query)}&type=track&limit=${PAGE_SIZE}&offset=${offset}`, user).catch(
          () => null,
        ),
      ),
    );

    const items = pages.flatMap((page) => page?.tracks?.items ?? []);
    const seen = new Set();
    const out = [];

    for (const t of items) {
      const artists = t.artists?.map((a) => a.name) ?? [];
      const key = songKey(t.name, artists);
      if (!t.uri || seen.has(key) || seen.has(t.uri)) continue;
      seen.add(key);
      seen.add(t.uri);
      out.push({
        track: t.name,
        uri: t.uri,
        artists,
        album: t.album?.name,
        image: t.album?.images?.[0]?.url,
        durationMs: t.duration_ms,
      });
      if (out.length >= SEARCH_RESULTS) break;
    }

    return out;
  },
};
