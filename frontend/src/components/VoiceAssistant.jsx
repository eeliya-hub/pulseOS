import { MicOff, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVoiceLive, VOICE_STATUS } from '../hooks/useVoiceLive.js';
import { useVoiceScript } from '../hooks/useVoiceScript.js';
import { DEFAULT_CAPTION } from '../services/ai/toolCaptions.js';
import ContextPanel from './voice/ContextPanel.jsx';
import { onVoiceClose } from '../services/ui/afterSpeech.js';


// header / stage / transcript. minmax(0, 1fr) on the middle row is what stops a
// tall card from pushing the stage down over the transcript; set inline because
// the equivalent Tailwind arbitrary value did not survive the build.
const GRID_ROWS = { gridTemplateRows: 'auto minmax(0, 1fr) auto' };

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
  const { status, error, response, activity, panels, getMicLevel, getAiLevel, getSpokenChars, start, stop } =
    useVoiceLive();

  // Own the session lifecycle here: open on mount, tear down on unmount. start/stop
  // are stable and the hook guards against overlap, so this survives StrictMode.
  useEffect(() => {
    void start();
    return () => {
      void stop();
    };
  }, [start, stop]);

  const close = useCallback(async () => {
    await stop();
    onClose();
  }, [stop, onClose]);

  // Some answers end the conversation by their nature — handing the screen to a
  // live channel, say. Registering here also tells the queue a voice session is
  // running at all; without one, anything waiting on speech just runs.
  //
  // Registered once through a ref, deliberately: keying it on `close` re-ran the
  // effect whenever App handed down a new onClose, and its cleanup drops
  // whatever is queued — so a single re-render between "put the news on" and the
  // end of the sentence threw the takeover away.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => onVoiceClose(() => void closeRef.current()), []);

  const task = useTaskLatch(activity);

  const speaking = status === VOICE_STATUS.SPEAKING;
  const listening = status === VOICE_STATUS.LISTENING;
  const errored = status === VOICE_STATUS.ERROR;
  const busy = status === VOICE_STATUS.REQUESTING_MIC || status === VOICE_STATUS.CONNECTING;

  // One reading of where the voice is, shared by the transcript (which lights the
  // words) and the card (which lights the rows). Both come out of the same
  // timeline, so they cannot drift apart.
  const {
    sentences: segments,
    sentence: current,
    word,
    panel,
    spotlight,
  } = useVoiceScript({ panels, transcript: response, speaking, getSpokenChars, holdReceipt: !task });

  let mode;
  let title;
  if (errored) {
    mode = 'error';
    title = error || 'Something interrupted us';
  } else if (task) {
    mode = 'searching';
    title = task || DEFAULT_CAPTION;
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
    <div data-settings="" className="fixed inset-0 z-[70] grid" style={GRID_ROWS}>
      <div className="absolute inset-0 bg-[#03050e]/96 backdrop-blur-2xl" aria-hidden="true" />

      {/* Header — identity + the way out */}
      <header className="relative z-10 flex items-start justify-between px-6 pt-5 sm:px-10 sm:pt-7">
        <div>
          <h2 className="display-type text-lg font-light text-moon text-glow">Pulse Voice</h2>
          <p className="mt-0.5 text-[0.75rem] font-medium text-moon/38">
            Real-time with Gemini Live
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="End voice session"
          className="grid h-9 w-9 place-items-center rounded-full text-moon/50 transition hover:bg-white/10 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* The stage: visualiser on the left, what Pulse is talking about on the right */}
      <main className="relative z-10 grid min-h-0 grid-cols-1 gap-4 px-6 py-4 sm:px-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
        <div className="flex min-h-0 items-center justify-center">
          <div className="voice-stage voice-stage--full">
            <span
              className="voice-halo voice-halo--full"
              style={{ background: HALO[mode].bg, transform: `scale(${HALO[mode].scale})` }}
              aria-hidden="true"
            />
            {mode === 'listening' && <ListeningWave getLevel={getMicLevel} />}
            {mode === 'speaking' && <SpeakingOrb getLevel={getAiLevel} />}
            {(mode === 'searching' || mode === 'idle') && <SearchingDots />}
            {mode === 'error' && <ErrorMark />}
          </div>
        </div>

        {/* Right: the state on its own, or — once a tool has found something —
            the card for it, with the state kept as a quiet line above. */}
        <div className="flex min-h-0 flex-col justify-center">
          {panel && !errored ? (
            // max-h-full, not flex-1: a short card sits centred against the
            // visualiser, a long one fills the space and scrolls inside itself
            // rather than growing past the window or over the transcript.
            <div className="flex max-h-full min-h-0 w-full flex-col">
              <div className="mb-3 flex shrink-0 items-center gap-2">
                <p className="text-[0.75rem] font-semibold text-accent/50">{title}</p>
                {panels.length > 1 ? (
                  <span className="flex items-center gap-1" aria-hidden="true">
                    {panels.map((p, i) => (
                      <span
                        key={p.title ?? i}
                        className={`h-1 rounded-full transition-all duration-500 ${
                          p === panel ? 'w-3 bg-accent/70' : 'w-1 bg-white/20'
                        }`}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1">
                <ContextPanel panel={panel} spotlight={spotlight} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center lg:items-start lg:text-left">
              <p key={title} className="voice-rise display-type text-3xl font-light text-moon text-glow sm:text-4xl">
                {title}
              </p>
              {errored && (
                <button
                  type="button"
                  onClick={() => start()}
                  className="mt-5 rounded-full bg-accent/15 px-5 py-1.5 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* The spoken answer, along the bottom — highlighting sentence-by-sentence
          in time with the audio, then lingering until the next answer begins */}
      {/* A frame of its own, always the same height whether or not there is an
          answer in it — so the stage above never moves as the words arrive. */}
      <footer className="relative z-10 mx-auto h-[10.5rem] w-full max-w-4xl px-6 pb-7 sm:px-10 sm:pb-9">
        {response && !errored ? (
          <SpokenTranscript segments={segments} current={current} word={word} speaking={speaking} />
        ) : null}
      </footer>
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
/**
 * The spoken answer, revealed and highlighted sentence-by-sentence in time with
 * the AUDIO (which lags the fast-arriving transcript). The sentence being said is
 * highlighted, already-said text dims, upcoming text is faint, and the view
 * auto-scrolls to keep the live sentence in view. At rest the whole answer reads.
 */
function SpokenTranscript({ segments, current, word, speaking }) {
  const activeRef = useRef(null);

  // Keep the sentence being spoken in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  if (!segments.length) return null;

  return (
    <div className="glass-scroll h-full w-full overflow-y-auto px-1">
      {/* dir="auto" on the paragraph only. Per-sentence direction was flipping the
          alignment line by line inside one answer; the whole answer is one
          language, so the whole paragraph takes one direction. */}
      <p dir="auto" className="text-center text-[0.9375rem] leading-7">
        {segments.map((seg, index) => {
          if (!speaking) {
            return (
              <span key={index} className="text-moon/85">
                {seg.text}{' '}
              </span>
            );
          }
          if (index !== current) {
            // Said already fades back; still to come sits fainter still.
            return (
              <span
                key={index}
                className={`transition-colors duration-500 ${index < current ? 'text-moon/35' : 'text-moon/20'}`}
              >
                {seg.text}{' '}
              </span>
            );
          }
          // The sentence being spoken, lit word by word as the voice reaches
          // each one — the whole point being that it moves continuously rather
          // than a sentence at a time.
          return (
            <span key={index} ref={activeRef}>
              {seg.words.map((w, i) => (
                <span
                  key={i}
                  className={`transition-colors duration-200 ${
                    i < word ? 'text-moon/90' : i === word ? 'text-moon text-glow' : 'text-moon/30'
                  }`}
                >
                  {w}{' '}
                </span>
              ))}
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
