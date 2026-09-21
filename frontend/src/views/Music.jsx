import {
  Check,
  Expand,
  Laptop,
  Loader2,
  ListMusic,
  Music2,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Smartphone,
  Speaker,
  Tv,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import GlassCard from '../components/GlassCard.jsx';
import MusicImmersive from '../components/MusicImmersive.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
import { Column, Ground, SkyZone } from '../components/Stage.jsx';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';
import useWholeRows from '../hooks/useWholeRows.js';
import { api } from '../services/api/backendClient.js';
import { albumPalette, DEFAULT_PALETTE, rgba } from '../services/music/albumPalette.js';
import { setSkyOverride } from '../hooks/useSky.js';
import { peek, put } from '../services/warmCache.js';

const fmt = (ms) => {
  if (ms == null) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const artistsOf = (t) => (Array.isArray(t.artists) ? t.artists.join(', ') : t.artists || '');

/**
 * Where the music comes out.
 *
 * Playback belongs to the Spotify account rather than to this tab, so it can be
 * handed to a speaker or a phone and still be driven from here — Spotify keeps
 * the queue and the position, so it is a handover, not a restart.
 *
 * One button rather than a row of chips: which device is playing matters when
 * you go looking for it, not while you are listening.
 */
function DeviceButton({ devices, activeId, thisTabId, playingOn, pendingId, onPick }) {
  const [open, setOpen] = useState(false);
  const others = devices.filter((d) => d.id !== thisTabId && !d.restricted);
  if (!others.length) return null;

  // "This dashboard" is only an option when this tab actually has a player of
  // its own. Without one — no Premium, no browser DRM, or the SDK still
  // starting — offering it would either do nothing or duplicate the entry
  // Spotify already lists for this app.
  const options = thisTabId ? [{ id: thisTabId, name: 'This dashboard', type: 'Computer' }, ...others] : others;
  const current = options.find((d) => d.id === activeId) ?? options[0];
  const CurrentIcon = DEVICE_ICONS[current.type] ?? Speaker;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={playingOn ? `Playing on ${playingOn}. Change device` : 'Choose playback device'}
        aria-expanded={open}
        title={playingOn ? `Playing on ${playingOn}` : 'Play on this dashboard'}
        className={[
          'pill h-11 w-11 px-0',
          // Tinted while the music is somewhere else, so it reads at a glance.
          playingOn ? 'pill-accent' : '',
        ].join(' ')}
      >
        {pendingId ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CurrentIcon className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close device list"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="theme-popover launcher-rise absolute bottom-full right-0 z-50 mb-2 w-60 overflow-hidden rounded-[1.25rem] p-1.5">
            <p className="px-2.5 py-1.5 text-[0.75rem] font-semibold text-moon/32">Play on</p>
            {options.map((d) => {
              const Icon = DEVICE_ICONS[d.type] ?? Speaker;
              const on = d.id === current.id;
              // Waking a sleeping speaker takes Spotify a moment; the row says
              // so instead of the press appearing to have done nothing.
              const pending = d.id === pendingId;
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onPick(d.id);
                    setOpen(false);
                  }}
                  className={[
                    'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition',
                    on ? 'bg-accent/12 text-accent' : 'text-moon/65 hover:bg-white/[0.06] hover:text-moon',
                    pending ? 'cursor-default' : '',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{d.name}</span>
                  {pending ? (
                    <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-accent/80" aria-hidden="true" />
                  ) : on ? (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

const DEVICE_ICONS = {
  Computer: Laptop,
  Smartphone: Smartphone,
  Speaker: Speaker,
  TV: Tv,
  AVR: Speaker,
  STB: Tv,
};

export default function Music() {
  const { status, deviceId, state, position, playbackError, devices, activeDeviceId, playingOn, transferringTo, controls, authorize } =
    useSpotifyPlayer();

  // Spotify Connect: the account's other devices, so the music can be handed to
  // a speaker and still be driven from here.
  //
  // Deliberately not gated on the in-tab player being ready. That player needs
  // Premium and browser DRM, and when it can't start — the exact case where you
  // most want a speaker — the account's other devices still work perfectly.
  useEffect(() => {
    if (status === 'needs-auth') return undefined;
    controls.refreshDevices();
    const id = window.setInterval(() => controls.refreshDevices(), 20_000);
    return () => window.clearInterval(id);
  }, [status, controls]);
  const [playlists, setPlaylists] = useState(() => peek('music:playlists')?.playlists ?? []);
  const [recent, setRecent] = useState(() => peek('music:recent')?.tracks ?? []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);

  // Seeded from the launch preload above, so this refresh is invisible: the
  // shelves are already populated when the view first paints.
  useEffect(() => {
    if (status !== 'ready') return;
    api.music
      .playlists()
      .then((d) => {
        put('music:playlists', d);
        setPlaylists(d.playlists ?? []);
      })
      .catch(() => {});
    api.music
      .recentlyPlayed()
      .then((d) => {
        put('music:recent', d);
        setRecent(d.tracks ?? []);
      })
      .catch(() => {});
  }, [status]);

  // Tint the player card with the artwork's own colours — the same palette the
  // immersive view uses, so stepping into it feels like the same room.
  useEffect(() => {
    let alive = true;
    albumPalette(state?.image).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [state?.image]);

  // While Music is in front and something is playing, the sky behind the whole
  // dashboard takes the sleeve's colours — deepened, so the panes still read —
  // and hands them back to the hour when you leave or the music stops.
  useEffect(() => {
    if (!state?.track || palette === DEFAULT_PALETTE) {
      setSkyOverride(null);
      return undefined;
    }
    const deepen = (rgb, f) => rgba(rgb.map((v) => Math.round(v * f)), 1);
    setSkyOverride({
      a: deepen(palette.base, 0.34),
      b: deepen(palette.accent, 0.62),
      c: deepen(palette.glow, 0.48),
      accent: rgba(palette.glow, 1),
      stars: 0,
    });
    return () => setSkyOverride(null);
  }, [palette, state?.track]);

  // Debounced catalogue search across all of Spotify (deduped server-side).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const id = setTimeout(() => {
      api.music
        .search(q)
        .then((d) => setResults(d.tracks ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const isSearch = query.trim().length > 0;
  const shown = isSearch ? results : recent;
  // Both lists show only whole rows, so nothing is left cut off at the foot.
  const playlistRows = useWholeRows(playlists.length);
  const trackRows = useWholeRows(shown.length);

  // ── Gated states ────────────────────────────────────────────────
  if (status === 'needs-auth') {
    return (
      <ConnectScreen
        title="Connect Spotify"
        body="Link your Spotify account to play music right here in Pulse OS."
        action={
          <button
            type="button"
            onClick={authorize}
            className="orb-button mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-moon transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Connect Spotify
          </button>
        }
      />
    );
  }

  if (status === 'not-premium') {
    return (
      <ConnectScreen
        title="Premium required"
        body="In-tab playback uses Spotify's Web Playback SDK, which needs a Premium account. Your playlists and recent tracks still show, but streaming here is disabled."
      />
    );
  }

  const paused = state?.paused ?? true;
  const durationMs = state?.durationMs ?? 0;
  const progress = durationMs ? Math.min(position / durationMs, 1) : 0;
  const hasTrack = Boolean(state?.track);

  const whereLine = playingOn
    ? `Playing on ${playingOn}`
    : status === 'ready' && deviceId
      ? 'Playing on this device'
      : status === 'needs-auth'
        ? 'Connect Spotify to start'
        : // A failed handshake is a final state, not a slow one: this browser
          // can't play in-tab (no Premium, or no DRM support). Spotify Connect
          // still works, so point at that instead of a message that never resolves.
          status === 'error'
          ? devices.length
            ? 'Pick a device to play on'
            : 'In-app playback unavailable'
          : 'Connecting to Spotify…';

  return (
    <div className="flex h-full flex-col">
      {/* ── Sky: what's playing, as big as the room ───────────────────────── */}
      <SkyZone className="relative flex items-end gap-10">
        <div
          className="breathe pointer-events-none absolute -left-24 -top-24 h-[34rem] w-[34rem] rounded-full transition-[background] duration-1000"
          style={{
            background: `radial-gradient(circle, ${rgba(palette.glow, 0.22)} 0%, ${rgba(palette.accent, 0.1)} 42%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={() => hasTrack && setImmersive(true)}
          disabled={!hasTrack}
          aria-label="Open immersive player"
          title={hasTrack ? 'Open immersive player' : undefined}
          className="group relative shrink-0 rounded-[1.75rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default"
        >
          <div className="lift relative h-[16.5rem] w-[16.5rem] overflow-hidden rounded-[1.75rem] bg-white/[0.06] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.85)] ring-1 ring-white/12">
            {state?.image ? (
              <img
                src={state.image}
                alt=""
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-white/[0.12] via-transparent to-accent/10">
                <Music2 className="h-14 w-14 text-moon/35" strokeWidth={1.2} aria-hidden="true" />
              </div>
            )}
            {hasTrack ? (
              <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                <Expand className="h-6 w-6 text-moon" aria-hidden="true" />
              </span>
            ) : null}
          </div>
        </button>

        <div className="relative min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-3">
            <p className="t-label">{hasTrack && !paused ? 'Now playing' : hasTrack ? 'Paused' : 'Nothing playing'}</p>
            {hasTrack && !paused ? <Equaliser color={rgba(palette.glow, 0.9)} /> : null}
            <span className="t-meta truncate">{whereLine}</span>
          </div>
          <h1 className="t-hero mt-2 line-clamp-2 text-[3.5rem]">{state?.track || 'Pick something to play'}</h1>
          <p className="t-lede mt-2 truncate text-[1.25rem]">
            {playbackError || state?.artists || 'A playlist below, or search for anything'}
          </p>

          <div className="mt-6 flex items-center gap-4">
            <span className="clock-figures w-10 shrink-0 text-right text-[0.8125rem] text-dim">{fmt(position)}</span>
            <button
              type="button"
              aria-label="Seek"
              onClick={(e) => {
                if (!durationMs) return;
                const rect = e.currentTarget.getBoundingClientRect();
                controls.seek(Math.round(((e.clientX - rect.left) / rect.width) * durationMs));
              }}
              className="group/seek relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/[0.1]"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${progress * 100}%`, background: rgba(palette.glow, 0.95) }}
              />
              <span
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-moon shadow-[0_0_0_4px_rgba(10,13,28,0.35)] transition-transform group-hover/seek:scale-110"
                style={{ left: `${progress * 100}%` }}
              />
            </button>
            <span className="clock-figures w-10 shrink-0 text-[0.8125rem] text-dim">{fmt(durationMs)}</span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={controls.previous} aria-label="Previous track" className="pill h-11 w-11 px-0">
              <SkipBack className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            </button>
            <button type="button" onClick={controls.toggle} aria-label={paused ? 'Play' : 'Pause'} className="pill pill-lit h-14 w-14 px-0">
              {paused ? (
                <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />
              ) : (
                <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" />
              )}
            </button>
            <button type="button" onClick={controls.next} aria-label="Next track" className="pill h-11 w-11 px-0">
              <SkipForward className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            </button>

            <div className="ml-auto flex items-center gap-2">
              <DeviceButton
                devices={devices}
                activeId={activeDeviceId}
                thisTabId={deviceId}
                playingOn={playingOn}
                pendingId={transferringTo}
                onPick={(id) => controls.transferTo(id)}
              />
              <button
                type="button"
                onClick={() => setImmersive(true)}
                disabled={!hasTrack}
                aria-label="Immersive view"
                title="Immersive view"
                className="pill h-11 w-11 px-0 disabled:opacity-35"
              >
                <Expand className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </SkyZone>

      {/* ── Ground: your playlists, and what you've been playing ─────────── */}
      <Ground className="grid grid-cols-[1.45fr_1fr]">
        <Column label="Your playlists" className="pr-8 pt-7">
          {playlists.length === 0 ? (
            <p className="mt-2 text-[0.9375rem] text-dim">{status === 'ready' ? 'No playlists found' : 'Loading playlists…'}</p>
          ) : (
            <div ref={playlistRows.frameRef} className="h-full">
              <div
                ref={playlistRows.listRef}
                style={{ height: playlistRows.height }}
                className="whole-rows glass-scroll cascade grid scroll-pt-2 grid-cols-5 content-start gap-x-4 gap-y-5 overflow-y-auto pr-2 pt-2"
              >
                {playlists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => controls.playContext({ contextUri: list.uri })}
                    aria-label={`Play ${list.name}`}
                    className="group/list min-w-0 text-left focus:outline-none"
                  >
                    <span className="relative block aspect-square overflow-hidden rounded-[1rem] bg-white/[0.06] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/10 transition-transform duration-500 group-hover/list:-translate-y-1 group-focus-visible/list:ring-2 group-focus-visible/list:ring-accent/60">
                      {list.image ? (
                        <img
                          src={list.image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-700 group-hover/list:scale-105"
                        />
                      ) : (
                        <ListMusic className="absolute inset-0 m-auto h-8 w-8 text-moon/30" aria-hidden="true" />
                      )}
                      <span className="absolute bottom-2 right-2 grid h-9 w-9 translate-y-1 place-items-center rounded-full bg-moon text-ink opacity-0 shadow-lg transition-all duration-300 group-hover/list:translate-y-0 group-hover/list:opacity-100">
                        <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="t-body mt-2 block truncate">{list.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Column>

        <Column
          label={isSearch ? 'Search results' : 'Recently played'}
          action={<span className="clock-figures text-[0.8125rem] text-dim">{searching ? '···' : shown.length}</span>}
          className="ground-rule pl-8 pt-7"
          bodyClassName="flex min-h-0 flex-col"
        >
          <div className="relative mt-1 shrink-0">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-moon/40" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all of Spotify"
              className="h-10 w-full rounded-full bg-white/[0.06] pl-11 pr-10 text-[0.9375rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] placeholder:text-moon/40 focus:outline-none focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
            />
            {isSearch ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-moon/45 transition hover:bg-white/10 hover:text-moon focus:outline-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div ref={trackRows.frameRef} className="mt-3 min-h-0 flex-1">
            <div
              ref={trackRows.listRef}
              style={{ height: trackRows.height }}
              className="whole-rows glass-scroll cascade overflow-y-auto pr-1"
            >
              {shown.map((track, index) => {
                const isCurrent = state?.track === track.track;
                return (
                  <button
                    key={`${track.uri}-${index}`}
                    type="button"
                    onClick={() => controls.playContext({ uris: [track.uri] })}
                    className={[
                      'group/row flex w-full items-center gap-3 rounded-[0.9rem] p-2 text-left transition-colors',
                      isCurrent ? 'bg-white/[0.08]' : 'hover:bg-white/[0.045]',
                    ].join(' ')}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[0.6rem] bg-white/[0.06]">
                      {track.image ? (
                        <img src={track.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Music2 className="absolute inset-0 m-auto h-4 w-4 text-moon/30" aria-hidden="true" />
                      )}
                      <span
                        className={[
                          'absolute inset-0 grid place-items-center bg-black/50 transition-opacity',
                          isCurrent ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
                        ].join(' ')}
                      >
                        {isCurrent && !paused ? (
                          <Equaliser color={rgba(palette.glow, 0.95)} />
                        ) : (
                          <Play className="ml-0.5 h-3.5 w-3.5 text-moon" fill="currentColor" aria-hidden="true" />
                        )}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={['block truncate text-[0.9375rem]', isCurrent ? 'text-accent' : 'text-moon/90'].join(' ')}>
                        {track.track}
                      </span>
                      <span className="block truncate text-[0.8125rem] text-dim">{artistsOf(track)}</span>
                    </span>
                    <span className="clock-figures shrink-0 text-[0.8125rem] text-dim">{fmt(track.durationMs)}</span>
                  </button>
                );
              })}
              {shown.length === 0 && (
                <p className="px-2 py-3 text-[0.9375rem] text-dim">
                  {isSearch ? (searching ? 'Searching…' : 'No tracks found') : 'No recent tracks yet.'}
                </p>
              )}
            </div>
          </div>
        </Column>
      </Ground>

      {immersive && <MusicImmersive onClose={() => setImmersive(false)} />}
    </div>
  );
}

/** Three little bars keeping time — the universal "this one is playing" mark. */
function Equaliser({ color = 'currentColor' }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="eq-bar w-[2px] rounded-full"
          style={{ background: color, animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function ConnectScreen({ title, body, action }) {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader lead="Music" subtitle="Spotify" />
      <div className="my-auto flex flex-1 items-center justify-center">
        <GlassCard tone="cyan" className="max-w-md text-center">
          <div className="glow-ring mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/8">
            <Music2 className="h-7 w-7 text-accent" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="display-type text-2xl font-light text-moon text-glow">{title}</h2>
          <p className="mt-2 text-sm font-light leading-relaxed text-moon/58">{body}</p>
          {action}
        </GlassCard>
      </div>
    </div>
  );
}
