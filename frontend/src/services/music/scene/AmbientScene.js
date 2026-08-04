import { PaletteController } from './palette.js';

/**
 * A slow, living atmosphere: a blurred nebula with a field of stars over it.
 * Nothing here listens to the music.
 *
 * The brief is a background you can leave up for hours — always moving, never
 * asking for attention, never flashing, and never obviously looping. Every
 * element runs on its own incommensurate period, so the combination doesn't
 * repeat on any timescale you'd sit through.
 *
 * Two scales of detail, which is the whole trick: enormous soft clouds that
 * drift too slowly to watch directly, and small sharp stars that twinkle. The
 * clouds alone read as murk; the stars alone read as a screensaver.
 *
 * The only thing the music contributes is colour: the palette comes from the
 * album artwork and cross-fades over several seconds when the track changes.
 */

const STARS = 620;

// Clouds of gas. Sizes are fractions of the screen diagonal, so the composition
// holds at any window size.
const CLOUDS = [
  { tone: 'key', x: 0.3, y: 0.42, size: 1.05, drift: 0.16, speed: 0.037, breathe: 0.062, depth: 0.3, seed: 0 },
  { tone: 'deep', x: 0.66, y: 0.3, size: 0.85, drift: 0.2, speed: -0.029, breathe: 0.048, depth: 0.45, seed: 1.9 },
  { tone: 'bloom', x: 0.52, y: 0.62, size: 0.62, drift: 0.24, speed: 0.051, breathe: 0.079, depth: 0.6, seed: 3.4 },
  { tone: 'fill', x: 0.84, y: 0.7, size: 0.78, drift: 0.18, speed: -0.041, breathe: 0.055, depth: 0.35, seed: 5.0 },
  { tone: 'air', x: 0.16, y: 0.76, size: 0.55, drift: 0.22, speed: 0.033, breathe: 0.087, depth: 0.7, seed: 6.6 },
  { tone: 'key', x: 0.44, y: 0.16, size: 0.9, drift: 0.14, speed: -0.023, breathe: 0.041, depth: 0.25, seed: 8.1 },
];

export class AmbientScene {
  constructor() {
    this.t = 0;
    this.paletteController = new PaletteController();
    this.palette = null;
    this.clouds = CLOUDS.map((c) => ({ ...c }));
    this.stars = Array.from({ length: STARS }, () => {
      // Distributed in polar coordinates around a point off the left edge, so
      // the field has a denser core and thins outward the way a galaxy does —
      // a uniform scatter reads as static.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.72) * 1.05;
      return {
        angle,
        radius,
        depth: 0.25 + Math.random() * 0.75,
        // Most stars are dust; a few are bright enough to carry a flare.
        // Heavily skewed: mostly dust, with a handful big enough to flare.
        size: Math.pow(Math.random(), 2.6) * 3.1 + 0.4,
        base: 0.34 + Math.pow(Math.random(), 1.5) * 0.66,
        twinkleRate: 0.25 + Math.random() * 1.05,
        phase: Math.random() * Math.PI * 2,
        warm: Math.random(),
      };
    });
  }

  reset() {
    this.paletteController.reset();
  }

  /**
   * @param {number[]} artwork album colour
   * @param {number} dt seconds
   */
  update(artwork, dt) {
    this.t += dt;
    const t = this.t;

    // Colour only. No energy, no valence — nothing is being measured.
    this.palette = this.paletteController.update(artwork, null, { energy: 0.5, brightness: 0.5, warmth: 0.5 }, dt);

    // Camera: a slow wander on two rates that don't divide into each other.
    this.camX = (Math.sin(t * 0.031) + Math.sin(t * 0.073 + 1.7) * 0.5) * 0.02;
    this.camY = (Math.cos(t * 0.024) + Math.sin(t * 0.059 + 4.2) * 0.5) * 0.015;

    // The whole field turns, very slowly — about seven minutes a revolution.
    this.spin = t * 0.015;

    for (const c of this.clouds) {
      c.cx = c.x + Math.sin(t * c.speed + c.seed) * c.drift;
      c.cy = c.y + Math.cos(t * c.speed * 0.79 + c.seed) * c.drift * 0.55;
      c.scale = 1 + Math.sin(t * c.breathe + c.seed) * 0.14;
      c.glow = 0.78 + Math.sin(t * c.breathe * 0.63 + c.seed * 1.7) * 0.22;
    }

    for (const s of this.stars) {
      // Twinkle is a sine, not a flicker: it never steps, so it can't strobe.
      s.brightness = s.base * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.twinkleRate + s.phase)));
    }
  }
}
