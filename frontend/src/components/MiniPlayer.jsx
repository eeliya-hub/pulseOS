import { GripVertical, Music2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer.js';

const POS_KEY = 'pulse.miniplayer.pos.v1';
const WIDTH = 300;
const HEIGHT = 72;
const MARGIN = 12;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function defaultPos() {
  return {
    x: Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN),
    y: Math.max(MARGIN, window.innerHeight - HEIGHT - 110), // sit above the dock
  };
}

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.x === 'number' && typeof p?.y === 'number') {
        return { x: clamp(p.x, MARGIN, window.innerWidth - WIDTH - MARGIN), y: clamp(p.y, MARGIN, window.innerHeight - HEIGHT - MARGIN) };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultPos();
}

/**
 * A small, draggable Spotify controller that floats over every view so playback
 * is controllable no matter which tab you're on. Shares the one app-wide player,
 * so it stays in sync with the full Music view and the AI.
 */
export default function MiniPlayer() {
  const { status, state, position, controls, playbackError } = useSpotifyPlayer();
  const [pos, setPos] = useState(loadPos);
  const [dismissed, setDismissed] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  // A new track resurfaces the player after it was dismissed.
  const trackId = state?.track ?? '';
  useEffect(() => {
    if (trackId) setDismissed(false);
  }, [trackId]);

  // Keep it on-screen if the window is resized.
  useEffect(() => {
    const onResize = () =>
      setPos((p) => ({
        x: clamp(p.x, MARGIN, window.innerWidth - WIDTH - MARGIN),
        y: clamp(p.y, MARGIN, window.innerHeight - HEIGHT - MARGIN),
      }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...posRef.current };
    const move = (ev) => {
      setPos({
        x: clamp(origin.x + ev.clientX - startX, MARGIN, window.innerWidth - WIDTH - MARGIN),
        y: clamp(origin.y + ev.clientY - startY, MARGIN, window.innerHeight - HEIGHT - MARGIN),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(posRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (status !== 'ready' || !state?.track || dismissed) return null;

  const paused = state.paused ?? true;
  const progress = state.durationMs ? Math.min(position / state.durationMs, 1) : 0;

  return createPortal(
    <div
      data-settings=""
      className="theme-card fade-in fixed z-[60] flex items-center gap-2 overflow-hidden rounded-2xl p-2 pr-2.5 shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: WIDTH }}
    >
      {/* Drag handle */}
      <button
        type="button"
        onPointerDown={startDrag}
        aria-label="Move player"
        className="grid h-9 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-white/30 transition hover:text-white/60 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Art */}
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
        {state.image ? (
          <img src={state.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-white/8">
            <Music2 className="h-4 w-4 text-white/40" aria-hidden="true" />
          </div>
        )}
        {/* thin progress line under the art */}
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15" aria-hidden="true">
          <span className="block h-full bg-cyan-200" style={{ width: `${progress * 100}%` }} />
        </span>
      </div>

      {/* Meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white/90">{state.track}</p>
        <p className="truncate text-[0.6875rem] text-white/45">{playbackError || state.artists || '—'}</p>
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={controls.previous}
          aria-label="Previous track"
          className="grid h-7 w-7 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus:outline-none"
        >
          <SkipBack className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={controls.toggle}
          aria-label={paused ? 'Play' : 'Pause'}
          className="orb-button grid h-8 w-8 place-items-center rounded-full text-white transition-transform hover:scale-105 focus:outline-none"
        >
          {paused ? (
            <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
          ) : (
            <Pause className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={controls.next}
          aria-label="Next track"
          className="grid h-7 w-7 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus:outline-none"
        >
          <SkipForward className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Hide mini player"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white/30 transition hover:bg-white/10 hover:text-white/70 focus:outline-none"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
