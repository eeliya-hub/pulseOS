import { useEffect } from 'react';

/**
 * The sky behind the dashboard.
 *
 * Its colour is the hour's: a peach dawn, a clear blue day, an ember dusk, an
 * indigo night with a few stars. The Music view can lend it the album's colours
 * while it is in front (see setSkyOverride), so the light behind every page
 * means something rather than decorating it.
 *
 * Writes CSS variables on the root; styles.css registers them, so a change of
 * hour — or of album — crossfades instead of snapping.
 */

const PHASES = {
  dawn: { a: '#2a2450', b: '#b56a7c', c: '#dba175', accent: '#ffc9a3', stars: 0.08 },
  day: { a: '#113a6e', b: '#285f98', c: '#3d8aa6', accent: '#b9e4ff', stars: 0 },
  dusk: { a: '#221747', b: '#8f4368', c: '#c56b4c', accent: '#ffb59c', stars: 0.2 },
  night: { a: '#161a44', b: '#392658', c: '#0d3450', accent: '#a9bbff', stars: 0.55 },
};

/** Which part of the day a moment belongs to. */
export function phaseFor(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20.5) return 'dusk';
  return 'night';
}

let override = null;

function paint(date = new Date()) {
  if (typeof document === 'undefined') return;
  const phase = phaseFor(date);
  const sky = override ? { ...PHASES[phase], ...override } : PHASES[phase];
  const root = document.documentElement;
  root.style.setProperty('--sky-a', sky.a);
  root.style.setProperty('--sky-b', sky.b);
  root.style.setProperty('--sky-c', sky.c);
  root.style.setProperty('--accent', sky.accent);
  root.style.setProperty('--stars', String(sky.stars));
  root.dataset.phase = phase;
}

// Painted before React renders anything, so the first frame is already the
// right hour rather than night fading into it.
paint();

/**
 * Lend the sky other colours — `{ a, b, c, accent }` as CSS colours — or give it
 * back to the hour with `null`.
 */
export function setSkyOverride(next) {
  override = next;
  paint();
}

/** Keep the sky on the hour while the app is open. */
export function useSky() {
  useEffect(() => {
    paint();
    const id = window.setInterval(() => paint(), 60_000);
    return () => window.clearInterval(id);
  }, []);
}
