import { Minimize2, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { activeLineIndex, useLyrics } from '../hooks/useLyrics.js';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';
import { albumPalette, DEFAULT_PALETTE, rgba } from '../services/music/albumPalette.js';
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

/**
 * Full-screen player: the song drawn as a horizon.
 *
 * The rest of Pulse OS is built as sky, horizon and ground; this is that idea
 * with the lights turned all the way up. The horizon IS the track — the rule
 * runs the width of the screen, the part you have heard is lit, and every line
 * of the lyric is a tick standing on it, so the shape of the song is visible
 * before you hear it: verses crowd together, an instrumental opens a gap. Click
 * anywhere along it to move.
 *
 * Above the line are the words, set in the display face because they are the
 * thing read from across the room. Below it is the record itself and the
 * controls. The light in the room is the sleeve's own colour and nothing else;
 * it does not listen to the audio, because this is somewhere to leave running,
 * not a meter to watch.
 */
/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {boolean} [props.afk] standing in for the screensaver: the clock takes
 *   the ground, the transport goes away, and a tap anywhere returns to Home
 * @param {Date} [props.now] ticking clock, supplied by the app shell
 */
export default function MusicImmersive({ onClose, afk = false, now }) {
  const { state, position, controls } = useSpotifyPlayer();
  const paused = state?.paused ?? true;
  const durationMs = state?.durationMs ?? 0;

  const palette = usePalette(state?.image);
  const lyrics = useLyrics(state?.track, state?.artists, durationMs);

  // The player reports position once a second. Interpolating that in React state
  // re-rendered this whole component 60x a second AND restarted the progress
  // bar's width transition every frame, which is what made the bar stutter and
  // lag behind. Position lives in a ref, and the horizon, the clock and the
  // lyric index are written straight to the DOM from the frame loop.
  const anchor = useRef({ at: performance.now(), pos: position });
  useEffect(() => {
    anchor.current = { at: performance.now(), pos: position };
  }, [position]);

  const activeLineRef = useRef(null);
  const litRef = useRef(null);
  const litTicksRef = useRef(null);
  const headRef = useRef(null);
  const elapsedRef = useRef(null);
  const fieldRef = useRef(null);
  const [lineIndex, setLineIndex] = useState(-1);
  const lineIndexRef = useRef(-1);

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

  const seekTo = useCallback((ms) => controls.seek(Math.max(0, Math.round(ms))), [controls]);

  useFrame((t) => {
    // Where we actually are in the track, interpolated between the player's
    // once-a-second updates.
    const { at, pos } = anchor.current;
    const here = paused ? pos : pos + (performance.now() - at);
    const clamped = durationMs ? Math.min(here, durationMs) : here;
    const pct = durationMs ? Math.min(100, (clamped / durationMs) * 100) : 0;

    // The horizon: one width and one offset. The lit ticks are the same row of
    // ticks as the dim ones, clipped to how far the song has got — one style
    // write a frame instead of one per tick.
    if (litRef.current) litRef.current.style.width = `${pct.toFixed(3)}%`;
    if (litTicksRef.current) litTicksRef.current.style.clipPath = `inset(0 ${(100 - pct).toFixed(3)}% 0 0)`;
    if (headRef.current) headRef.current.style.left = `${pct.toFixed(3)}%`;
    if (elapsedRef.current) elapsedRef.current.textContent = fmt(clamped);

    // Re-render only when the sung line actually changes — a few times a verse
    // instead of sixty times a second.
    const idx = lyrics.synced ? activeLineIndex(lyrics.lines, clamped + LYRIC_LEAD_MS) : -1;
    if (idx !== lineIndexRef.current) {
      lineIndexRef.current = idx;
      setLineIndex(idx);
    }

    // The one ambient motion in the room: the album's light leans, very slowly,
    // so a screen left on for an hour is never quite the same picture twice.
    // Transform only — a gradient that re-renders every frame is a repaint of
    // the whole screen.
    if (fieldRef.current) {
      fieldRef.current.style.transform =
        `translate3d(${(Math.sin(t * 0.021) * 2.2).toFixed(2)}%, ${(Math.cos(t * 0.016) * 1.4).toFixed(2)}%, 0)`;
    }
  });

  const hasTrack = Boolean(state?.track);

  return createPortal(
    // onScroll: focusing a lyric line can also scroll this container; snapping
    // it back keeps the overlay from drifting off the bottom of the screen.
    <div
      data-settings=""
      className="immersive fixed inset-0 z-[80] overflow-hidden text-moon"
      style={{ '--lit': rgba(palette.glow, 1) }}
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      {/* The room, lit from where the record is. The sleeve is the sun, so the
          light in the gradient starts at the sleeve rather than in a corner. */}
      <div
        ref={fieldRef}
        aria-hidden="true"
        className="immersive-field"
        style={{
          // A sunset reads from the sun outward: the sky around and above it
          // carries most of the light, the ground under it holds the rest.
          background:
            `radial-gradient(66% 82% at var(--sun-x) var(--sun-y), ${rgba(palette.base, 0.85)}, transparent 70%),` +
            `radial-gradient(84% 38% at var(--sun-x) 100%, ${rgba(palette.accent, 0.5)}, transparent 74%),` +
            `radial-gradient(96% 44% at 62% -8%, ${rgba(palette.glow, 0.22)}, transparent 72%)`,
        }}
      />

      {!afk ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit immersive mode"
          title="Exit (Esc)"
          className="pill absolute right-7 top-6 z-30 grid h-10 w-10 place-items-center px-0 text-moon/70 md:right-10"
        >
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}

      {/* ── Sky, left of the sun: the words ──────────────────────────── */}
      <Lyrics
        lyrics={lyrics}
        index={lineIndex}
        onSeek={seekTo}
        activeRef={activeLineRef}
        hasTrack={hasTrack}
      />

      {/* ── The horizon: the song itself, running behind the sleeve ──── */}
      <Horizon
        lines={lyrics.synced ? lyrics.lines : null}
        durationMs={durationMs}
        onSeek={seekTo}
        litRef={litRef}
        litTicksRef={litTicksRef}
        headRef={headRef}
      />

      {/* ── The sun: the record itself, half in the sky, half on the
             ground, sitting on the line it is being played along. ────── */}
      <Sleeve image={state?.image} track={state?.track} />

      {/* ── Ground, left of the sun ──────────────────────────────────── */}
      <footer className="immersive-ground">
        <h1 className="immersive-title truncate">{state?.track || 'Nothing playing'}</h1>
        <p className="t-meta mt-1 truncate">
          {state?.artists || 'Start something from your library'}
        </p>

        {afk ? (
          <div className="mt-5">
            <p className="display-figures text-[clamp(2.5rem,5vw,4rem)] leading-none text-moon">
              {formatClock(now)}
            </p>
            <p className="t-meta mt-1.5">{formatLongDate(now)}</p>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-5">
            <div className="flex shrink-0 items-center gap-2">
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
            </div>

            <p className="clock-figures text-[0.8125rem] text-moon/45">
              <span ref={elapsedRef}>{fmt(position)}</span>
              <span className="px-1.5 text-moon/25">/</span>
              <span>{fmt(durationMs)}</span>
            </p>
          </div>
        )}
      </footer>

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

/* ── Frame loop ──────────────────────────────────────────────────────────── */

/** Run `fn(seconds)` every animation frame. */
function useFrame(fn) {
  const cb = useRef(fn);
  cb.current = fn;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (stamp) => {
      raf = requestAnimationFrame(tick);
      cb.current((stamp - start) / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/* ── The horizon ─────────────────────────────────────────────────────────── */

/**
 * The track as a line you can read and move along.
 *
 * The rule spans the screen; the heard part is lit. Each sung line stands on it
 * as a tick, so the song's shape — where the verses are, where it opens up —
 * is there to see. The lit ticks are a second copy of the same row clipped to
 * the playhead, which keeps the per-frame work to two style writes however many
 * lines the song has.
 */
function Horizon({ lines, durationMs, onSeek, litRef, litTicksRef, headRef }) {
  // Positions change only when the track does.
  const ticks = useMemo(() => {
    if (!lines || !durationMs) return [];
    return lines
      .filter((l) => l.text && l.at != null)
      .map((l) => ({ at: l.at, pct: Math.min(100, (l.at / durationMs) * 100) }));
  }, [lines, durationMs]);

  const seekFromEvent = (e) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * durationMs);
  };

  const row = (lit) => (
    <div className={lit ? 'immersive-ticks immersive-ticks--lit' : 'immersive-ticks'} ref={lit ? litTicksRef : null}>
      {ticks.map((t, i) => (
        <span key={i} style={{ left: `${t.pct.toFixed(3)}%` }} />
      ))}
    </div>
  );

  return (
    <button
      type="button"
      aria-label="Seek within the track"
      onClick={seekFromEvent}
      className="immersive-horizon"
    >
      <div className="immersive-rule" aria-hidden="true">
        <div ref={litRef} className="immersive-rule-lit" />
      </div>
      {row(false)}
      {row(true)}
      <span ref={headRef} className="immersive-head" aria-hidden="true" />
    </button>
  );
}

/* ── The sleeve ──────────────────────────────────────────────────────────── */

/**
 * The record, set on the horizon like a sun: its centre on the line, half of it
 * in the sky and half standing on the ground. Square and hard-edged, with a
 * shadow that falls down the ground beneath it — it is an object in the room,
 * not a picture of one, so it gets no halo and no glow.
 */
function Sleeve({ image, track }) {
  return (
    <div className="immersive-sun">
      <div className="immersive-sun-face">
        {image ? (
          <img src={image} alt={`${track} album art`} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/5">
            <Music2 className="h-12 w-12 text-moon/25" strokeWidth={1.1} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Lyrics ──────────────────────────────────────────────────────────────── */

function Lyrics({ lyrics, index, onSeek, activeRef, hasTrack }) {
  const panelRef = useRef(null);
  // Keep the line being sung on the reading line.
  //
  // Scrolled by hand rather than with scrollIntoView: that scrolls EVERY
  // scrollable ancestor, and the full-screen portal counts as one (overflow
  // hidden is still programmatically scrollable). It was dragging the whole
  // overlay up ~22px, which showed as a hard-edged strip along the bottom.
  // Eased on a rAF rather than `behavior: 'smooth'`: the native one restarts
  // from scratch every time it's called, so on a fast verse each new line
  // cancelled the previous glide mid-flight — that was the stutter. This one
  // retargets, so the line already in motion keeps its momentum.
  const scrollRef = useRef({ raf: 0, target: 0 });
  useEffect(() => {
    const line = activeRef.current;
    const panel = panelRef.current;
    if (!line || !panel) return undefined;

    const offset = line.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    scrollRef.current.target = Math.max(0, panel.scrollTop + offset - (panel.clientHeight - line.offsetHeight) / 2);

    // Already gliding — the new target is picked up by the running loop.
    if (scrollRef.current.raf) return undefined;

    const step = () => {
      const distance = scrollRef.current.target - panel.scrollTop;
      // Ease out, but with a floor on the step so the last few pixels don't
      // crawl — a pure proportional ease takes as long to finish 2px as it does
      // the first 200, which reads as the line never quite settling.
      if (Math.abs(distance) < 1) {
        panel.scrollTop = scrollRef.current.target;
        scrollRef.current.raf = 0;
        return;
      }
      const stepSize = Math.max(1.5, Math.abs(distance) * 0.22) * Math.sign(distance);
      panel.scrollTop += Math.abs(stepSize) > Math.abs(distance) ? distance : stepSize;
      scrollRef.current.raf = requestAnimationFrame(step);
    };
    scrollRef.current.raf = requestAnimationFrame(step);

    return undefined;
  }, [index, activeRef]);

  useEffect(
    () => () => {
      if (scrollRef.current.raf) cancelAnimationFrame(scrollRef.current.raf);
    },
    [],
  );

  if (lyrics.status === 'loading') {
    return (
      <div className="immersive-words">
        <div className="w-full max-w-3xl space-y-5">
          {[0.82, 0.6, 0.72].map((w, i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded bg-white/[0.06]"
              style={{ width: `${w * 100}%`, animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (lyrics.status !== 'found') {
    return (
      <div className="immersive-words">
        <p className="immersive-line immersive-line--quiet max-w-2xl">
          {hasTrack ? 'No words for this one.' : 'Play something to fill the room.'}
        </p>
      </div>
    );
  }

  // Plain lyrics: no timings to sync to, so it reads as a column instead of a
  // stage — still the display face, still on the reading line.
  if (!lyrics.synced) {
    return (
      <div className="immersive-words">
        <div className="lyric-fade hide-scrollbar max-h-full overflow-y-auto">
          <p className="immersive-line immersive-line--near max-w-3xl whitespace-pre-line">{lyrics.plain}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="immersive-words">
      <div
        ref={panelRef}
        className="immersive-stage lyric-fade hide-scrollbar overflow-y-auto"
        aria-label="Lyrics"
      >
        <div className="py-[21vh]">
          {lyrics.lines.map((line, i) => {
            if (!line.text) return <div key={i} className="h-7" aria-hidden="true" />;
            const distance = Math.abs(i - index);
            return (
              <LyricLine
                key={i}
                lineRef={i === index ? activeRef : null}
                text={line.text}
                isActive={i === index}
                distance={Math.min(distance, 3)}
                at={line.at}
                onSeek={onSeek}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * One line. Memoised on its own tone, so moving to the next line re-renders the
 * few lines whose shade actually changed rather than every line in the song —
 * a long track was re-rendering a hundred buttons on every beat.
 *
 * The sung line is marked the way every column in the app marks its head: an
 * accent tick in the margin. No bloom — brightness and weight carry it.
 */
const LyricLine = memo(function LyricLine({ lineRef, text, isActive, distance, at, onSeek }) {
  return (
    <button
      ref={lineRef}
      type="button"
      onClick={() => onSeek(at)}
      title="Jump to this line"
      className={[
        'immersive-line',
        isActive
          ? 'immersive-line--on'
          : distance === 1
            ? 'immersive-line--near'
            : distance === 2
              ? 'immersive-line--far'
              : 'immersive-line--quiet',
      ].join(' ')}
    >
      {text}
    </button>
  );
});

/* ── Palette ─────────────────────────────────────────────────────────────── */

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
