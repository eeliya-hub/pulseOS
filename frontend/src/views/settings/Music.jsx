import { Laptop, Loader2, Monitor, Music2, RefreshCw, Smartphone, Speaker, Tv } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBackendStatus } from '../../hooks/useBackendStatus.js';
import { useSettings } from '../../hooks/useSettings.js';
import { useSpotifyPlayer } from '../../hooks/useSpotifyPlayer.js';
import { albumPalette, DEFAULT_PALETTE } from '../../services/music/albumPalette.js';
import { Choice, Empty, Group, Page, Preview, Row, Segmented, ToggleRow } from './controls.jsx';

const DEVICE_ICON = { Computer: Laptop, Smartphone, Speaker, TV: Tv, CastVideo: Tv, CastAudio: Speaker };
const LIGHT = { soft: 0.6, rich: 1, vivid: 1.32 };
const WORDS = { small: '0.875rem', medium: '1.0625rem', large: '1.3125rem' };

/** Where the Spotify connection stands, in words. */
function useSpotifyState() {
  const player = useSpotifyPlayer();
  const backend = useBackendStatus();
  const configured = backend.integrations?.music;
  const { status } = player;
  const connected = status === 'ready' || status === 'not-premium';
  let words = 'Connecting…';
  if (status === 'ready') words = 'Connected';
  else if (status === 'not-premium') words = 'Connected, without Premium';
  else if (status === 'needs-auth') words = configured === false ? 'Not set up' : 'Not connected';
  else if (status === 'error') words = backend.failed ? 'Backend unreachable' : 'Couldn’t start';
  return { ...player, configured, connected, words };
}

const rgb = ([r, g, b]) => `rgb(${r} ${g} ${b})`;

/**
 * The immersive player, small and live: the record's colours drifting (or
 * holding still), as strong as you've asked, with the words at the size
 * you've chosen — or none at all.
 */
export function MusicPreview() {
  const { settings } = useSettings();
  const { state } = useSpotifyPlayer();
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  useEffect(() => {
    let alive = true;
    albumPalette(state?.image).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [state?.image]);
  const [one, two, three, four] = palette.swatches ?? DEFAULT_PALETTE.swatches;
  const moving = settings.immersiveMotion !== false && !settings.reduceMotion;

  return (
    <Preview
      className="!bg-[#04060d]"
      style={{
        '--blob-1': rgb(one),
        '--blob-2': rgb(two),
        '--blob-3': rgb(three),
        '--blob-4': rgb(four),
        '--light': LIGHT[settings.immersiveLight] ?? 1,
        '--lit': rgb(palette.glow),
      }}
    >
      <div className={`immersive-light ${moving ? '' : 'immersive-light--held'}`}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`immersive-pool mini-pool--${n}`}>
            <span className="immersive-orbit">
              <span className="immersive-blob" />
            </span>
          </span>
        ))}
        <span className="immersive-shade" />
      </div>
      {settings.showLyrics !== false ? (
        <div className="absolute left-5 top-5 space-y-1 font-display" style={{ fontSize: WORDS[settings.lyricsSize] ?? WORDS.medium }}>
          <p className="leading-tight text-moon/30">The city hums beneath the rain</p>
          <p className="relative leading-tight text-moon">
            <span className="absolute -left-2.5 top-[0.2em] h-[0.9em] w-[2px] rounded-full" style={{ background: 'var(--lit)' }} />
            Hold the light a little longer
          </p>
          <p className="leading-tight text-moon/30">Every window keeps a fire</p>
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 h-[2.9rem] border-t border-white/20 bg-[linear-gradient(180deg,rgba(4,6,13,0.2),rgba(4,6,13,0.8))]">
        <div className="flex h-full items-center gap-2.5 px-5">
          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-[0.2rem] bg-white/10">
            {state?.image ? <img src={state.image} alt="" className="h-full w-full object-cover" /> : <Music2 className="h-3.5 w-3.5 text-moon/40" />}
          </span>
          <span className="min-w-0">
            <span className="display-type block truncate text-[0.8125rem] leading-tight text-moon">{state?.track || 'Your record'}</span>
            <span className="t-micro block truncate">{state?.artists || 'Its colours fill the room'}</span>
          </span>
        </div>
      </div>
    </Preview>
  );
}

