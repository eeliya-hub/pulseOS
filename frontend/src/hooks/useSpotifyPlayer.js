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
let store = {
  status: 'loading',
  deviceId: null, // this tab's own SDK device
  state: null,
  position: 0,
  playbackError: '',
  // Spotify Connect: playback belongs to the account, not to this tab, so it can
  // live on a speaker or a phone while the controls stay here.
  devices: [],
  activeDeviceId: null, // whichever device Spotify says is playing
  remoteName: null, // its name, when it isn't this tab
  transferringTo: null, // device id of a handover in flight (Spotify can be slow to wake one)
};

/** Is the music playing somewhere other than this tab? */
const isRemote = () => Boolean(store.activeDeviceId && store.activeDeviceId !== store.deviceId);
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
  // Whichever device has been chosen to play on — this tab unless a speaker or
  // a phone was picked.
  const target = store.activeDeviceId ?? store.deviceId;
  const here = target === store.deviceId;

  try {
    // Must be invoked from the click/gesture path so browser autoplay policy
    // allows audio once Spotify transfers playback into this tab.
    if (here) await player?.activateElement?.();

    if (!target) {
      await player?.connect?.();
      setPlaybackError('Spotify player is reconnecting. Try again in a moment.');
      return;
    }

    // Handing the session over first is what lets a track start on a speaker
    // that is currently idle.
    await api.music.transfer(target, false);
    await api.music.play({ deviceId: target, contextUri, uris });
    if (!here) {
      watchRemote(true);
      await refreshRemoteState();
    }
  } catch (err) {
    // Most failures here are the device still waking up right after transfer —
    // give it a beat and retry the play once before surfacing an error.
    try {
      await delay(700);
      if (!target) throw err;
      await api.music.play({ deviceId: target, contextUri, uris });
      if (!here) await refreshRemoteState();
    } catch {
      reportPlaybackError(err);
    }
  }
}

// Transport commands (play/pause/skip/seek) error out if nothing is loaded, so
// `needsTrack` makes them a no-op on an empty player — guarding against a stray
// tap or an AI call when there's nothing to control.
async function runCommand(command, needsTrack = false, remote = null) {
  if (needsTrack && !store.state?.track) return;
  setPlaybackError('');

  // Playing on a speaker: the SDK only ever controls its own tab, so the command
  // has to go to Spotify for the device that actually holds the music.
  if (isRemote() && remote) {
    try {
      await remote(store.activeDeviceId);
      await refreshRemoteState();
    } catch (err) {
      reportPlaybackError(err);
    }
    return;
  }

  if (!player) return;
  try {
    await player.activateElement?.();
    await command(player);
  } catch (err) {
    reportPlaybackError(err);
  }
}

// ── Playing somewhere else ────────────────────────────────────────────────
let remoteTicker = null;

/**
 * Pull the account's playback state, which is the only way to see what a speaker
 * is doing — the SDK reports on this tab and nothing else.
 */
async function refreshRemoteState() {
  try {
    const p = await api.music.player();
    if (!p?.track) {
      // Nothing playing anywhere. That is not a reason to forget which device
      // was chosen — it is exactly when the choice matters, because it decides
      // where the next track starts.
      if (p?.device?.id) {
        const named = store.devices.find((d) => d.id === p.device.id)?.name ?? p.device.name ?? null;
        setStore({ activeDeviceId: p.device.id, remoteName: p.device.id === store.deviceId ? null : named });
      }
      return;
    }
    const onThisTab = p.device?.id && p.device.id === store.deviceId;
    setStore({
      activeDeviceId: p.device?.id ?? null,
      remoteName: onThisTab ? null : (p.device?.name ?? null),
      // The SDK keeps its own tab in step; only mirror state when it's elsewhere.
      ...(onThisTab
        ? {}
        : {
            state: {
              id: p.track.id,
              uri: p.track.uri,
              track: p.track.name,
              artists: p.track.artists,
              image: p.track.image,
              paused: !p.playing,
              positionMs: p.progressMs,
              durationMs: p.durationMs,
            },
            position: p.progressMs,
          }),
    });
  } catch {
    /* a poll that fails tells us nothing — keep what's on screen */
  }
}

