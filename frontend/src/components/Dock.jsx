import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The navigation baseline: one hairline across the foot of the screen, read like
 * a monitor. The tabs sit on the line, and the one you're on carries a lit mark.
 * Pulse isn't a button on the line — it is the line: at the centre the trace
 * beats, and every few seconds a blip of light runs in from the left, through
 * the beat, and out to the right. Touch the beat to reach the assistant.
 *
 * The line and the beat are one path, measured to the screen, so they can't
 * drift apart and the blip travels the whole of it at one speed.
 */

// The beat, in units of a 192-wide cell whose flat line sits at y = 36.
const BEAT = [
  [60, 36],
  [69, 25],
  [80, 51],
  [95, 0],
  [109, 45],
  [117, 36],
  [192, 36],
];
const RAMP_PX = 140; // how far either side of the beat the line warms to the accent
const BLIP_SPEED = 780; // px per second along the flat of the line
const BEAT_SPEED = 430; // ...and through the beat, where it lingers a little
const REST_S = 3.2; // pause between runs
// The blip: nested streaks sharing a centre, longest and faintest outermost, so
// the light is concentrated in the middle and tapers off at both ends.
const BLIP_LAYERS = [
  { length: 120, className: 'baseline-blip baseline-blip--outer' },
  { length: 72, className: 'baseline-blip baseline-blip--mid' },
  { length: 30, className: 'baseline-blip baseline-blip--core' },
];
const BLIP_REACH = BLIP_LAYERS[0].length / 2;

function useTrace(navRef, beatRef) {
  const [trace, setTrace] = useState(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const measure = () => {
      const width = nav.clientWidth;
      const beatWidth = beatRef.current?.offsetWidth ?? 0;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const lineY = Math.round(2.25 * rem) + 0.5; // on the half-pixel so a 1px stroke stays crisp
      const scale = beatWidth / 192;
      const start = width / 2 - beatWidth / 2;
      const at = ([x, y]) => `${(start + x * scale).toFixed(2)} ${(lineY + (y - 36) * scale).toFixed(2)}`;
      const spike = BEAT.slice(0, -1);
      const beat = `M${at(spike[0])}${spike.slice(1).map((p) => `L${at(p)}`).join('')}`;
      const full = `M0 ${lineY}H${start.toFixed(2)}${BEAT.map((p) => `L${at(p)}`).join('')}H${width}`;
      const spikeStart = start + spike[0][0] * scale;
      const spikeEnd = start + spike[spike.length - 1][0] * scale;
      setTrace({ width, height: nav.clientHeight, lineY, spikeStart, spikeEnd, beat, full });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [navRef, beatRef]);

  return trace;
}

export default function Dock({ items, activeView, onChange }) {
  const navRef = useRef(null);
  const beatRef = useRef(null);
  const spikeRef = useRef(null);
  const blipRefs = useRef([]);
  const trace = useTrace(navRef, beatRef);

  const pivot = items.findIndex((item) => item.id === 'ai');
  const ai = pivot >= 0 ? items[pivot] : null;
  const left = pivot >= 0 ? items.slice(0, pivot) : items;
  const right = pivot >= 0 ? items.slice(pivot + 1) : [];
  const pulseOpen = Boolean(ai) && activeView === ai.id;

  // One run of light along the whole path, easing off through the beat, then a
  // rest. While the assistant is up it runs back to back. Timing is keyed on the
  // centre of the blip, so its layers stay together.
  useLayoutEffect(() => {
    const paths = BLIP_LAYERS.map((_, i) => blipRefs.current[i]);
    if (!trace || paths.some((path) => !path) || !spikeRef.current) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const length = paths[0].getTotalLength();
    const enter = trace.spikeStart;
    const leave = enter + spikeRef.current.getTotalLength();
    const reach = BLIP_REACH;
    const stops = [
      [-reach, 0],
      [enter, (enter + reach) / BLIP_SPEED],
      [leave, (enter + reach) / BLIP_SPEED + (leave - enter) / BEAT_SPEED],
    ];
    const run = stops[2][1] + (length + reach - leave) / BLIP_SPEED;
    stops.push([length + reach, run]);
    const cycle = pulseOpen ? run : run + REST_S;

    const animations = paths.map((path, i) => {
      const dash = BLIP_LAYERS[i].length;
      path.style.strokeDasharray = `${dash} ${length + reach * 4}`;
      // A dash starts at -offset; put its centre on the given point of the line.
      const keyframes = stops.map(([centre, t]) => ({ strokeDashoffset: dash / 2 - centre, offset: t / cycle }));
      keyframes.push({ strokeDashoffset: dash / 2 - (length + reach), offset: 1 });
      return path.animate(keyframes, { duration: cycle * 1000, iterations: Infinity });
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [trace, pulseOpen]);

  const renderTab = ({ id, label, Icon }) => {
    const isActive = activeView === id;
    return (
      <button
        key={id}
        type="button"
        data-dock-id={id}
        onClick={() => onChange(id)}
        className={`baseline-tab ${isActive ? 'baseline-tab--on' : ''}`}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="baseline-icon" strokeWidth={isActive ? 2 : 1.7} aria-hidden="true" />
        <span className="baseline-label" aria-hidden="true">
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav
      ref={navRef}
      className={`baseline ${pulseOpen ? 'baseline--open' : ''}`}
      style={trace ? { '--line': `${trace.lineY - 0.5}px` } : undefined}
      aria-label="Primary"
    >
      {trace ? (
        <svg
          className="baseline-trace"
          width={trace.width}
          height={trace.height}
          viewBox={`0 0 ${trace.width} ${trace.height}`}
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="baseline-rule" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={trace.width} y2="0">
              {[
                [0, 'moon', 0],
                [trace.spikeStart / 2, 'moon', 0.16],
                [trace.spikeStart - RAMP_PX, 'moon', 0.22],
                [trace.spikeStart, 'accent', 1],
                [trace.spikeEnd, 'accent', 1],
                [trace.spikeEnd + RAMP_PX, 'moon', 0.22],
                [(trace.spikeEnd + trace.width) / 2, 'moon', 0.16],
                [trace.width, 'moon', 0],
              ].map(([x, colour, opacity], i) => (
                <stop
                  key={i}
                  offset={Math.min(1, Math.max(0, x / trace.width))}
                  style={{ stopColor: `var(--${colour})`, stopOpacity: opacity }}
                />
              ))}
            </linearGradient>
          </defs>
          <path className="baseline-trace-rule" d={trace.full} stroke="url(#baseline-rule)" />
          <path ref={spikeRef} className="baseline-trace-beat" d={trace.beat} />
          {BLIP_LAYERS.map(({ className }, i) => (
            <path
              key={className}
              ref={(node) => {
                blipRefs.current[i] = node;
              }}
              className={className}
              d={trace.full}
            />
          ))}
        </svg>
      ) : null}

      <div className="baseline-row">
        <div className="baseline-half">{left.map(renderTab)}</div>

        {ai ? (
          <button
            ref={beatRef}
            type="button"
            data-dock-id={ai.id}
            onClick={() => onChange(ai.id)}
            className="baseline-beat"
            aria-label={ai.label}
            aria-current={pulseOpen ? 'page' : undefined}
          >
            <span className="baseline-beat-label" aria-hidden="true">
              Ask Pulse
            </span>
          </button>
        ) : null}

        <div className="baseline-half">{right.map(renderTab)}</div>
      </div>
    </nav>
  );
}
