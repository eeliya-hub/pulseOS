// Pull a colour palette out of the album artwork, so the immersive player is
// tinted by whatever is playing rather than by one fixed theme.
//
// Spotify's image CDN (i.scdn.co) serves `access-control-allow-origin: *`, so the
// artwork can be drawn to a canvas and read back. If that ever stops being true
// the canvas taints, getImageData throws, and we fall back to the house palette.

const FALLBACK = {
  base: [96, 124, 214],
  accent: [150, 110, 214],
  glow: [116, 242, 255],
  swatches: [
    [96, 124, 214],
    [150, 110, 214],
    [116, 242, 255],
    [74, 96, 196],
  ],
};

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

function hslToRgb([h, s, l]) {
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
  ][Math.floor((((h % 360) + 360) % 360) / 60) % 6];
  return seg.map((v) => Math.round((v + m) * 255));
}

// Lift a washed-out or near-black swatch into a range that reads on a dark page.
function vivify([r, g, b]) {
  const [h, s, l] = rgbToHsl([r, g, b]);
  return hslToRgb([h, Math.min(1, Math.max(s, 0.55)), Math.min(0.68, Math.max(l, 0.45))]);
}

// Brighter again than vivify: these are lights in a dark room, not swatches on a
// page, and a colour at half lightness reads as a stain rather than a glow.
function glowing(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, Math.min(1, Math.max(s, 0.62)), Math.min(0.7, Math.max(l, 0.56))]);
}

const hueGap = (a, b) => {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
};

/** The same colour turned round the wheel, for artwork with only one or two. */
function turn(rgb, degrees, lighten = 0) {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([(h + degrees + 360) % 360, s, Math.min(0.72, Math.max(0.38, l + lighten))]);
}

/**
 * Four colours for the immersive player's light, each its own hue where the
 * artwork has one, so the room has more than a single wash to move about. A
 * sleeve with fewer colours than that lends its first one, turned a little
 * either way round the wheel — still recognisably the record, never a stranger.
 */
function swatchesOf(ranked) {
  // A grey has no hue to speak of — lifted, it would come out as an arbitrary red.
  const coloured = ranked.filter(({ rgb }) => rgbToHsl(rgb)[1] > 0.14);
  const picked = [];
  for (const { rgb } of coloured.length ? coloured : ranked) {
    const hue = rgbToHsl(rgb)[0];
    if (picked.every((p) => hueGap(p.hue, hue) > 28)) picked.push({ rgb: glowing(rgb), hue });
    if (picked.length === 4) break;
  }
  const first = picked[0]?.rgb ?? glowing(FALLBACK.base);
  const turns = [
    [34, 0.06],
    [-30, -0.04],
    [64, 0.1],
  ];
  for (let i = 0; picked.length < 4; i += 1) picked.push({ rgb: turn(first, ...turns[i]) });
  return picked.map((p) => p.rgb);
}

/**
 * Read the artwork's dominant colours.
 *
 * @param {string} src album art URL
 * @returns {Promise<{base:number[], accent:number[], glow:number[], swatches:number[][]}>} rgb triples
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

        resolve({
          base: vivify(base),
          accent: vivify(contrast),
          glow: vivify(ranked[0].rgb),
          swatches: swatchesOf(ranked),
        });
      } catch {
        resolve(FALLBACK); // tainted canvas — palette isn't worth breaking playback over
      }
    };
    img.src = src;
  });
}

export const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
export const DEFAULT_PALETTE = FALLBACK;