/** Poll while the music is on another device, so the UI tracks it. */
function watchRemote(on) {
  if (remoteTicker) {
    window.clearInterval(remoteTicker);
    remoteTicker = null;
  }
  if (on) remoteTicker = window.setInterval(refreshRemoteState, 4000);
}

/** Every device this account can play on, refreshed on demand. */
async function refreshDevices() {
  try {
    const { devices = [] } = await api.music.devices();
    const active = devices.find((d) => d.active) ?? null;
    const chosen = active?.id ?? store.activeDeviceId; // an idle account reports none active
    const named = devices.find((d) => d.id === chosen)?.name ?? null;
    setStore({
      devices,
      activeDeviceId: chosen,
      remoteName: chosen && chosen !== store.deviceId ? named : null,
    });
    watchRemote(Boolean(active && active.id !== store.deviceId));
    return devices;
  } catch {
    return store.devices;
  }
}

/**
 * Hand playback to a device — a speaker, a phone, or back to this tab.
 * Spotify keeps the queue and position, so this is a handover rather than a
 * restart.
 */
async function transferTo(deviceId) {
  const target = deviceId ?? store.deviceId;
  if (!target) return;
  setPlaybackError('');

  const wasPlaying = Boolean(store.state?.track && !store.state.paused);
  const remote = target !== store.deviceId;
  const named = store.devices.find((d) => d.id === target)?.name ?? null;

  // Remember the choice immediately: with nothing playing, Spotify has no
  // session to hand over and refuses the transfer — but the pick still decides
  // where the next track goes, so it must stick either way.
  setStore({ activeDeviceId: target, remoteName: remote ? named : null, transferringTo: target });
  watchRemote(remote);

  try {
    if (!remote) await player?.activateElement?.(); // browsers need the gesture
    // The backend waits out Spotify's "device is asleep" 404s, so this call can
    // take a couple of seconds. `transferringTo` marks the row as pending for
    // that whole window, rather than the press looking like it did nothing.
    await api.music.transfer(target, wasPlaying);
    // Spotify takes a beat to move the session.
    window.setTimeout(() => {
      refreshDevices();
      refreshRemoteState();
    }, 900);
  } catch {
    // Nothing was playing to move. The device is still the chosen target, and
    // the next play will start there — so this is not worth alarming about.
    if (wasPlaying) setPlaybackError('Spotify could not move playback to that device.');
  } finally {
    if (store.transferringTo === target) setStore({ transferringTo: null });
  }
}

// ── Ducking under a voice session ──────────────────────────────────────────
// The music steps back for the whole conversation, in two stages: part-way while
// the mic is open, further while Pulse is actually speaking. Each level is a
// fraction of the listener's own volume, so it's their balance that's respected.
//
// Volume is the only handle there is. The Web Playback SDK streams DRM-protected
// audio from its own cross-origin iframe, so the stream cannot be routed through
// Web Audio — a real low-pass "muffle" isn't reachable from here.
const DUCK_LEVELS = {
  none: 1, // no session — the listener's own volume
  listening: 0.45, // mic open: music steps back but stays company
  speaking: 0.2, // Pulse talking: right under the voice
};
const DIP_MS = 200; // going down: fast attack, out of the way of the first word
const LIFT_MS = 900; // coming up: slow release, no jolt
const FADE_STEP_MS = 40;

let fadeTimer = null;
let baseVolume = null; // level to return to: taken on the way down, cleared on the way up
let duckLevel = 'none';
let duckGen = 0; // invalidates a fade whose volume read is already out of date

