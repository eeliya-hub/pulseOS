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
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';
import { api } from '../services/api/backendClient.js';
import { albumPalette, DEFAULT_PALETTE, rgba } from '../services/music/albumPalette.js';
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
          'soft-button grid h-8 w-8 place-items-center rounded-full transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          // Tinted while the music is somewhere else, so it reads at a glance.
          playingOn ? 'text-cyan-200' : 'text-white/80',
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
          <div className="absolute bottom-full right-0 z-50 mb-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#141a2e]/95 p-1 shadow-xl backdrop-blur-xl">
            <p className="px-2.5 py-1.5 text-[0.5625rem] font-semibold uppercase tracking-[0.16em] text-white/32">
              Play on
            </p>
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
                    on ? 'bg-cyan-200/12 text-cyan-50' : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                    pending ? 'cursor-default' : '',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{d.name}</span>
                  {pending ? (
                    <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-cyan-200/80" aria-hidden="true" />
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
            className="orb-button mt-5 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        lead="Your"
        accent="Music"
        subtitle={
          playingOn
            ? `Playing on ${playingOn}`
            : status === 'ready' && deviceId
              ? 'Playing on this device'
              : status === 'needs-auth'
                ? 'Connect Spotify to start'
                : // A failed handshake is a final state, not a slow one: this
                  // browser can't play in-tab (no Premium, or no DRM support).
                  // Spotify Connect still works, so point at that instead of
                  // showing a spinner message that will never resolve.
                  status === 'error'
                  ? devices.length
                    ? 'Pick a device to play on'
                    : 'In-app playback unavailable'
                  : 'Connecting to Spotify…'
        }
      />



      <div className="my-auto grid max-h-[24rem] min-h-0 w-full flex-1 grid-cols-[43rem_1fr] grid-rows-[15.75rem_7.25rem] gap-4">
        {/* ── Now playing ─────────────────────────────────────────── */}
        <GlassCard
          tone="cyan"
          className="group relative col-start-1 row-start-1 flex min-w-0 items-center overflow-hidden !shadow-none"
        >
          <div
            className="breathe pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full transition-[background] duration-1000"
            style={{
              background: `radial-gradient(circle, ${rgba(palette.glow, 0.16)} 0%, ${rgba(palette.accent, 0.09)} 45%, transparent 70%)`,
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex w-full items-center gap-7 px-2">
            <button
              type="button"
              onClick={() => hasTrack && setImmersive(true)}
              disabled={!hasTrack}
              aria-label="Open immersive player"
              title={hasTrack ? 'Open immersive player' : undefined}
              className="relative shrink-0 rounded-[1.5rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-default"
            >
              <div
                className="breathe absolute -inset-4 rounded-[2rem] transition-[background] duration-1000"
                style={{ background: `radial-gradient(circle, ${rgba(palette.glow, 0.2)}, transparent 70%)` }}
                aria-hidden="true"
              />
              <div className="theme-card glow-ring relative h-32 w-32 overflow-hidden rounded-[1.5rem]">
                {state?.image ? (
                  <img
                    src={state.image}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-cyan-100/12" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Music2 className="h-9 w-9 text-white/45" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                  </>
                )}
                {hasTrack ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
                    <Expand className="h-5 w-5 text-white" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-white/42">
                  {hasTrack && !paused ? 'Now playing' : hasTrack ? 'Paused' : 'Now playing'}
                </p>
                {hasTrack && !paused ? <Equaliser color={rgba(palette.glow, 0.9)} /> : null}
              </div>
              <h1 className="display-type mt-1 truncate text-3xl font-extralight tracking-wide text-white text-glow">
                {state?.track || 'Nothing playing'}
              </h1>
              <p className="mt-1 truncate text-sm font-light text-white/58">
                {playbackError || state?.artists || 'Pick a playlist or track to start'}
              </p>

              <div className="mt-4">
                <button
                  type="button"
                  aria-label="Seek"
                  onClick={(e) => {
                    if (!durationMs) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    controls.seek(Math.round(((e.clientX - rect.left) / rect.width) * durationMs));
                  }}
                  className="relative block h-1 w-full cursor-pointer rounded-full bg-white/10"
                >
                  <div
                    className="glow-dot absolute left-0 top-0 h-1 rounded-full"
                    style={{ width: `${progress * 100}%`, background: rgba(palette.glow, 0.95), color: rgba(palette.glow, 1) }}
                  />
                  <div
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                    style={{ left: `${progress * 100}%` }}
                  />
                </button>
                <div className="mt-1.5 flex justify-between text-[0.625rem] font-medium text-white/42">
                  <span className="clock-figures">{fmt(position)}</span>
                  <span className="clock-figures">{fmt(durationMs)}</span>
                </div>
              </div>

              <div className="mt-3.5 flex items-center gap-5">
                <button
                  type="button"
                  onClick={controls.previous}
                  aria-label="Previous track"
                  className="text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <SkipBack className="h-5 w-5" fill="currentColor" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={controls.toggle}
                  aria-label={paused ? 'Play' : 'Pause'}
                  className="orb-button flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {paused ? (
                    <Play className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={controls.next}
                  aria-label="Next track"
                  className="text-white/55 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <SkipForward className="h-5 w-5" fill="currentColor" aria-hidden="true" />
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
                    className="soft-button grid h-8 w-8 place-items-center rounded-full text-white/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35"
                  >
                    <Expand className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* ── Search + list ───────────────────────────────────────── */}
        <GlassCard
          tone="purple"
          className="col-start-2 row-start-1 row-span-2 flex min-h-0 flex-col overflow-hidden !shadow-none"
        >
          <div className="relative shrink-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all of Spotify"
              className="w-full rounded-full bg-white/6 py-2.5 pl-9 pr-9 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/40"
            />
            {isSearch ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white focus:outline-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="mb-1 mt-3 flex shrink-0 items-center justify-between px-1">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
              {isSearch ? 'Search results' : 'Recently played'}
            </p>
            <span className="clock-figures text-[0.6875rem] font-medium text-white/40">
              {searching ? '···' : shown.length}
            </span>
          </div>

          <div className="glass-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {shown.map((track, index) => {
              const isCurrent = state?.track === track.track;
              return (
                <button
                  key={`${track.uri}-${index}`}
                  type="button"
                  onClick={() => controls.playContext({ uris: [track.uri] })}
                  className={[
                    'group/row flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition',
                    isCurrent ? 'bg-white/10' : 'hover:bg-white/6',
                  ].join(' ')}
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white/8">
                    {track.image ? (
                      <img src={track.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Music2 className="absolute inset-0 m-auto h-4 w-4 text-white/30" aria-hidden="true" />
                    )}
                    <span
                      className={[
                        'absolute inset-0 grid place-items-center bg-black/50 transition-opacity',
                        isCurrent ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
                      ].join(' ')}
                    >
                      {isCurrent && !paused ? (
                        <Equaliser color="rgb(190,245,255)" />
                      ) : (
                        <Play className="ml-0.5 h-3 w-3 text-white" fill="currentColor" aria-hidden="true" />
                      )}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'truncate text-sm font-medium',
                        isCurrent ? 'text-cyan-100' : 'text-white/85',
                      ].join(' ')}
                    >
                      {track.track}
                    </p>
                    <p className="truncate text-xs text-white/45">{artistsOf(track)}</p>
                  </div>
                  <span className="clock-figures shrink-0 text-[0.6875rem] text-white/40">{fmt(track.durationMs)}</span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="px-2.5 py-3 text-xs text-white/40">
                {isSearch ? (searching ? 'Searching…' : 'No tracks found') : 'No recent tracks yet.'}
              </p>
            )}
          </div>
        </GlassCard>

        {/* ── Playlists ───────────────────────────────────────────── */}
        <div className="hide-scrollbar col-start-1 row-start-2 flex min-w-0 gap-3 overflow-x-auto pt-1">
          {playlists.length === 0 ? (
            <div className="flex h-28 w-full items-center justify-center rounded-2xl border border-dashed border-white/12 text-xs text-white/35">
              {status === 'ready' ? 'No playlists found' : 'Loading playlists…'}
            </div>
          ) : (
            playlists.map((list, index) => (
              <GlassCard
                key={list.id}
                delay={140 + index * 60}
                noPadding
                hover
                className="group/list relative h-28 w-40 shrink-0 overflow-hidden !shadow-none"
              >
                {list.image ? (
                  <img
                    src={list.image}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition-all duration-500 group-hover/list:scale-105 group-hover/list:opacity-90"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/18 to-purple-200/10" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <button
                  type="button"
                  onClick={() => controls.playContext({ contextUri: list.uri })}
                  className="absolute inset-0 flex items-end justify-between p-3.5 text-left focus:outline-none"
                  aria-label={`Play ${list.name}`}
                >
                  <h4 className="display-type flex items-center gap-1.5 pr-2 text-sm font-normal leading-tight text-white group-hover/list:text-glow">
                    <ListMusic className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden="true" />
                    <span className="line-clamp-2">{list.name}</span>
                  </h4>
                  <span className="glow-ring flex h-8 w-8 shrink-0 translate-y-2 items-center justify-center rounded-full bg-white/10 opacity-0 backdrop-blur-md transition-all group-hover/list:translate-y-0 group-hover/list:opacity-100">
                    <Play className="ml-0.5 h-3 w-3" fill="white" aria-hidden="true" />
                  </span>
                </button>
              </GlassCard>
            ))
          )}
        </div>
      </div>

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
      <ViewHeader lead="Your" accent="Music" subtitle="Spotify" />
      <div className="my-auto flex flex-1 items-center justify-center">
        <GlassCard tone="cyan" className="max-w-md text-center">
          <div className="glow-ring mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/8">
            <Music2 className="h-7 w-7 text-cyan-100" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2 className="display-type text-2xl font-light text-white text-glow">{title}</h2>
          <p className="mt-2 text-sm font-light leading-relaxed text-white/58">{body}</p>
          {action}
        </GlassCard>
      </div>
    </div>
  );
}
