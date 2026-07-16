import { useCallback, useEffect, useRef, useState } from 'react';
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
    track: track?.name ?? '',
    artists: (track?.artists ?? []).map((a) => a.name).join(', '),
    image: track?.album?.images?.[0]?.url,
    paused: state.paused,
    positionMs: state.position,
    durationMs: state.duration,
  };
}

/**
 * Drives the in-tab Spotify player.
 *
 * status: 'loading' | 'needs-auth' | 'not-premium' | 'error' | 'ready'
 */
export function useSpotifyPlayer() {
  const [status, setStatus] = useState('loading');
  const [deviceId, setDeviceId] = useState(null);
  const [state, setState] = useState(null);
  const [position, setPosition] = useState(0);
  const playerRef = useRef(null);
  const tickRef = useRef(null);

  const init = useCallback(async () => {
    // Verify we're connected before pulling in the SDK.
    try {
      await api.music.token();
    } catch (err) {
      setStatus(err.status === 401 ? 'needs-auth' : 'error');
      return;
    }

    const Spotify = await loadSdk();
    if (playerRef.current) return; // already initialised

    const player = new Spotify.Player({
      name: 'Pulse OS',
      volume: 0.6,
      getOAuthToken: async (cb) => {
        try {
          const { accessToken } = await api.music.token();
          cb(accessToken);
        } catch {
          setStatus('needs-auth');
        }
      },
    });
    playerRef.current = player;

    player.addListener('ready', ({ device_id }) => {
      setDeviceId(device_id);
      setStatus('ready');
    });
    player.addListener('not_ready', () => setDeviceId(null));
    player.addListener('player_state_changed', (s) => {
      const mapped = mapState(s);
      setState(mapped);
      setPosition(mapped?.positionMs ?? 0);
    });
    player.addListener('authentication_error', () => setStatus('needs-auth'));
    player.addListener('account_error', () => setStatus('not-premium'));
    player.addListener('initialization_error', () => setStatus('error'));

    player.connect();
  }, []);

  useEffect(() => {
    init();
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [init]);

  // Smoothly advance the progress bar between state pushes.
  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (!state || state.paused) return undefined;
    tickRef.current = window.setInterval(() => {
      setPosition((p) => Math.min(p + 1000, state.durationMs));
    }, 1000);
    return () => window.clearInterval(tickRef.current);
  }, [state]);

  // Open the Spotify consent screen, then poll until the backend has tokens.
  const authorize = useCallback(async () => {
    const { url } = await api.music.authUrl();
    const popup = window.open(url, 'spotify-auth', 'width=520,height=680');
    const poll = window.setInterval(async () => {
      try {
        await api.music.token();
        window.clearInterval(poll);
        popup?.close();
        setStatus('loading');
        init();
      } catch {
        /* keep waiting */
      }
    }, 1500);
  }, [init]);

  const playContext = useCallback(
    async ({ contextUri, uris }) => {
      if (!deviceId) return;
      await api.music.play({ deviceId, contextUri, uris });
    },
    [deviceId],
  );

  const controls = {
    toggle: () => playerRef.current?.togglePlay(),
    next: () => playerRef.current?.nextTrack(),
    previous: () => playerRef.current?.previousTrack(),
    seek: (ms) => {
      playerRef.current?.seek(ms);
      setPosition(ms);
    },
    playContext,
  };

  return { status, deviceId, state, position, controls, authorize };
}