function stopFade() {
  if (fadeTimer) {
    window.clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

const applyVolume = (v) => {
  Promise.resolve(player?.setVolume(Math.min(1, Math.max(0, v)))).catch(() => {});
};

// Volume is heard logarithmically, so ramp geometrically — a linear ramp rushes
// at one end and crawls at the other.
const rampVolume = (from, to, t) => {
  const a = Math.max(from, 0.0005);
  const b = Math.max(to, 0.0005);
  return a * (b / a) ** t;
};

function fadeVolume(from, to, durationMs, onDone) {
  stopFade();
  const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
  let step = 0;
  fadeTimer = window.setInterval(() => {
    step += 1;
    if (step >= steps) {
      stopFade();
      applyVolume(to);
      onDone?.();
      return;
    }
    applyVolume(rampVolume(from, to, step / steps));
  }, FADE_STEP_MS);
}

/**
 * Hold the music at one of the DUCK_LEVELS — 'listening', 'speaking', or 'none'
 * to release it. Deeper levels dip fast, shallower ones ease back up.
 *
 * Safe to call before there's a player (no-ops) and safe to call repeatedly: the
 * level to restore is captured only on the way down, so a duck landing while a
 * lift is still fading can't bookmark a half-faded volume as the listener's own.
 */
async function setDuckLevel(next) {
  const name = next in DUCK_LEVELS ? next : 'none';
  if (!player || name === duckLevel) return;
  const goingDown = DUCK_LEVELS[name] < DUCK_LEVELS[duckLevel];
  duckLevel = name;
  const gen = (duckGen += 1);

  const current = await player.getVolume().catch(() => null);
  if (gen !== duckGen || !player || current == null) return; // superseded, or no volume to read

  if (name === 'none') {
    fadeVolume(current, baseVolume ?? current, LIFT_MS, () => {
      baseVolume = null;
    });
    return;
  }
  if (baseVolume === null) baseVolume = current;
  fadeVolume(current, baseVolume * DUCK_LEVELS[name], goingDown ? DIP_MS : LIFT_MS);
}

const remoteCommand = (action, options = {}) => (deviceId) =>
  api.music.command({ action, deviceId, ...options });

const controls = {
  toggle: () =>
    runCommand(
      (p) => p.togglePlay(),
      true,
      remoteCommand(store.state?.paused ? 'resume' : 'pause'),
    ),
  pause: () => runCommand((p) => p.pause(), true, remoteCommand('pause')),
  resume: () => runCommand((p) => p.resume(), true, remoteCommand('resume')),
  next: () => runCommand((p) => p.nextTrack(), true, remoteCommand('next')),
  previous: () => runCommand((p) => p.previousTrack(), true, remoteCommand('previous')),
  seek: (ms) => {
    runCommand((p) => p.seek(ms), true, remoteCommand('seek', { positionMs: ms }));
    setStore({ position: ms });
  },
  playContext,
  setDuckLevel,
  refreshDevices,
  transferTo,
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
    devices: snap.devices,
    activeDeviceId: snap.activeDeviceId,
    // Set when the music is on another device — the UI says where it is playing.
    playingOn: snap.remoteName,
    // Set while a handover is still being retried, so the picker can say so.
    transferringTo: snap.transferringTo,
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

/**
 * Resolve once the player has settled into a real state — ready, errored, or
 * needing auth. The launch screen waits on this so the Music view never opens
 * onto "Connecting to Spotify…"; the handshake happens behind the loader
 * instead. Callers bound it with their own timeout.
 */
export function whenPlayerSettled() {
  ensureInit();
  if (store.status !== 'loading') return Promise.resolve(store.status);
  return new Promise((resolve) => {
    const listener = (snap) => {
      if (snap.status === 'loading') return;
      subscribers.delete(listener);
      resolve(snap.status);
    };
    subscribers.add(listener);
  });
}

// Tear the SDK player down cleanly. Each live player registers a "Pulse OS"
// device with Spotify; if one is left connected it lingers as a zombie device
// that competes with the next one for the playback session, which can break
// audio streaming (storage-resolve 403s).
function disposePlayer() {
  stopTicker();
  stopFade();
  baseVolume = null;
  duckLevel = 'none';
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
