import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api/backendClient.js';

/**
 * Lyrics for whatever is playing, fetched once per track and cached in-module so
 * flipping in and out of the immersive view (or back to a track) is instant.
 *
 * status: 'idle' | 'loading' | 'found' | 'none'
 */
const cache = new Map();

export function useLyrics(track, artists, durationMs) {
  const [result, setResult] = useState({ status: 'idle', synced: false, lines: [], plain: '' });
  const requestRef = useRef(0);

  useEffect(() => {
    const artist = (artists || '').split(',')[0].trim();
    if (!track || !artist) {
      setResult({ status: 'idle', synced: false, lines: [], plain: '' });
      return undefined;
    }

    const key = `${track}|${artist}`;
    const hit = cache.get(key);
    if (hit) {
      setResult(hit);
      return undefined;
    }

    const ticket = ++requestRef.current;
    setResult({ status: 'loading', synced: false, lines: [], plain: '' });

    api.music
      .lyrics({ track, artist, durationMs })
      .then((data) => {
        const next = data?.found
          ? { status: 'found', synced: Boolean(data.synced), lines: data.lines ?? [], plain: data.plain ?? '' }
          : { status: 'none', synced: false, lines: [], plain: '' };
        cache.set(key, next);
        if (ticket === requestRef.current) setResult(next);
      })
      .catch(() => {
        // A lyrics miss is not an error worth surfacing — the view just shows art.
        if (ticket === requestRef.current) setResult({ status: 'none', synced: false, lines: [], plain: '' });
      });

    return undefined;
  }, [track, artists, durationMs]);

  return result;
}

/**
 * The player publishes its position once a second, which is too coarse to
 * highlight a lyric on the beat. This interpolates between those updates with
 * rAF so the line changes when it's actually sung, then re-syncs on every push
 * (including seeks) rather than drifting.
 */
export function useSmoothPosition(position, paused, durationMs) {
  const [smooth, setSmooth] = useState(position);
  const anchor = useRef({ at: performance.now(), position });

  useEffect(() => {
    anchor.current = { at: performance.now(), position };
    setSmooth(position);
  }, [position]);

  useEffect(() => {
    if (paused) return undefined;
    let raf = 0;
    const tick = () => {
      const { at, position: from } = anchor.current;
      const next = from + (performance.now() - at);
      setSmooth(durationMs ? Math.min(next, durationMs) : next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, durationMs]);

  return paused ? position : smooth;
}

/** Index of the line being sung at `positionMs`, or -1 before the first one. */
export function activeLineIndex(lines, positionMs) {
  if (!lines?.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].at <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
