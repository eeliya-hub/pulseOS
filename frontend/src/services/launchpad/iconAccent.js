// Every launchpad tile glows in its own app's colour. That colour is read out of
// the icon itself, so the grid is lit by the real Photoshop blue, Spotify green,
// Figma red — rather than by one house accent repeated forty times.
//
// The backend serves app icons with CORS, so they can be drawn to a canvas and
// read back. Favicons usually can't be, and an icon can fail to load at all, so
// there's a deterministic fallback: a hue derived from the name. Same app, same
// colour, every session — which is what makes the grid learnable by colour.

const SIZE = 20; // downscale before sampling; a dominant read needs no more
const cache = new Map(); // src → Promise<[r,g,b]>

function rgbToHsl([r, g, b]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb(h, s, l) {
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
  ][Math.floor(h / 60) % 6];
  return seg.map((v) => Math.round((v + m) * 255));
}

/** Lift a muddy or near-black swatch into a range that reads against dark glass. */
const vivify = ([r, g, b]) => {
  const [h, s, l] = rgbToHsl([r, g, b]);
  return hslToRgb(h, Math.min(1, Math.max(s, 0.62)), Math.min(0.7, Math.max(l, 0.52)));
};

/** A stable, pleasant colour for a name — the fallback, and the colour for sites. */
export function hashAccent(name) {
  let hash = 0;
  for (let i = 0; i < (name || '?').length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return hslToRgb(Math.abs(hash) % 360, 0.62, 0.6);
}

/**
 * The dominant colour of an icon.
 *
 * @param {string} src icon URL
 * @param {string} fallbackName used for the hash colour if the read fails
 * @returns {Promise<number[]>} rgb triple
 */
export function iconAccent(src, fallbackName = '') {
  const fallback = hashAccent(fallbackName || src);
  if (!src) return Promise.resolve(fallback);
  if (cache.has(src)) return cache.get(src);

  const task = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(fallback);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // Bucket by coarse colour and weight by saturation. An icon is mostly
        // rounded-rect background; the brand colour is the saturated part, and
        // averaging the lot just returns grey.
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue; // transparent corners
          const rgb = [data[i], data[i + 1], data[i + 2]];
          const [, s, l] = rgbToHsl(rgb);
          if (l < 0.08 || l > 0.95) continue; // pure black/white carry no hue
          const key = rgb.map((v) => v >> 4).join(',');
          const weight = 0.25 + s;
          const hit = buckets.get(key) ?? { rgb: [0, 0, 0], weight: 0 };
          hit.rgb = hit.rgb.map((v, n) => v + rgb[n] * weight);
          hit.weight += weight;
          buckets.set(key, hit);
        }

        const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
        resolve(best ? vivify(best.rgb.map((v) => Math.round(v / best.weight))) : fallback);
      } catch {
        resolve(fallback); // tainted canvas — the name colour still looks deliberate
      }
    };
    img.src = src;
  });

  cache.set(src, task);
  return task;
}
