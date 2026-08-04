import { MicOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVoiceLive, VOICE_STATUS } from '../hooks/useVoiceLive.js';

// The title shown while a tool runs — the "searching" state narrates the work.
const TOOL_LABELS = {
  get_upcoming_events: 'Checking your calendar',
  get_past_events: 'Checking your calendar',
  get_today: 'Checking your day',
  get_weather: 'Checking the weather',
  get_news: 'Reading the news',
  search_web: 'Searching the internet',
  get_sports: 'Checking the scores',
  get_stocks: 'Checking the markets',
  list_calendars: 'Checking your calendars',
  create_calendar_event: 'Updating your calendar',
  delete_calendar_event: 'Updating your calendar',
  add_task: 'Adding your task',
  complete_task: 'Updating your tasks',
  add_habit: 'Adding your habit',
  set_location: 'Updating your location',
  add_stock: 'Updating your watchlist',
  remember: 'Making a note',
  forget: 'Forgetting that',
  list_memories: 'Recalling what I know',
  open_app: 'Opening that',
  play_music: 'Starting the music',
  pause_music: 'Pausing the music',
  next_track: 'Skipping ahead',
  previous_track: 'Going back a track',
  get_now_playing: 'Checking what’s playing',
};
const DEFAULT_TASK = 'Putting together your brief';

// Halo tint per state — violet-cyan while you talk, blue while Pulse talks, a
// calm indigo while it works/connects, a soft rose on error. `scale` sizes the
// glow: it swells while Pulse speaks, so the room lights up as it answers. The
// halo is a blurred DIV rather than canvas paint precisely because it has no
// bounds to clip against — it stays perfectly round however far it spreads.
const HALO = {
  listening: { bg: 'radial-gradient(circle, rgba(139,156,255,0.5), transparent 68%)', scale: 0.72 },
  speaking: { bg: 'radial-gradient(circle, rgba(90,168,255,0.5), transparent 68%)', scale: 1 },
  searching: { bg: 'radial-gradient(circle, rgba(150,160,255,0.32), transparent 68%)', scale: 0.7 },
  error: { bg: 'radial-gradient(circle, rgba(251,113,133,0.32), transparent 68%)', scale: 0.68 },
  idle: { bg: 'radial-gradient(circle, rgba(150,160,255,0.26), transparent 68%)', scale: 0.68 },
};

/**
 * Holds a task ("searching") title on screen for at least `minMs` once it appears,
 * so quick tool calls don't blip past too fast to read. Returns the tool name to
 * show, or '' when there's no task to display.
 */
function useTaskLatch(activity, minMs = 2000) {
  const [label, setLabel] = useState('');
  const labelRef = useRef('');
  const shownAtRef = useRef(0);
  const timerRef = useRef(null);
  labelRef.current = label;

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (activity) {
      if (labelRef.current !== activity) shownAtRef.current = Date.now();
      setLabel(activity);
    } else if (labelRef.current) {
      const remaining = Math.max(0, minMs - (Date.now() - shownAtRef.current));
      timerRef.current = setTimeout(() => setLabel(''), remaining);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activity, minMs]);

  return label;
}

/**
 * Answer-only, real-time voice assistant with three distinct, audio-reactive
 * states: flowing sine waves while you talk, a soft glowing orb while Pulse talks,
 * and an orbiting-dots loader while it connects or runs a task. Opens on mount; the
 * only chrome is the close button. Mount it and pass onClose.
 */
