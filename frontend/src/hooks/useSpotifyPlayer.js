import { useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';

// Load the Spotify Web Playback SDK once and resolve when window.Spotify exists.
function loadSdk() {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve(window.Spotify);
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = SDK_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

function mapState(state) {
  if (!state) return null;
  const track = state.track_window?.current_track;
  return {
    // Track identity, needed to ask Spotify for its analysis of this song.
    id: track?.id ?? null,
    uri: track?.uri ?? null,
    track: track?.name ?? '',
    artists: (track?.artists ?? []).map((a) => a.name).join(', '),
    image: track?.album?.images?.[0]?.url,
    paused: state.paused,
    positionMs: state.position,
    durationMs: state.duration,
  };
}

// ── Module-level singleton ─────────────────────────────────────────────────
// One SDK player for the whole app, shared by the Music view, the floating
// mini-player, and the AI tools — so playback is continuous across tabs and
// controllable from anywhere. State is published to subscribers React-style.
//
// status: 'loading' | 'needs-auth' | 'not-premium' | 'error' | 'ready'
let store = { status: 'loading', deviceId: null, state: null, position: 0, playbackError: '' };
const subscribers = new Set();
function setStore(patch) {
  store = { ...store, ...patch };
  subscribers.forEach((fn) => fn(store));
}

let player = null;
let ticker = null;
let initStarted = false;
let errorTimer = null;

// Playback errors are transient — a one-off SDK blip or an autoplay block. Show
// the message briefly, then clear it so it doesn't stay pinned under Now Playing
// long after the moment has passed. Persistent problems live in `status` instead.
function setPlaybackError(msg) {
  if (errorTimer) {
    window.clearTimeout(errorTimer);
    errorTimer = null;
  }
  setStore({ playbackError: msg || '' });
  if (msg) {
    errorTimer = window.setTimeout(() => {
      errorTimer = null;
      setStore({ playbackError: '' });
    }, 6000);
  }
}

function stopTicker() {
  if (ticker) {
    window.clearInterval(ticker);
    ticker = null;
  }
}

// Smoothly advance the progress bar between the SDK's state pushes.
function startTicker() {
  stopTicker();
  if (!store.state || store.state.paused) return;
  ticker = window.setInterval(() => {
    const cur = store.state;
    if (!cur) return;
    setStore({ position: Math.min(store.position + 1000, cur.durationMs) });
  }, 1000);
}

function reportPlaybackError(err, fallback = 'Spotify playback failed.') {
  setPlaybackError(err?.message ?? fallback);
}

async function init() {
  // Verify we're connected before pulling in the SDK.
  try {
    await api.music.token();
  } catch (err) {
    setStore({ status: err.status === 401 ? 'needs-auth' : 'error' });
    return;
  }

  const Spotify = await loadSdk();
  if (player) return; // already initialised

  player = new Spotify.Player({
    name: 'Pulse OS',
    volume: 0.6,
    getOAuthToken: async (cb) => {
      try {
        const { accessToken } = await api.music.token();
        cb(accessToken);
      } catch {
        setStore({ status: 'needs-auth' });
      }
    },
  });

  player.addListener('ready', ({ device_id }) =>
    setStore({ deviceId: device_id, status: 'ready', playbackError: '' }),
  );
  player.addListener('not_ready', () => {
    setStore({ deviceId: null, status: 'loading' });
    setPlaybackError('Spotify player disconnected. Reconnecting…');
  });
  player.addListener('player_state_changed', (s) => {
    const mapped = mapState(s);
    setStore({ state: mapped, position: mapped?.positionMs ?? 0 });
    if (mapped && !mapped.paused) setPlaybackError(''); // playing again — clear any stale error
    startTicker();
  });
  player.addListener('autoplay_failed', () =>
    setPlaybackError('Browser blocked Spotify playback. Press play again.'),
  );
  player.addListener('playback_error', ({ message } = {}) =>
    setPlaybackError(message || 'Spotify playback failed.'),
  );
  player.addListener('authentication_error', ({ message } = {}) => {
    setStore({ status: 'needs-auth' });
    setPlaybackError(message || 'Spotify needs reconnecting.');
  });
  player.addListener('account_error', ({ message } = {}) => {
    setStore({ status: 'not-premium' });
    setPlaybackError(message || 'Spotify Premium is required for web playback.');
  });
  player.addListener('initialization_error', ({ message } = {}) => {
    setStore({ status: 'error' });
    setPlaybackError(message || 'Spotify player failed to start.');
  });

  player.connect();
}

// Kick off initialisation exactly once, on first use (a mounted hook or an AI tool).
function ensureInit() {
  if (initStarted) return;
  initStarted = true;
  init();
}

// Open the Spotify consent screen, then poll until the backend has tokens.
async function authorize() {
  const { url } = await api.music.authUrl();
  const popup = window.open(url, 'spotify-auth', 'width=520,height=680');
  const poll = window.setInterval(async () => {
    try {
      await api.music.token();
      window.clearInterval(poll);
      popup?.close();
      setStore({ status: 'loading' });
      init();
    } catch {
      /* keep waiting */
    }
  }, 1500);
}

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function playContext({ contextUri, uris }) {
  setPlaybackError('');
  try {
    // Must be invoked from the click/gesture path so browser autoplay policy
    // allows audio once Spotify transfers playback into this tab.
    await player?.activateElement?.();

    if (!store.deviceId) {
      await player?.connect?.();
      setPlaybackError('Spotify player is reconnecting. Try again in a moment.');
      return;
    }

    await api.music.transfer(store.deviceId, false);
    await api.music.play({ deviceId: store.deviceId, contextUri, uris });
  } catch (err) {
    // Most failures here are the device still waking up right after transfer —
    // give it a beat and retry the play once before surfacing an error.
    try {
      await delay(700);
      if (!store.deviceId) throw err;
      await api.music.play({ deviceId: store.deviceId, contextUri, uris });
    } catch {
      reportPlaybackError(err);
    }
  }
}

// Transport commands (play/pause/skip/seek) error out if nothing is loaded, so
// `needsTrack` makes them a no-op on an empty player — guarding against a stray
// tap or an AI call when there's nothing to control.
async function runCommand(command, needsTrack = false) {
  if (!player) return;
  if (needsTrack && !store.state?.track) return;
  setPlaybackError('');
  try {
    await player.activateElement?.();
    await command(player);
  } catch (err) {
    reportPlaybackError(err);
  }
}

const controls = {
  toggle: () => runCommand((p) => p.togglePlay(), true),
  pause: () => runCommand((p) => p.pause(), true),
  resume: () => runCommand((p) => p.resume(), true),
  next: () => runCommand((p) => p.nextTrack(), true),
  previous: () => runCommand((p) => p.previousTrack(), true),
  seek: (ms) => {
    runCommand((p) => p.seek(ms), true);
    setStore({ position: ms });
  },
  playContext,
};

/** React hook: subscribe to the shared player and drive its lifecycle. */
export function useSpotifyPlayer() {
  const [snap, setSnap] = useState(store);

  useEffect(() => {
    subscribers.add(setSnap);
    setSnap(store); // sync in case it changed before mount
    ensureInit();
    return () => subscribers.delete(setSnap);
  }, []);

  return {
    status: snap.status,
    deviceId: snap.deviceId,
    state: snap.state,
    position: snap.position,
    playbackError: snap.playbackError,
    controls,
    authorize,
  };
}

// Non-React handle for the AI tools — same shared player + controls.
export const spotifyPlayer = {
  ensureInit,
  getSnapshot: () => store,
  controls,
};

// Tear the SDK player down cleanly. Each live player registers a "Pulse OS"
// device with Spotify; if one is left connected it lingers as a zombie device
// that competes with the next one for the playback session, which can break
// audio streaming (storage-resolve 403s).
function disposePlayer() {
  stopTicker();
  if (errorTimer) {
    window.clearTimeout(errorTimer);
    errorTimer = null;
  }
  try {
    player?.disconnect();
  } catch {
    /* already gone */
  }
  player = null;
  initStarted = false;
}

// Disconnect when the page goes away (reload, navigation, tab close) so devices
// don't pile up across reloads. `pagehide` fires reliably where `beforeunload`
// doesn't (bfcache, mobile Safari).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', disposePlayer);
}

// Vite HMR: the module re-executes with a fresh `player` on hot-reload, so the
// previous instance must be disposed or it becomes a zombie. (Stripped from
// production builds, where the singleton simply lives for the session.)
if (import.meta.hot) {
  import.meta.hot.dispose(disposePlayer);
}