export function MusicPane() {
  const spotify = useSpotifyState();
  const { settings, update } = useSettings();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const still = Boolean(settings.reduceMotion);

  const disconnect = async () => {
    setLeaving(true);
    setError('');
    try {
      await spotify.disconnect();
    } catch (e) {
      setError(e?.message || 'Spotify couldn’t be disconnected just now.');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <Page>
      <Group title="Spotify" note="Your playlists, the player, the words to the songs — and the music on any of your devices.">
        <div className="settings-row">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.8rem] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <img src="/logos/apps/spotify.webp" alt="" className="h-6 w-6 object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="settings-row-label">{spotify.words}</span>
            <span className={`mt-0.5 flex items-center gap-1.5 text-[0.8125rem] ${spotify.connected ? 'text-rise' : 'text-dim'}`}>
              {spotify.connected ? <span className="h-1.5 w-1.5 rounded-full bg-rise" /> : null}
              {spotify.connected
                ? spotify.status === 'not-premium'
                  ? 'Plays on your other devices — this tab needs Premium'
                  : 'Plays here and on any of your devices'
                : spotify.configured === false
                  ? 'Needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in backend/.env'
                  : 'Sign in once, in Spotify’s own window'}
            </span>
          </div>
          {spotify.connected ? (
            <button type="button" onClick={disconnect} disabled={leaving} className="pill h-9 px-4 text-moon/80 hover:text-fall">
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Disconnect
            </button>
          ) : spotify.configured === false ? null : (
            <button
              type="button"
              onClick={() => Promise.resolve(spotify.authorize()).catch((e) => setError(e?.message || 'Couldn’t open Spotify.'))}
              className="pill pill-lit h-9 px-4"
            >
              Connect
            </button>
          )}
        </div>
        {error ? <p className="px-5 pb-4 text-[0.8125rem] text-fall">{error}</p> : null}
      </Group>

      <Devices spotify={spotify} />

      <Group title="Immersive player" note="Full screen from the player: the words, the record, and the room lit in its colours.">
        <ToggleRow
          label="Moving light"
          hint={still ? 'Reduce motion is on in Appearance, so the light holds still.' : 'The record’s colours drift round the room while it plays. M switches it in the player.'}
          checked={settings.immersiveMotion !== false}
          onChange={(immersiveMotion) => update({ immersiveMotion })}
          disabled={still}
        />
        <Row label="Light" hint="How strongly the record’s colours fill the room.">
          <Segmented
            label="Light"
            value={settings.immersiveLight ?? 'rich'}
            onChange={(immersiveLight) => update({ immersiveLight })}
            options={[
              { id: 'soft', label: 'Soft' },
              { id: 'rich', label: 'Rich' },
              { id: 'vivid', label: 'Vivid' },
            ]}
          />
        </Row>
        <ToggleRow
          label="The words"
          hint="Lyrics in time with the song, where there are any. Off leaves just the room and the record."
          checked={settings.showLyrics !== false}
          onChange={(showLyrics) => update({ showLyrics })}
        />
        <Row label="Size of the words">
          <Segmented
            label="Size of the words"
            value={settings.lyricsSize ?? 'medium'}
            onChange={(lyricsSize) => update({ lyricsSize })}
            options={[
              { id: 'small', label: 'Small' },
              { id: 'medium', label: 'Medium' },
              { id: 'large', label: 'Large' },
            ]}
          />
        </Row>
        <ToggleRow
          label="Takes over when idle"
          hint="If music is playing when Home goes quiet, the player stands in for the clock. A tap brings you back."
          checked={settings.afkImmersive !== false}
          onChange={(afkImmersive) => update({ afkImmersive })}
        />
      </Group>
    </Page>
  );
}

/** Every device the account can play on; picking one hands the music to it. */
function Devices({ spotify }) {
  const { devices, deviceId, activeDeviceId, transferringTo, controls, connected } = spotify;
  const [looking, setLooking] = useState(false);
  const usable = devices.filter((d) => !d.restricted);
  const list = deviceId && !usable.some((d) => d.id === deviceId) ? [{ id: deviceId, name: 'Pulse OS', type: 'Computer' }, ...usable] : usable;

  return (
    <Group
      title="Plays on"
      note="The music moves without stopping — Spotify keeps the queue and where you were."
      action={
        connected ? (
          <button
            type="button"
            onClick={() => {
              setLooking(true);
              Promise.resolve(controls.refreshDevices()).finally(() => setLooking(false));
            }}
            className="pill h-8 px-3.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${looking ? 'animate-spin' : ''}`} aria-hidden="true" />
            Look again
          </button>
        ) : null
      }
    >
      {!connected ? (
        <Empty>Connect Spotify to choose where the music plays.</Empty>
      ) : list.length === 0 ? (
        <Empty>No devices awake. Open Spotify on a phone or a speaker and look again.</Empty>
      ) : (
        list.map((d) => {
          const here = d.id === deviceId;
          const Icon = here ? Monitor : (DEVICE_ICON[d.type] ?? Speaker);
          const chosen = (activeDeviceId ?? deviceId) === d.id;
          return (
            <Choice
              key={d.id}
              selected={chosen}
              onClick={() => controls.transferTo(d.id)}
              lead={<Icon className="h-[1.125rem] w-[1.125rem] shrink-0 text-moon/70" strokeWidth={1.6} />}
              title={here ? 'This Pulse' : d.name}
              meta={
                transferringTo === d.id
                  ? 'Handing over…'
                  : chosen
                    ? spotify.state?.track && !spotify.state.paused
                      ? 'Playing now'
                      : 'The next track starts here'
                    : d.type === 'Smartphone'
                      ? 'Phone'
                      : d.type
              }
            />
          );
        })
      )}
    </Group>
  );
}