export default function VoiceAssistant({ onClose }) {
  const { status, error, response, activity, getMicLevel, getAiLevel, getSpeechProgress, start, stop } =
    useVoiceLive();

  // Own the session lifecycle here: open on mount, tear down on unmount. start/stop
  // are stable and the hook guards against overlap, so this survives StrictMode.
  useEffect(() => {
    void start();
    return () => {
      void stop();
    };
  }, [start, stop]);

  const close = async () => {
    await stop();
    onClose();
  };

  const task = useTaskLatch(activity);

  const speaking = status === VOICE_STATUS.SPEAKING;
  const listening = status === VOICE_STATUS.LISTENING;
  const errored = status === VOICE_STATUS.ERROR;
  const busy = status === VOICE_STATUS.REQUESTING_MIC || status === VOICE_STATUS.CONNECTING;

  let mode;
  let title;
  if (errored) {
    mode = 'error';
    title = error || 'Something interrupted us';
  } else if (task) {
    mode = 'searching';
    title = TOOL_LABELS[task] || DEFAULT_TASK;
  } else if (speaking) {
    mode = 'speaking';
    title = 'Speaking';
  } else if (busy) {
    mode = 'searching';
    title = status === VOICE_STATUS.REQUESTING_MIC ? 'Getting ready' : 'Connecting';
  } else if (listening) {
    mode = 'listening';
    title = 'Listening';
  } else {
    mode = 'idle';
    title = 'Ready when you are';
  }

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="absolute inset-0 bg-[#070b18]/80 backdrop-blur-md" aria-hidden="true" />
      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center rounded-3xl px-6 pb-8 pt-5">
        {/* Header — title + close only */}
        <div className="mb-1 flex w-full items-center justify-between">
          <div>
            <h2 className="display-type text-lg font-light text-white text-glow">Pulse Voice</h2>
            <p className="mt-0.5 text-[0.625rem] font-medium uppercase tracking-[0.24em] text-white/38">
              Real-time · Gemini Live
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="End voice session"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Visualiser stage — one reactive design per state */}
        <div className="voice-stage">
          <span
            className="voice-halo"
            style={{ background: HALO[mode].bg, transform: `scale(${HALO[mode].scale})` }}
            aria-hidden="true"
          />
          {mode === 'listening' && <ListeningWave getLevel={getMicLevel} />}
          {mode === 'speaking' && <SpeakingOrb getLevel={getAiLevel} />}
          {(mode === 'searching' || mode === 'idle') && <SearchingDots />}
          {mode === 'error' && <ErrorMark />}
        </div>

        {/* State title — the only narration */}
        <p key={title} className="voice-rise display-type text-xl font-light text-white text-glow">
          {title}
        </p>

        {/* The spoken answer — scrolls and highlights sentence-by-sentence in time
            with the audio, then lingers until the next answer begins */}
        {response && !errored && (
          <SpokenTranscript text={response} speaking={speaking} getProgress={getSpeechProgress} />
        )}

        {/* Retry only lives on the error state */}
        {errored && (
          <button
            type="button"
            onClick={() => start()}
            className="mt-4 rounded-full bg-cyan-200/15 px-5 py-1.5 text-xs font-semibold text-cyan-50 ring-1 ring-cyan-200/25 transition hover:bg-cyan-200/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Try again
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Set up a canvas at the element's CSS size, DPR-corrected. Returns the 2D
// context plus its logical width/height, or null if the canvas is gone.
function setupCanvas(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 216;
  const h = canvas.clientHeight || 216;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

// Three flowing sine layers — the "Siri wave" look. Each is inherently smooth, so
// the whole thing reads clean; loudness just scales their amplitude.
const WAVE_LAYERS = [
  { color: '116,242,255', amp: 1.0, speed: 1.0, freq: 2.0, w: 3.0, a: 0.9 },
  { color: '139,156,255', amp: 0.78, speed: 1.4, freq: 2.6, w: 2.4, a: 0.7 },
  { color: '197,139,255', amp: 0.58, speed: 0.8, freq: 1.6, w: 2.0, a: 0.6 },
];
const WAVE_MAX_A = 0.3; // peak amplitude as a fraction of stage height
const WAVE_LEVEL_GAIN = 5.5; // mic loudness → wave amplitude

/**
 * Listening: layered flowing sine waves. Pure sine curves under a soft centre
 * envelope (tall in the middle, flat at the edges), so the shape is smooth by
 * construction. Their amplitude rises evenly with mic loudness.
 */
function ListeningWave({ getLevel }) {
  const ref = useRef(null);

  useEffect(() => {
    const setup = setupCanvas(ref.current);
    if (!setup) return undefined;
    const { ctx, w: W, h: H } = setup;
    const mid = H / 2;
    const maxA = H * WAVE_MAX_A;
    let raf = 0;
    let t = 0;
    let lvl = 0;

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      lvl += (Math.min(1, getLevel() * WAVE_LEVEL_GAIN) - lvl) * 0.15;
      const amp = 0.1 + lvl; // gentle idle baseline, lifts evenly with loudness

      WAVE_LAYERS.forEach((L) => {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 2) {
          const nx = (x / W) * 2 - 1; // -1..1 across the width
          const env = Math.cos((nx * Math.PI) / 2) ** 2; // 1 at centre → 0 at the edges
          const y = mid + Math.sin(nx * Math.PI * L.freq + t * L.speed) * maxA * amp * L.amp * env;
          if (x) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        // Fade each line to transparent at the left/right ends so they melt out
        // instead of stopping hard at the canvas edge.
        const sg = ctx.createLinearGradient(0, 0, W, 0);
        sg.addColorStop(0, `rgba(${L.color},0)`);
        sg.addColorStop(0.16, `rgba(${L.color},${L.a})`);
        sg.addColorStop(0.84, `rgba(${L.color},${L.a})`);
        sg.addColorStop(1, `rgba(${L.color},0)`);
        ctx.strokeStyle = sg;
        ctx.lineWidth = L.w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = `rgba(${L.color},0.6)`;
        ctx.shadowBlur = 14;
        ctx.stroke();
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);

  return <canvas ref={ref} className="voice-canvas" aria-hidden="true" />;
}

const ORB_LEVEL_GAIN = 5.0; // Pulse's loudness → orb intensity
// Flowing energy filaments inside the sphere. Each is a sine ribbon with its own
// vertical offset, frequency, drift speed, colour and line width — so they weave
// and cross for a living, plasma-like interior. They drift in place, no rotation.
// (rgb, offset, amplitude, frequency, drift speed, line width.)
const ORB_FILAMENTS = [
  { rgb: '180,245,255', off: -0.34, amp: 0.26, freq: 2.1, speed: 0.85, w: 2.0 },
  { rgb: '170,190,255', off: -0.1, amp: 0.38, freq: 1.6, speed: -0.7, w: 2.6 },
  { rgb: '210,175,255', off: 0.12, amp: 0.32, freq: 2.4, speed: 1.05, w: 2.3 },
  { rgb: '150,235,255', off: 0.33, amp: 0.24, freq: 1.9, speed: -0.55, w: 1.9 },
];

/**
 * Fade whatever has been drawn to nothing before it reaches the canvas edge.
 *
 * A canvas is a rectangle, so a glow wide enough to reach its sides gets sliced
 * off square — you see the element's box outlined in its own light. This masks
 * the frame with a radial falloff (destination-in), so light always dies out in
 * a circle and the box it lives in never shows.
 */
function featherEdges(ctx, W, H) {
  const min = Math.min(W, H);
  const mask = ctx.createRadialGradient(W / 2, H / 2, min * 0.4, W / 2, H / 2, min * 0.49);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  // The mask must be drawn with NO shadow: a shadow left set from earlier
  // strokes gets composited into the mask and knocks ~40% off the alpha of
  // everything underneath, quietly greying out the whole sphere.
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

// A soft radial glow — the building block of the aura. Stacked with additive
// ('lighter') blending, these accumulate into a bright, ethereal core with a soft
// falloff instead of a flat fill.
function softGlow(ctx, x, y, r, rgb, alpha) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Speaking: a plasma energy orb — a defined glass sphere with flowing light
 * filaments weaving and drifting inside it. The filaments are sine ribbons at
 * different offsets/speeds (clipped to the sphere and additively blended) so the
 * interior is always moving; a translucent body, glassy rim and top-left specular
 * sell the sphere. Filament brightness/width and the inner glow swell with Pulse's
 * voice, so it's clearly reactive without ever looking like a flat blob.
 */
function SpeakingOrb({ getLevel }) {
  const ref = useRef(null);

  useEffect(() => {
    const setup = setupCanvas(ref.current);
    if (!setup) return undefined;
    const { ctx, w: W, h: H } = setup;
    const cx = W / 2;
    const cy = H / 2;
    let raf = 0;
    let t = 0;
    let lvl = 0;

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      lvl += (Math.min(1, getLevel() * ORB_LEVEL_GAIN) - lvl) * 0.18;
      const R = Math.min(W, H) * 0.32 * (1 + lvl * 0.12);

      // Halo behind the sphere. Kept inside the frame so it can fall off on its
      // own terms — the wide ambient glow is the CSS halo's job, not the canvas'.
      ctx.globalCompositeOperation = 'lighter';
      softGlow(ctx, cx, cy, Math.min(R * 1.6, Math.min(W, H) * 0.46), '120,130,240', 0.1 + lvl * 0.16);

      // Translucent glass body, lit from the top-left.
      ctx.globalCompositeOperation = 'source-over';
      const body = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.34, R * 0.15, cx, cy, R);
      body.addColorStop(0, 'rgba(196,180,255,0.3)');
      body.addColorStop(0.55, 'rgba(150,140,235,0.15)');
      body.addColorStop(1, 'rgba(110,100,195,0.06)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Flowing filaments + a drifting inner glow, clipped inside the sphere.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      // Filaments weave and drift in place (via their own sine motion) — they no
      // longer rotate around the centre, so the interior churns without spinning.
      ORB_FILAMENTS.forEach((F) => {
        ctx.beginPath();
        for (let p = -1; p <= 1.0001; p += 0.03) {
          const x = cx + p * R * 0.98;
          const env = Math.cos((p * Math.PI) / 2); // fade near the rim
          const y = cy + F.off * R + Math.sin(p * Math.PI * F.freq + t * F.speed) * F.amp * R * env + Math.sin(t * 0.4 + F.off * 3) * R * 0.06;
          if (p <= -1) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${F.rgb},${0.5 + lvl * 0.4})`;
        ctx.lineWidth = F.w * (0.8 + lvl * 0.7);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = `rgba(${F.rgb},0.85)`;
        ctx.shadowBlur = 9 + lvl * 12;
        ctx.stroke();
      });
      softGlow(ctx, cx + Math.sin(t * 0.5) * R * 0.15, cy + Math.cos(t * 0.4) * R * 0.12, R * 0.5, '220,230,255', 0.18 + lvl * 0.32);
      ctx.restore();

      // Glassy rim + top-left specular highlight.
      ctx.globalCompositeOperation = 'lighter';
      const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      rim.addColorStop(0, 'rgba(220,235,255,0.55)');
      rim.addColorStop(0.5, 'rgba(150,160,255,0.1)');
      rim.addColorStop(1, 'rgba(200,160,255,0.4)');
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(160,180,255,0.6)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
      ctx.stroke();
      softGlow(ctx, cx - R * 0.34, cy - R * 0.4, R * 0.32, '255,255,255', 0.22 + lvl * 0.15);
      ctx.globalCompositeOperation = 'source-over';
      featherEdges(ctx, W, H);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);

  return <canvas ref={ref} className="voice-canvas" aria-hidden="true" />;
}

// Split the transcript into spoken chunks (sentence- or line-sized), keeping each
// chunk's raw end-offset so audio progress can map onto it. Markdown symbols are
// stripped for display (the model shouldn't emit them in voice, but just in case).
function toSegments(text) {
  const out = [];
  const re = /[^.!?…\n]+[.!?…]*|\n+/g;
  let m = re.exec(text);
  while (m) {
    const raw = m[0];
    const clean = raw
      .replace(/[#*`>]+/g, '')
      .replace(/^\s*[-•]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) out.push({ clean, end: m.index + raw.length });
    m = re.exec(text);
  }
  return out;
}

/**
 * The spoken answer, revealed and highlighted sentence-by-sentence in time with
 * the AUDIO (which lags the fast-arriving transcript). The sentence being said is
 * highlighted, already-said text dims, upcoming text is faint, and the view
 * auto-scrolls to keep the live sentence in view. At rest the whole answer reads.
 */
function SpokenTranscript({ text, speaking, getProgress }) {
  const activeRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const segments = useMemo(() => toSegments(text), [text]);

  // Follow the audio: map playback progress → the segment currently being spoken.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = speaking ? getProgress?.() ?? 1 : 1;
      const spokenChars = p * text.length;
      let idx = segments.findIndex((s) => s.end > spokenChars);
      if (idx < 0) idx = segments.length - 1;
      setCurrent((c) => (c === idx ? c : idx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getProgress, segments, speaking, text]);

  // Keep the sentence being spoken in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  return (
    <div className="glass-scroll mt-3 max-h-[26vh] w-full overflow-y-auto px-1">
      <p className="voice-rise text-center text-[0.9375rem] leading-7">
        {segments.map((seg, index) => {
          const cls = !speaking
            ? 'text-white/85'
            : index < current
              ? 'text-white/40'
              : index === current
                ? 'text-white text-glow'
                : 'text-white/25';
          return (
            <span
              key={index}
              ref={index === current ? activeRef : null}
              className={`${cls} transition-colors duration-300`}
            >
              {seg.clean}{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}

const ORBIT_DOTS = 8;
const ORBIT_R = 34;

// Searching / connecting — a comet of graduated dots orbiting a still centre.
function SearchingDots() {
  return (
    <div className="dot-orbit" aria-hidden="true">
      {Array.from({ length: ORBIT_DOTS }).map((_, i) => {
        const a = (i / ORBIT_DOTS) * Math.PI * 2;
        const size = 3 + (1 - i / ORBIT_DOTS) * 8;
        return (
          <span
            key={i}
            style={{
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              transform: `translate(${Math.cos(a) * ORBIT_R}px, ${Math.sin(a) * ORBIT_R}px)`,
              opacity: 0.15 + (1 - i / ORBIT_DOTS) * 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

// Error — a quiet muted-mic mark.
function ErrorMark() {
  return (
    <div
      className="relative z-[1] grid h-20 w-20 place-items-center rounded-full bg-rose-400/10 ring-1 ring-rose-300/25"
      aria-hidden="true"
    >
      <MicOff className="h-8 w-8 text-rose-200/80" />
    </div>
  );
}
