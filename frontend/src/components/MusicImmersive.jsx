import { Minimize2, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { activeLineIndex, useLyrics } from '../hooks/useLyrics.js';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';
import { albumPalette, DEFAULT_PALETTE, rgba } from '../services/music/albumPalette.js';
import { formatClock, formatLongDate } from '../utils/dateTime.js';
import { scene, SceneRenderer, stepScene } from '../services/music/scene/index.js';

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
 * Full-screen immersive player: the artwork's own colours washed across the
 * screen, time-synced lyrics you can tap to seek, and a room that drifts.
 *
 * The atmosphere deliberately does NOT react to the audio. It's an environment
 * to leave up, not a meter to watch: pools of light drift on their own slow
 * orbits and the album's colours cross-fade when the track changes, and that's
 * the whole of it. No microphone, no beat detection, no controls to tune —
 * nothing to configure and nothing to go out of sync.
 */
/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {boolean} [props.afk] standing in for the screensaver: the clock takes
 *   over the header and a tap anywhere returns to Home
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
  // lag behind. Position now lives in a ref, and the bar, the clock and the
  // lyric index are written straight to the DOM from the shared frame loop.
  const anchor = useRef({ at: performance.now(), pos: position });
  useEffect(() => {
    anchor.current = { at: performance.now(), pos: position };
  }, [position]);



  const fillRef = useRef(null);
  const knobRef = useRef(null);
  const elapsedRef = useRef(null);
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

  // Light that lives outside the canvas: the artwork's halo and the colour wash
  // breathe on the same slow clock as the scene, so the DOM and the canvas drift
  // together. Written straight to the DOM — a React render per frame would be
  // far too expensive for something this small.
  const haloRef = useRef(null);
  const washRef = useRef(null);
  const backdropRef = useRef(null);
  const shineRef = useRef(null);
  const contentRef = useRef(null);
  const rootRef = useRef(null);
  const sparkRef = useRef(null);
  const artworkRef = useRef(palette.glow);
  artworkRef.current = palette.glow;

  useSceneFrame(artworkRef, () => {
    // Where we actually are in the track, interpolated between the player's
    // once-a-second updates.
    const { at, pos } = anchor.current;
    const here = paused ? pos : pos + (performance.now() - at);
    const clamped = durationMs ? Math.min(here, durationMs) : here;
    const pct = durationMs ? Math.min(100, (clamped / durationMs) * 100) : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct.toFixed(3)}%`;
    if (knobRef.current) knobRef.current.style.left = `${pct.toFixed(3)}%`;
    if (sparkRef.current) sparkRef.current.style.left = `${pct.toFixed(2)}%`;
    if (elapsedRef.current) elapsedRef.current.textContent = fmt(clamped);

    // Re-render only when the sung line actually changes — a few times a verse
    // instead of sixty times a second.
    const idx = lyrics.synced ? activeLineIndex(lyrics.lines, clamped + LYRIC_LEAD_MS) : -1;
    if (idx !== lineIndexRef.current) {
      lineIndexRef.current = idx;
      setLineIndex(idx);
    }

    // ── The room, on the DOM side. Transforms and opacity only: no layout. ──
    const t = scene.t;
    if (haloRef.current) {
      haloRef.current.style.opacity = (0.55 + Math.sin(t * 0.13) * 0.18).toFixed(3);
    }
    if (washRef.current) {
      washRef.current.style.opacity = (0.82 + Math.sin(t * 0.057 + 1.3) * 0.12).toFixed(3);
    }
    if (backdropRef.current) {
      // A slow Ken Burns drift, so the blurred cover behind everything is never
      // quite the same shot twice.
      backdropRef.current.style.transform =
        `scale(${(1.25 + Math.sin(t * 0.021) * 0.03).toFixed(4)}) ` +
        `translate3d(${(Math.sin(t * 0.017) * 1.1).toFixed(2)}%, ${(Math.cos(t * 0.013) * 0.9).toFixed(2)}%, 0)`;
    }
    if (shineRef.current) {
      // A highlight crossing the glass roughly every twenty seconds.
      const sweep = (t * 5) % 100;
      shineRef.current.style.opacity = (sweep < 34 ? 0.32 * Math.sin((sweep / 34) * Math.PI) : 0).toFixed(3);
      shineRef.current.style.transform = `translateX(${(-30 + sweep * 5).toFixed(1)}%)`;
    }
    if (rootRef.current) {
      // A slow breath on the sung line. Time-driven, like everything else here:
      // it reads as alive without pretending to follow the music.
      rootRef.current.style.setProperty('--lyric-glow', (0.5 + 0.5 * Math.sin(t * 0.5)).toFixed(3));
    }
    // Parallax: the content sits in front of the room, so it drifts against the
    // camera rather than with it.
    if (contentRef.current) {
      contentRef.current.style.transform =
        `translate3d(${(-scene.camX * window.innerWidth * 0.5).toFixed(2)}px, ` +
        `${(-scene.camY * window.innerHeight * 0.5).toFixed(2)}px, 0)`;
    }
  });

  return createPortal(
    // onScroll: focusing a lyric line can also scroll this container; snapping
    // it back keeps the overlay from drifting off the bottom of the screen.
    <div
      ref={rootRef}
      data-settings=""
      className="fixed inset-0 z-[80] overflow-hidden bg-[#05070f] text-white"
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      {/* The artwork itself, blown up and blurred, is the backdrop */}
      {state?.image ? (
        <img
          ref={backdropRef}
          src={state.image}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-35 blur-3xl saturate-150 will-change-transform"
        />
      ) : null}
      <div
        ref={washRef}
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            `radial-gradient(120% 80% at 8% -10%, ${rgba(palette.base, 0.42)}, transparent 60%),` +
            `radial-gradient(110% 90% at 100% 110%, ${rgba(palette.accent, 0.34)}, transparent 62%),` +
            'linear-gradient(180deg, rgba(5,7,15,0.55) 0%, rgba(5,7,15,0.88) 100%)',
        }}
      />
      <Visualizer palette={palette} />

      <div ref={contentRef} className="relative flex h-full flex-col will-change-transform">
        {afk ? (
          <header className="flex shrink-0 flex-col items-center px-6 pb-2 pt-7 text-center md:px-10">
            <p className="clock-figures text-[clamp(3rem,7.5vw,5.5rem)] font-extralight leading-none text-white text-glow">
              {formatClock(now)}
            </p>
            <p className="display-type mt-2 text-sm font-light tracking-[0.06em] text-white/60">
              {formatLongDate(now)}
            </p>
          </header>
        ) : (
          <header className="flex shrink-0 items-center gap-3 px-6 py-5 md:px-10">
            <span className="glow-dot h-1.5 w-1.5 rounded-full bg-cyan-200 text-cyan-200" aria-hidden="true" />
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-white/45">
              {paused ? 'Paused' : 'Now playing'}
            </p>

            <button
              type="button"
              onClick={onClose}
              aria-label="Exit immersive mode"
              title="Exit (Esc)"
              className="soft-button ml-auto grid h-9 w-9 place-items-center rounded-full text-white/75 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
        )}

        <main className="grid min-h-0 flex-1 grid-cols-1 items-center gap-8 px-6 pb-8 md:px-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-14">
          {/* Artwork + transport */}
          <section className="flex min-w-0 flex-col items-center lg:items-start">
            <div className="relative">
              <div
                ref={haloRef}
                className="absolute -inset-8 rounded-[3.5rem] blur-2xl will-change-transform"
                style={{ background: `radial-gradient(circle, ${rgba(palette.glow, 0.55)}, transparent 70%)` }}
                aria-hidden="true"
              />
              <div className="relative aspect-square w-[min(62vw,20rem)] overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/15">
                {/* Highlight travelling the cover with the top end */}
                <span
                  ref={shineRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 -left-1/3 z-10 w-1/3 opacity-0 will-change-transform"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0.75) 50%, transparent 82%)',
                  }}
                />
                {state?.image ? (
                  <img src={state.image} alt={`${state.track} album art`} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-white/5">
                    <Music2 className="h-16 w-16 text-white/30" strokeWidth={1.2} aria-hidden="true" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-7 w-[min(62vw,20rem)] min-w-0 text-center lg:text-left">
              <h1 className="display-type truncate text-3xl font-extralight tracking-wide text-white text-glow">
                {state?.track || 'Nothing playing'}
              </h1>
              <p className="mt-1.5 truncate text-sm font-light text-white/60">
                {state?.artists || 'Start something from your library'}
              </p>

              <button
                type="button"
                aria-label="Seek"
                onClick={(e) => {
                  if (!durationMs) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  seekTo(((e.clientX - rect.left) / rect.width) * durationMs);
                }}
                className="group relative mt-6 block h-1.5 w-full cursor-pointer rounded-full bg-white/12"
              >
                <div
                  ref={fillRef}
                  className="absolute left-0 top-0 h-1.5 w-0 rounded-full"
                  style={{ background: rgba(palette.glow, 0.95) }}
                />
                <span
                  ref={sparkRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 h-2.5 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[3px]"
                  style={{ left: 0, background: rgba(palette.glow, 0.9) }}
                />
                <div
                  ref={knobRef}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_12px_rgba(255,255,255,0.8)] transition-opacity group-hover:opacity-100"
                  style={{ left: 0 }}
                />
              </button>
              <div className="mt-2 flex justify-between text-[0.6875rem] font-medium text-white/45">
                <span ref={elapsedRef} className="clock-figures">{fmt(position)}</span>
                <span className="clock-figures">{fmt(durationMs)}</span>
              </div>

              {/* Centred under the artwork — the column is exactly the art's width */}
              <div className="mt-6 flex items-center justify-center gap-8">
                <button
                  type="button"
                  onClick={controls.previous}
                  aria-label="Previous track"
                  className="text-white/60 transition hover:scale-110 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <SkipBack className="h-6 w-6" fill="currentColor" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={controls.toggle}
                  aria-label={paused ? 'Play' : 'Pause'}
                  className="grid h-16 w-16 place-items-center rounded-full text-[#08101f] shadow-xl transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  style={{ background: `linear-gradient(160deg, #fff, ${rgba(palette.glow, 0.85)})` }}
                >
                  {paused ? (
                    <Play className="ml-1 h-6 w-6" fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Pause className="h-6 w-6" fill="currentColor" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={controls.next}
                  aria-label="Next track"
                  className="text-white/60 transition hover:scale-110 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <SkipForward className="h-6 w-6" fill="currentColor" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          <Lyrics lyrics={lyrics} index={lineIndex} palette={palette} onSeek={seekTo} />
        </main>
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
        >
          <span className="absolute inset-x-0 bottom-7 animate-pulse text-center text-[0.625rem] font-medium uppercase tracking-[0.4em] text-white/25">
            Touch anywhere for home
          </span>
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

/* ── Frame loop ──────────────────────────────────────────────────────────── */

/**
 * Run `fn` every animation frame with the ambient scene already advanced.
 *
 * `stepScene` is idempotent per timestamp and rAF hands every callback in a
 * frame the same one, so the canvas and the DOM effects below can each drive
 * their own loop and still be looking at exactly the same scene.
 *
 * @param {{current: number[]}} artworkRef album colour, read fresh each frame
 * @param {(scene: object, dt: number) => void} fn
 */
function useSceneFrame(artworkRef, fn) {
  const cb = useRef(fn);
  cb.current = fn;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      // Clamped: a backgrounded tab resumes with a huge gap, and without this
      // every drifting element would jump on the first frame back.
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      cb.current(stepScene({ artwork: artworkRef.current, dt, stamp: now }), dt);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [artworkRef]);
}

/* ── Lyrics ──────────────────────────────────────────────────────────────── */

function Lyrics({ lyrics, index, palette, onSeek }) {
  const activeRef = useRef(null);
  const panelRef = useRef(null);
  // Keep the line being sung in the middle of the panel.
  //
  // Scrolled by hand rather than with scrollIntoView: that scrolls EVERY
  // scrollable ancestor, and the full-screen portal counts as one (overflow
  // hidden is still programmatically scrollable). It was dragging the whole
  // overlay up ~22px, which showed as a hard-edged strip along the bottom of
  // the screen where the backdrop and canvas no longer reached.
  useEffect(() => {
    const line = activeRef.current;
    const panel = panelRef.current;
    if (!line || !panel) return;
    const offset = line.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    const target = panel.scrollTop + offset - (panel.clientHeight - line.offsetHeight) / 2;
    panel.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [index]);

  if (lyrics.status === 'loading') {
    return (
      <section className="hidden min-h-0 self-stretch py-10 lg:block">
        <div className="space-y-4">
          {[0.9, 0.7, 0.8, 0.5, 0.65].map((w, i) => (
            <div
              key={i}
              className="h-6 animate-pulse rounded-lg bg-white/8"
              style={{ width: `${w * 100}%`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (lyrics.status !== 'found') {
    return (
      <section className="hidden min-h-0 items-center justify-center self-stretch lg:flex">
        <p className="max-w-xs text-center text-sm leading-7 text-white/35">
          {lyrics.status === 'idle' ? 'Play something to see its lyrics here.' : 'No lyrics found for this track.'}
        </p>
      </section>
    );
  }

  // Plain lyrics: no timings to sync to, so it's a readable column instead.
  if (!lyrics.synced) {
    return (
      <section className="glass-scroll hidden max-h-[70vh] min-h-0 self-stretch overflow-y-auto py-10 pr-3 lg:block">
        <p className="whitespace-pre-line text-lg font-light leading-9 text-white/70">{lyrics.plain}</p>
      </section>
    );
  }

  return (
    <section
      ref={panelRef}
      className="lyric-fade hide-scrollbar hidden max-h-[34vh] min-h-0 self-center overflow-y-auto px-5 py-[15vh] lg:block"
      aria-label="Lyrics"
    >
      {lyrics.lines.map((line, i) => {
        const isActive = i === index;
        const distance = Math.abs(i - index);
        if (!line.text) {
          return <div key={i} className="h-5" aria-hidden="true" />;
        }
        return (
          <button
            key={i}
            ref={isActive ? activeRef : null}
            type="button"
            onClick={() => onSeek(line.at)}
            title="Jump to this line"
            className={[
              'block w-full origin-left rounded-lg px-2 py-1.5 text-left text-2xl font-medium leading-snug transition-all duration-500 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:text-[1.75rem]',
              isActive
                ? 'scale-[1.03] text-white'
                : distance === 1
                  ? 'text-white/35'
                  : distance === 2
                    ? 'text-white/15'
                    : 'text-white/[0.06]',
            ].join(' ')}
            style={{
              // Every line carries the SAME three shadows, transparent when it
              // isn't the one being sung. CSS can't interpolate to or from
              // `none`, so a shadow that only exists on the active line pops in
              // and out instead of fading — that was the inconsistency.
              //
              // Three of them, not one: a tight core so the letterforms stay
              // crisp, a mid bloom, and a wider halo to lift the line off the
              // background. Blurs stay inside the panel's padding, because this
              // is a scroll container and anything wider gets clipped at the
              // edge — which is the straight line that was showing.
              textShadow: [
                `0 0 calc(4px + var(--lyric-glow, 0) * 4px) ${rgba(palette.glow, isActive ? 0.95 : 0)}`,
                `0 0 calc(15px + var(--lyric-glow, 0) * 12px) ${rgba(palette.glow, isActive ? 0.7 : 0)}`,
                `0 0 calc(32px + var(--lyric-glow, 0) * 22px) ${rgba(palette.glow, isActive ? 0.42 : 0)}`,
              ].join(', '),
            }}
          >
            {line.text}
          </button>
        );
      })}
    </section>
  );
}

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

/* ── Visualiser ──────────────────────────────────────────────────────────── */

/**
 * Canvas layer. All the thinking happens in services/music/scene; this only owns
 * the element, the resize listener and the per-frame draw call.
 */
function Visualizer({ palette }) {
  const ref = useRef(null);
  const rendererRef = useRef(null);
  const artworkRef = useRef(palette.glow);
  artworkRef.current = palette.glow;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    rendererRef.current = new SceneRenderer(canvas);
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      rendererRef.current = null;
    };
  }, []);

  useSceneFrame(artworkRef, (s) => rendererRef.current?.draw(s));

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
