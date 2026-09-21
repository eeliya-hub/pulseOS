import { Minimize2, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { activeLineIndex, useLyrics } from '../hooks/useLyrics.js';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';
import { api } from '../services/api/backendClient.js';
import { albumPalette, DEFAULT_PALETTE } from '../services/music/albumPalette.js';
import { createPulse, idlePulse } from '../services/music/pulse.js';
import { DEFAULT_VISUAL, rendererFor, VISUALS } from '../services/music/visuals/index.js';
import { formatClock, formatLongDate } from '../utils/dateTime.js';

const fmt = (ms) => {
  if (ms == null) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Lyrics are timed to when a line STARTS being sung; highlighting it a beat
// early reads as "on time" rather than a step behind. LRCLIB timings sit right
// on the vocal, and Spotify's reported position lags its own audio slightly, so
// the lead has to cover both — at 220ms it still read half a beat late.
const LYRIC_LEAD_MS = 400;

const CHROME_IDLE_MS = 2800;
const VISUAL_KEY = 'pulse.immersive.visual';

/**
 * The immersive player: one room, filled by whatever is playing.
 *
 * The screen is a visual — one of three, switchable — with the record at the
 * middle of it and the words underneath. There is no chrome until you move the
 * pointer, and none at all when it is standing in for the screensaver.
 *
 * Everything moves in time with the music without ever hearing it. See
 * `services/music/pulse.js`: the beat is rebuilt from the track's real tempo,
 * phase-located from the synced lyric onsets, and read off the playback clock.
 * That is steadier than a microphone, needs no permission, and works on
 * headphones.
 */
/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {boolean} [props.afk] standing in for the screensaver: no controls, a
 *   clock instead, and a tap anywhere returns to Home
 * @param {Date} [props.now] ticking clock, supplied by the app shell
 */
export default function MusicImmersive({ onClose, afk = false, now }) {
  const { state, position, controls } = useSpotifyPlayer();
  const paused = state?.paused ?? true;
  const durationMs = state?.durationMs ?? 0;
  const trackId = state?.id ?? null;

  const palette = usePalette(state?.image);
  const lyrics = useLyrics(state?.track, state?.artists, durationMs);
  const features = useTrackFeatures(trackId);

  const [visual, setVisual] = useState(
    () => (typeof localStorage !== 'undefined' && localStorage.getItem(VISUAL_KEY)) || DEFAULT_VISUAL,
  );
  const chooseVisual = useCallback((id) => {
    setVisual(id);
    try {
      localStorage.setItem(VISUAL_KEY, id);
    } catch {
      /* private window — the choice just won't be remembered */
    }
  }, []);

  // The player reports position once a second; everything that moves reads an
  // interpolated value out of this ref rather than re-rendering React.
  const anchor = useRef({ at: performance.now(), pos: position });
  useEffect(() => {
    anchor.current = { at: performance.now(), pos: position };
  }, [position]);

  // One driver per track. Rebuilt when the tempo or the lyric onsets change.
  const pulse = useMemo(() => {
    if (!state?.track) return idlePulse();
    return createPulse({ features, lines: lyrics.synced ? lyrics.lines : [] });
  }, [features, lyrics.synced, lyrics.lines, state?.track]);

  const canvasRef = useRef(null);
  const sleeveRef = useRef(null);
  const lineRef = useRef(null);
  const elapsedRef = useRef(null);
  const progressRef = useRef(null);
  const [lineIndex, setLineIndex] = useState(-1);
  const lineIndexRef = useRef(-1);

  // Chrome hides itself; moving the pointer brings it back.
  const [chrome, setChrome] = useState(true);
  useEffect(() => {
    if (afk) return undefined;
    let timer = 0;
    const wake = () => {
      setChrome(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChrome(false), CHROME_IDLE_MS);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [afk]);

  // Escape closes, space plays/pauses — expected of anything full-screen.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.code === 'Space' && !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) {
        e.preventDefault();
        controls.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls, onClose]);

  // ── The renderer, and the one loop that drives everything ──────────────
  const rendererRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const Renderer = rendererFor(visual);
    rendererRef.current = new Renderer(canvas);
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      rendererRef.current = null;
    };
  }, [visual]);

  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const syncedRef = useRef(lyrics);
  syncedRef.current = lyrics;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const start = last;

    const tick = (stamp) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (stamp - last) / 1000));
      last = stamp;

      // Where the track actually is, between the player's once-a-second reports.
      const { at, pos } = anchor.current;
      const here = pausedRef.current ? pos : pos + (stamp - at);
      const duration = durationRef.current;
      const clamped = duration ? Math.min(here, duration) : here;

      const p = pulseRef.current.sample(clamped, (stamp - start) / 1000);
      rendererRef.current?.draw(p, paletteRef.current, dt);

      // The record breathes on the beat — the only object on screen, so it is
      // where the pulse is easiest to read.
      if (sleeveRef.current) {
        const s = 1 + p.pulse * 0.028 * (0.4 + p.drive) + p.accent * 0.012;
        sleeveRef.current.style.transform = `scale(${s.toFixed(4)})`;
      }

      // Newsreader is a variable face, so the sung line can actually gain and
      // lose weight with the music rather than merely change opacity.
      if (lineRef.current) {
        const w = 360 + p.pulse * 120 * (0.3 + p.drive) + p.accent * 60;
        lineRef.current.style.fontVariationSettings = `"wght" ${Math.round(w)}`;
      }

      if (elapsedRef.current) elapsedRef.current.textContent = fmt(clamped);
      if (progressRef.current && duration) {
        progressRef.current.style.transform = `scaleX(${(clamped / duration).toFixed(4)})`;
      }

      const l = syncedRef.current;
      const idx = l.synced ? activeLineIndex(l.lines, clamped + LYRIC_LEAD_MS) : -1;
      if (idx !== lineIndexRef.current) {
        lineIndexRef.current = idx;
        setLineIndex(idx);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seekTo = useCallback((ms) => controls.seek(Math.max(0, Math.round(ms))), [controls]);
  const showChrome = chrome && !afk;

  return createPortal(
    <div
      data-settings=""
      className="immersive fixed inset-0 z-[80] overflow-hidden text-moon"
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {/* Enough shade for the words to sit on, and no more. */}
      <div className="immersive-veil" aria-hidden="true" />

      <div className="immersive-stack">
        <Sleeve innerRef={sleeveRef} image={state?.image} track={state?.track} />

        <p className="immersive-meta">
          {state?.track ? `${state.track} — ${state.artists}` : 'Nothing playing'}
        </p>

        <Words lyrics={lyrics} index={lineIndex} lineRef={lineRef} onSeek={seekTo} />

        {afk ? (
          <div className="immersive-clock">
            <p className="display-figures text-[clamp(3rem,7vw,5.5rem)] leading-none text-moon">
              {formatClock(now)}
            </p>
            <p className="t-meta mt-2">{formatLongDate(now)}</p>
          </div>
        ) : null}
      </div>

      {/* ── Chrome: away until you reach for it ──────────────────────── */}
      <div className={`immersive-chrome ${showChrome ? 'is-on' : ''}`}>
        <div className="immersive-chrome-top">
          <div className="pill-group" role="group" aria-label="Visual style">
            {VISUALS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => chooseVisual(v.id)}
                aria-pressed={visual === v.id}
                className="pill h-9 px-4 text-[0.8125rem]"
              >
                {v.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Exit immersive mode"
            title="Exit (Esc)"
            className="pill grid h-10 w-10 place-items-center px-0 text-moon/70"
          >
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="immersive-chrome-bottom">
          <button
            type="button"
            onClick={controls.previous}
            aria-label="Previous track"
            className="pill grid h-11 w-11 place-items-center px-0"
          >
            <SkipBack className="h-4 w-4" fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={controls.toggle}
            aria-label={paused ? 'Play' : 'Pause'}
            className="pill pill-lit grid h-14 w-14 place-items-center px-0"
          >
            {paused ? (
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true" />
            ) : (
              <Pause className="h-5 w-5" fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={controls.next}
            aria-label="Next track"
            className="pill grid h-11 w-11 place-items-center px-0"
          >
            <SkipForward className="h-4 w-4" fill="currentColor" aria-hidden="true" />
          </button>

          <p className="clock-figures ml-3 text-[0.8125rem] text-moon/50">
            <span ref={elapsedRef}>{fmt(position)}</span>
            <span className="px-1.5 text-moon/25">/</span>
            <span>{fmt(durationMs)}</span>
          </p>
        </div>

        {/* How far through, at the very edge of the screen. */}
        <button
          type="button"
          aria-label="Seek within the track"
          className="immersive-progress"
          onClick={(e) => {
            if (!durationMs) return;
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo(((e.clientX - rect.left) / rect.width) * durationMs);
          }}
        >
          <span ref={progressRef} aria-hidden="true" />
        </button>
      </div>

      {/* Standing in for the screensaver, the whole screen is the way back —
          one transparent target over everything, so a stray tap can't seek a
          lyric or hit a transport control on the way out. */}
      {afk ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to home"
          className="absolute inset-0 z-40 cursor-default focus:outline-none"
        />
      ) : null}
    </div>,
    document.body,
  );
}

/* ── The record ──────────────────────────────────────────────────────────── */

function Sleeve({ innerRef, image, track }) {
  return (
    <div className="immersive-sleeve">
      <div ref={innerRef} className="immersive-sleeve-face">
        {image ? (
          <img src={image} alt={`${track} album art`} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/5">
            <Music2 className="h-10 w-10 text-moon/25" strokeWidth={1.1} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── The words ───────────────────────────────────────────────────────────── */

/**
 * Three lines: the one before, the one being sung, and the one coming. A
 * scrolling column would be a list to read; this is a stage, and it keeps the
 * middle of the screen for the visual.
 */
function Words({ lyrics, index, lineRef, onSeek }) {
  if (lyrics.status === 'loading') {
    return <div className="immersive-words" aria-hidden="true" />;
  }

  if (lyrics.status !== 'found' || !lyrics.synced || index < 0) {
    return (
      <div className="immersive-words">
        <p className="immersive-line immersive-line--near">
          {lyrics.status === 'found' && !lyrics.synced
            ? 'No timings for this one.'
            : lyrics.status === 'none'
              ? 'No words for this one.'
              : ' '}
        </p>
      </div>
    );
  }

  const at = (i) => (i >= 0 && i < lyrics.lines.length ? lyrics.lines[i] : null);
  const previous = at(index - 1);
  const current = at(index);
  const next = at(index + 1);

  return (
    <div className="immersive-words" aria-label="Lyrics">
      <p className="immersive-line immersive-line--off">{previous?.text || ' '}</p>
      <button
        ref={lineRef}
        type="button"
        onClick={() => current?.at != null && onSeek(current.at)}
        title="Jump to this line"
        className="immersive-line immersive-line--on"
      >
        {current?.text || ' '}
      </button>
      <p className="immersive-line immersive-line--off">{next?.text || ' '}</p>
    </div>
  );
}

/* ── Track data ──────────────────────────────────────────────────────────── */

function usePalette(image) {
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  useEffect(() => {
    let alive = true;
    albumPalette(image).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [image]);
  return palette;
}

/**
 * Tempo, energy and the rest for the current track — cached per track, because
 * the visuals ask for it the moment a record starts and it never changes.
 */
const featureCache = new Map();

function useTrackFeatures(trackId) {
  const [features, setFeatures] = useState(null);

  useEffect(() => {
    if (!trackId) {
      setFeatures(null);
      return undefined;
    }
    if (featureCache.has(trackId)) {
      setFeatures(featureCache.get(trackId));
      return undefined;
    }

    let alive = true;
    api.music
      .features(trackId)
      .then((data) => {
        featureCache.set(trackId, data);
        if (alive) setFeatures(data);
      })
      // A track nobody has measured just means the tempo is estimated from the
      // lyric onsets instead; it is not worth breaking the view over.
      .catch(() => alive && setFeatures(null));

    return () => {
      alive = false;
    };
  }, [trackId]);

  return features;
}
