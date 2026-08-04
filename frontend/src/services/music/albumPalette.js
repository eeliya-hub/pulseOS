// Pull a colour palette out of the album artwork, so the immersive player is
// tinted by whatever is playing rather than by one fixed theme.
//
// Spotify's image CDN (i.scdn.co) serves `access-control-allow-origin: *`, so the
// artwork can be drawn to a canvas and read back. If that ever stops being true
// the canvas taints, getImageData throws, and we fall back to the house palette.

const FALLBACK = { base: [96, 124, 214], accent: [150, 110, 214], glow: [116, 242, 255] };

const SIZE = 24; // downscale before sampling — plenty for a dominant-colour read

function rgbToHsl([r, g, b]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// Lift a washed-out or near-black swatch into a range that reads on a dark page.
function vivify([r, g, b]) {
  const [h, s, l] = rgbToHsl([r, g, b]);
  const S = Math.min(1, Math.max(s, 0.55));
  const L = Math.min(0.68, Math.max(l, 0.45));
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
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

/**
 * Read the artwork's dominant colours.
 *
 * @param {string} src album art URL
 * @returns {Promise<{base:number[], accent:number[], glow:number[]}>} rgb triples
 */
export function albumPalette(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(FALLBACK);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(FALLBACK);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // Bucket by coarse colour, weighting saturated pixels — album art is
        // often mostly background, and the accent is what makes it recognisable.
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const rgb = [data[i], data[i + 1], data[i + 2]];
          const [, s, l] = rgbToHsl(rgb);
          if (l < 0.12 || l > 0.94) continue; // ignore the blacks and blown-out whites
          const key = rgb.map((v) => v >> 4).join(',');
          const hit = buckets.get(key) ?? { rgb, weight: 0 };
          hit.weight += 1 + s * 2.5;
          buckets.set(key, hit);
        }

        const ranked = [...buckets.values()].sort((a, b) => b.weight - a.weight);
        if (!ranked.length) return resolve(FALLBACK);

        // Second colour should differ in hue from the first, so the gradient has
        // somewhere to travel instead of being one flat wash.
        const base = ranked[0].rgb;
        const baseHue = rgbToHsl(base)[0];
        const contrast =
          ranked.find((c) => {
            const d = Math.abs(rgbToHsl(c.rgb)[0] - baseHue);
            return Math.min(d, 360 - d) > 40;
          })?.rgb ?? ranked[Math.min(1, ranked.length - 1)].rgb;

        resolve({ base: vivify(base), accent: vivify(contrast), glow: vivify(ranked[0].rgb) });
      } catch {
        resolve(FALLBACK); // tainted canvas — palette isn't worth breaking playback over
      }
    };
    img.src = src;
  });
}

export const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
export const DEFAULT_PALETTE = FALLBACK;
