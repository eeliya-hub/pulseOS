/**
 * Resonance — the screen as a surface the record is vibrating.
 *
 * Three point sources sending rings across it, each drifting on its own slow
 * orbit. Where their crests agree the surface is bright; where they cancel it
 * goes dark, and the moiré between them is the figure. The beat shortens the
 * wavelength and lifts the amplitude, so a loud track breaks into finer, busier
 * structure and a quiet one settles into slow swells.
 *
 * Rings rather than straight waves, deliberately: plane waves at fixed angles
 * tile the screen and read as wallpaper. Circles crossing circles never repeat.
 *
 * Drawn into a buffer just over a quarter of the screen's size and scaled up: that
 * upscale is the blur, done by the GPU's bilinear filter for nothing, instead of
 * a full-screen `filter: blur()` re-rasterising every frame.
 *
 * Per pixel the cost is three square roots and three table reads. Nothing here
 * calls Math.sin in the inner loop — the wave is a lookup table indexed by a
 * fixed-point distance.
 */

// A third of the screen was costing more than it showed: the field is blurred
// by the upscale anyway, so the detail was being thrown away.
const SCALE = 0.28;
const LUT_BITS = 12;
const LUT_SIZE = 1 << LUT_BITS;
const LUT_MASK = LUT_SIZE - 1;

// sin over one turn, indexed by a fixed-point angle.
const SIN = new Float32Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i += 1) SIN[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);

const WAVES = [
  { angle: 0.0, speed: 0.13, scale: 1.0 },
  { angle: 1.9, speed: -0.09, scale: 1.37 },
  { angle: 3.6, speed: 0.17, scale: 0.78 },
  { angle: 5.1, speed: -0.06, scale: 1.71 },
];

export default class Resonance {
  static label = 'Resonance';

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d');
    this.ramp = new Uint8ClampedArray(256 * 3);
    this.rampKey = '';
    this.phases = WAVES.map(() => Math.random() * LUT_SIZE);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = w;
    this.canvas.height = h;
    this.W = Math.max(2, Math.round(w * SCALE));
    this.H = Math.max(2, Math.round(h * SCALE));
    this.buffer.width = this.W;
    this.buffer.height = this.H;
    this.image = this.bctx.createImageData(this.W, this.H);
    // Alpha is constant; fill it once rather than on every pixel of every frame.
    const d = this.image.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /** 256 steps from near-black through the album's colours. */
  buildRamp(palette) {
    const key = `${palette.base}|${palette.accent}|${palette.glow}`;
    if (key === this.rampKey) return;
    this.rampKey = key;
    const [b, a, g] = [palette.base, palette.accent, palette.glow];
    for (let i = 0; i < 256; i += 1) {
      const t = i / 255;
      let r;
      let gg;
      let bb;
      if (t < 0.62) {
        // The trough: the room. Nearly dark, only tinted by the record.
        const k = t / 0.62;
        const f = k * k * k;
        r = 4 + (b[0] * 0.34 - 4) * f;
        gg = 6 + (b[1] * 0.34 - 6) * f;
        bb = 13 + (b[2] * 0.34 - 13) * f;
      } else if (t < 0.9) {
        const k = (t - 0.62) / 0.28;
        r = b[0] * 0.34 + (a[0] * 0.8 - b[0] * 0.34) * k;
        gg = b[1] * 0.34 + (a[1] * 0.8 - b[1] * 0.34) * k;
        bb = b[2] * 0.34 + (a[2] * 0.8 - b[2] * 0.34) * k;
      } else {
        // The crest: a thin filament where the waves agree, and only there.
        const k = (t - 0.9) / 0.1;
        r = a[0] * 0.8 + (g[0] - a[0] * 0.8) * k;
        gg = a[1] * 0.8 + (g[1] - a[1] * 0.8) * k;
        bb = a[2] * 0.8 + (g[2] - a[2] * 0.8) * k;
      }
      this.ramp[i * 3] = r;
      this.ramp[i * 3 + 1] = gg;
      this.ramp[i * 3 + 2] = bb;
    }
  }

  draw(p, palette, dt) {
    this.buildRamp(palette);
    const { W, H, image, ramp } = this;
    const data = image.data;

    // Tighter rings when the track is driving, looser when it is not; the beat
    // rides on top so the surface tightens and releases in time.
    const tighten = 0.74 + p.drive * 0.46 + p.pulse * 0.16 * p.drive;
    const amplitude = 0.64 + p.pulse * 0.26 * (0.35 + p.drive) + p.accent * 0.16;
    const tempoScale = (p.tempo || 110) / 110;

    // Where the waves are coming from. Circular sources rather than straight
    // ones: plane waves at fixed angles tile the screen and read as wallpaper,
    // where rings crossing rings give the moiré that looks like a real surface
    // under load. The sources drift on their own slow, unrelated orbits so the
    // figure never settles into something you can watch repeat.
    const span = Math.min(W, H);
    const k = ((Math.PI * 2) / (span / (13 * tighten))) * (LUT_SIZE / (Math.PI * 2));
    const t = p.seconds;
    const sources = [
      { x: W * (0.5 + 0.30 * Math.cos(t * 0.061)), y: H * (0.5 + 0.26 * Math.sin(t * 0.048)), k: k * 1.0 },
      { x: W * (0.5 + 0.34 * Math.cos(t * 0.039 + 2.4)), y: H * (0.5 + 0.30 * Math.sin(t * 0.055 + 1.1)), k: k * 0.79 },
      { x: W * (0.5 + 0.26 * Math.cos(t * 0.071 + 4.2)), y: H * (0.5 + 0.34 * Math.sin(t * 0.033 + 3.3)), k: k * 1.27 },
    ];

    for (let i = 0; i < sources.length; i += 1) {
      // Kept inside one turn: the phase is used as a fixed-point index, and an
      // unbounded accumulator would eventually lose precision against the mask.
      this.phases[i] = (this.phases[i] + WAVES[i].speed * dt * LUT_SIZE * 0.5 * tempoScale) % LUT_SIZE;
      sources[i].phase = this.phases[i];
    }

    const s0 = sources[0];
    const s1 = sources[1];
    const s2 = sources[2];

    let o = 0;
    for (let y = 0; y < H; y += 1) {
      const y0 = y - s0.y;
      const y1 = y - s1.y;
      const y2 = y - s2.y;
      const yy0 = y0 * y0;
      const yy1 = y1 * y1;
      const yy2 = y2 * y2;

      for (let x = 0; x < W; x += 1) {
        const x0 = x - s0.x;
        const x1 = x - s1.x;
        const x2 = x - s2.x;
        const v =
          SIN[((Math.sqrt(x0 * x0 + yy0) * s0.k + s0.phase) | 0) & LUT_MASK] +
          SIN[((Math.sqrt(x1 * x1 + yy1) * s1.k + s1.phase) | 0) & LUT_MASK] +
          SIN[((Math.sqrt(x2 * x2 + yy2) * s2.k + s2.phase) | 0) & LUT_MASK];

        // −3..3 → 0..255, with the amplitude pushing the crests past the top of
        // the ramp so the brightest filaments bloom rather than merely brighten.
        let s = (v * 0.1667 + 0.5) * amplitude * 1.14;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        const r3 = ((s * 255) | 0) * 3;
        data[o] = ramp[r3];
        data[o + 1] = ramp[r3 + 1];
        data[o + 2] = ramp[r3 + 2];
        o += 4;
      }
    }

    this.bctx.putImageData(image, 0, 0);
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }
}
