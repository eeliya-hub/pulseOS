import { FastForward, ListMusic, Music2, Pause, Play, Rewind, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import GlassCard from '../components/GlassCard.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';
import { api } from '../services/api/backendClient.js';

const fmt = (ms) => {
  if (ms == null) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Music() {
  const { status, state, position, controls, authorize } = useSpotifyPlayer();
  const [playlists, setPlaylists] = useState([]);
  const [recent, setRecent] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (status !== 'ready') return;
    api.music.playlists().then((d) => setPlaylists(d.playlists ?? [])).catch(() => {});
    api.music.recentlyPlayed().then((d) => setRecent(d.tracks ?? [])).catch(() => {});
  }, [status]);

  // Debounced catalogue search across all of Spotify.
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

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        lead="Your"
        accent="Music"
        subtitle={status === 'ready' ? 'Playing on this device' : 'Connecting to Spotify…'}
      />

      <div className="my-auto grid max-h-[24rem] min-h-0 w-full flex-1 grid-cols-[43rem_1fr] grid-rows-[15.75rem_7.25rem] gap-4">
        {/* Player */}
        <GlassCard
          tone="cyan"
          className="group relative col-start-1 row-start-1 flex min-w-0 items-center overflow-hidden !shadow-none"
        >
          <div
            className="breathe pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(116,242,255,0.12) 0%, rgba(140,120,220,0.07) 45%, transparent 70%)',
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex w-full items-center justify-center gap-7 px-2">
            <div className="relative shrink-0">
              <div
                className="breathe absolute -inset-4 rounded-[2rem]"
                style={{ background: 'radial-gradient(circle, rgba(116,242,255,0.16), transparent 70%)' }}
                aria-hidden="true"
              />
              <div className="theme-card glow-ring relative h-28 w-28 overflow-hidden rounded-[1.5rem]">
                {state?.image ? (
                  <img src={state.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-cyan-100/12" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Music2 className="h-9 w-9 text-white/45" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="min-w-0 max-w-2xl flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/42">
                Now playing
              </p>
              <h1 className="display-type mt-1 truncate text-3xl font-extralight tracking-wide text-white text-glow">
                {state?.track || 'Nothing playing'}
              </h1>
              <p className="mt-1 truncate text-sm font-light text-white/58">
                {state?.artists || 'Pick a playlist or track to start'}
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
                    className="glow-dot absolute left-0 top-0 h-1 rounded-full bg-cyan-100 text-cyan-100"
                    style={{ width: `${progress * 100}%` }}
                  />
                  <div
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                    style={{ left: `${progress * 100}%` }}
                  />
                </button>
                <div className="mt-1.5 flex justify-between text-[10px] font-medium text-white/42">
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
                  <Rewind className="h-5 w-5" aria-hidden="true" />
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
                  <FastForward className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Recently played + search */}
        <GlassCard
          tone="purple"
          className="col-start-2 row-start-1 row-span-2 flex min-h-0 flex-col overflow-hidden !shadow-none"
        >
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all of Spotify"
              className="w-full rounded-full bg-white/6 py-2.5 pl-9 pr-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/40"
            />
          </div>

          <div className="mb-1 mt-3 flex shrink-0 items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
              {isSearch ? 'Search results' : 'Recently played'}
            </p>
            <span className="clock-figures text-[11px] font-medium text-white/40">{shown.length}</span>
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
                    'flex w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition',
                    isCurrent ? 'bg-white/10' : 'hover:bg-white/6',
                  ].join(' ')}
                >
                  <span className="flex w-4 shrink-0 items-center justify-center">
                    {isCurrent ? (
                      <span className="glow-dot h-1.5 w-1.5 rounded-full bg-cyan-200 text-cyan-200" aria-hidden="true" />
                    ) : (
                      <span className="clock-figures text-[11px] text-white/35">{index + 1}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={['truncate text-sm font-medium', isCurrent ? 'text-cyan-100' : 'text-white/85'].join(' ')}>
                      {track.track}
                    </p>
                    <p className="truncate text-xs text-white/45">{track.artists}</p>
                  </div>
                  <span className="clock-figures shrink-0 text-[11px] text-white/40">{fmt(track.durationMs)}</span>
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

        {/* Playlists */}
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
                className="group relative h-28 w-40 shrink-0 overflow-hidden !shadow-none"
              >
                {list.image ? (
                  <img src={list.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/18 to-purple-200/10" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                <button
                  type="button"
                  onClick={() => controls.playContext({ contextUri: list.uri })}
                  className="absolute inset-0 flex items-end justify-between p-3.5 text-left focus:outline-none"
                  aria-label={`Play ${list.name}`}
                >
                  <h4 className="display-type flex items-center gap-1.5 pr-2 text-sm font-normal leading-tight text-white group-hover:text-glow">
                    <ListMusic className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden="true" />
                    <span className="line-clamp-2">{list.name}</span>
                  </h4>
                  <span className="glow-ring flex h-8 w-8 shrink-0 translate-y-2 items-center justify-center rounded-full bg-white/10 opacity-0 backdrop-blur-md transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    <Play className="ml-0.5 h-3 w-3" fill="white" aria-hidden="true" />
                  </span>
                </button>
              </GlassCard>
            ))
          )}
        </div>
      </div>
    </div>
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
