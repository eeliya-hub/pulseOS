import { useEffect } from 'react';
import { albumPalette } from '../services/music/albumPalette.js';
import { getSettings, useSettings } from './useSettings.js';
import { getWallpaper, useWallpaper } from './useWallpaper.js';

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
 *
 * Settings can change it in three ways, layered in this order: a photo of
 * yours lends the sky its colours; an accent of your own replaces the hour's;
 * and Music, while it's in front, lends a record's over the top of both.
 */

export const PHASES = {
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
// The wallpaper's colours, once read: { a, b, c, accent, stars }.
let photo = null;

/** The hour's phase, unless Settings has held the sky at one. */
const currentPhase = (date) => {
  const held = getSettings().skyPhase;
  return held && held !== 'auto' && PHASES[held] ? held : phaseFor(date);
};

function paint(date = new Date()) {
  if (typeof document === 'undefined') return;
  const phase = currentPhase(date);
  const settings = getSettings();
  let sky = { ...PHASES[phase] };
  if (photo && settings.background?.kind === 'photo' && getWallpaper()) sky = { ...sky, ...photo };
  if (settings.accent && settings.accent !== 'sky') sky.accent = settings.accent;
  if (override) sky = { ...sky, ...override };
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

const shade = (rgb, f) => `rgb(${rgb.map((v) => Math.round(v * f)).join(' ')})`;
// Lifted towards white: an accent is read as text, so it has to be light.
const lift = (rgb, f) => `rgb(${rgb.map((v) => Math.round(v + (255 - v) * f)).join(' ')})`;

/** Keep the sky on the hour while the app is open — or wherever Settings holds it. */
export function useSky() {
  const { settings } = useSettings();
  const wallpaper = useWallpaper();
  const { kind, tint } = settings.background ?? {};

  // A photo behind everything lends its colours to the sky, so the horizon and
  // the ground's glow belong to the picture rather than to the hour.
  useEffect(() => {
    let alive = true;
    if (kind !== 'photo' || !wallpaper || tint === false) {
      photo = null;
      paint();
      return undefined;
    }
    albumPalette(wallpaper).then((p) => {
      if (!alive) return;
      photo = { a: shade(p.base, 0.3), b: shade(p.accent, 0.5), c: shade(p.glow, 0.42), accent: lift(p.glow, 0.5), stars: 0 };
      paint();
    });
    return () => {
      alive = false;
    };
  }, [kind, tint, wallpaper]);

  useEffect(() => {
    paint();
    const id = window.setInterval(() => paint(), 60_000);
    return () => window.clearInterval(id);
  }, [settings.skyPhase, settings.accent]);
}
