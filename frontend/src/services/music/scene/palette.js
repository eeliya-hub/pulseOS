import { damp } from './SpringPhysics.js';

/**
 * One palette per song, evolving slowly.
 *
 * The previous visualiser recomputed colour from whatever the spectrum was doing
 * that second, which is why it felt random. Here the album artwork fixes the
 * hue for the whole track and the music only shifts it within a narrow band:
 * energy raises saturation, valence warms or cools it, loudness lifts
 * brightness. Every transition is measured in seconds.
 */
const TRANSITION_TAU = 4.5;

const toHsl = ([r, g, b]) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};

const toRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.floor(((h % 360) + 360) % 360 / 60) % 6];
  return seg.map((v) => Math.round((v + m) * 255));
};

export class PaletteController {
  constructor() {
    this.hue = 0;
    this.sat = 0.5;
    this.light = 0.5;
    this.primed = false;
  }

  reset() {
    this.primed = false;
  }

  /**
   * @param {number[]} base album artwork colour
   * @param {object|null} features Spotify audio features, when available
   * @param {object} live { energy, brightness, warmth } from live analysis
   */
  update(base, rawFeatures, live, dt) {
    // `{ available: false }` is an object and therefore truthy — treating it as
    // usable put `undefined` into the arithmetic and turned the whole palette
    // into NaN. Only ever accept features Spotify actually returned.
    const features = rawFeatures?.available ? rawFeatures : null;
    const [h, s] = toHsl(Array.isArray(base) && base.length === 3 ? base : [120, 130, 240]);

    // Valence (how positive the track sounds) warms the hue; without it, the
    // live spectral centroid stands in — bright mixes read as warmer.
    const valence = features?.valence ?? live.warmth ?? 0.5;
    const energy = features?.energy ?? live.energy ?? 0.5;
    // Loudness is dBFS, roughly -30 quiet to -3 loud.
    const loud = features ? Math.min(1, Math.max(0, (features.loudness + 30) / 27)) : live.brightness;

    const hueTarget = h + (valence - 0.5) * 26; // warm/cool within one band
    const satTarget = Math.min(0.85, 0.3 + s * 0.35 + energy * 0.32);
    const lightTarget = 0.38 + loud * 0.16;

    if (!this.primed) {
      this.primed = true;
      this.hue = hueTarget;
      this.sat = satTarget;
      this.light = lightTarget;
    }

    this.hue = damp(this.hue, hueTarget, TRANSITION_TAU, dt);
    this.sat = damp(this.sat, satTarget, TRANSITION_TAU, dt);
    this.light = damp(this.light, lightTarget, TRANSITION_TAU, dt);

    // Related tones from one hue — a palette, not five colours. `deep` and
    // `bloom` sit far enough out to give a nebula visible colour variation;
    // clouds all cut from the same hue read as one flat murk.
    return {
      key: toRgb(this.hue, this.sat, this.light),
      fill: toRgb(this.hue + 18, this.sat * 0.8, this.light * 0.75),
      air: toRgb(this.hue - 22, this.sat * 0.55, Math.min(0.72, this.light * 1.25)),
      // Kept inside ±35°: wide enough that the clouds aren't one flat murk,
      // narrow enough that a warm album can't swing a cloud round to green.
      deep: toRgb(this.hue + 34, Math.min(0.9, this.sat * 1.1), this.light * 0.6),
      bloom: toRgb(this.hue - 32, this.sat * 0.68, Math.min(0.78, this.light * 1.35)),
    };
  }
}
