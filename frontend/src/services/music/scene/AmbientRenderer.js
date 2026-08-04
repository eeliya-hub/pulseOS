import { rgba } from '../albumPalette.js';

/**
 * Draws the atmosphere: a blurred nebula with stars over it.
 *
 * The nebula is rendered into a canvas a fraction of the screen's size and then
 * scaled up. That upscale IS the blur, done by the GPU's bilinear filter for
 * free — a real blur, without `filter: blur()` forcing a full-screen
 * re-rasterisation sixty times a second.
 *
 * Stars are drawn at full resolution on top. Sharp points over a soft field is
 * what makes it read as depth rather than as a gradient.
 */
const SPRITE = 192;
const MAX_DPR = 1;

// Nebula buffer size relative to the canvas. Smaller is blurrier and cheaper;
// below about an eighth the clouds start to visibly quantise as they drift.
const NEBULA_SCALE = 0.16;

// Three passes per cloud: halo, body, core. One pass looks like a flat disc.
const LAYERS = [
  { scale: 1, alpha: 0.42 },
  { scale: 0.54, alpha: 0.34 },
  { scale: 0.24, alpha: 0.26 },
];

export class AmbientRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nebula = document.createElement('canvas');
    this.nebulaCtx = this.nebula.getContext('2d');
    this.cacheKey = '';
    this.resize();
  }

  resize() {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.W = this.canvas.clientWidth;
    this.H = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.W * dpr));
    this.canvas.height = Math.max(1, Math.round(this.H * dpr));
    this.nebula.width = Math.max(1, Math.round(this.W * NEBULA_SCALE));
    this.nebula.height = Math.max(1, Math.round(this.H * NEBULA_SCALE));
    this.dpr = dpr;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  buildSprites(palette) {
    const key = Object.values(palette).map((c) => c.map(Math.round).join()).join('|');
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    const make = (rgb, core) => {
      const off = document.createElement('canvas');
      off.width = SPRITE;
      off.height = SPRITE;
      const c = off.getContext('2d');
      const g = c.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      g.addColorStop(0, rgba(rgb, core));
      g.addColorStop(0.32, rgba(rgb, core * 0.44));
      g.addColorStop(0.62, rgba(rgb, core * 0.14));
      g.addColorStop(1, rgba(rgb, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, SPRITE, SPRITE);
      return off;
    };
    this.sprites = {};
    for (const [name, rgb] of Object.entries(palette)) this.sprites[name] = make(rgb, 0.85);
    this.starGlow = (() => {
      const off = document.createElement('canvas');
      off.width = SPRITE;
      off.height = SPRITE;
      const c = off.getContext('2d');
      const g = c.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      g.addColorStop(0, rgba(palette.air, 0.8));
      g.addColorStop(0.14, rgba(palette.air, 0.22));
      g.addColorStop(0.34, rgba(palette.air, 0.05));
      g.addColorStop(1, rgba(palette.air, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, SPRITE, SPRITE);
      return off;
    })();
  }

  /** @param {import('./AmbientScene.js').AmbientScene} scene */
  draw(scene) {
    const { ctx, W, H } = this;
    if (!W || !H || !scene.palette) return;
    this.buildSprites(scene.palette);

    this.drawNebula(scene);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, W, H);

    // The blurred nebula, scaled up from its small buffer.
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.nebula, 0, 0, W, H);

    this.drawStars(scene);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const diag = Math.hypot(W, H);
    const vig = ctx.createRadialGradient(W * 0.45, H * 0.5, Math.min(W, H) * 0.45, W * 0.45, H * 0.5, diag * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,3,8,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Clouds, into the small buffer that gets blurred by being scaled up. */
  drawNebula(scene) {
    const c = this.nebulaCtx;
    const w = this.nebula.width;
    const h = this.nebula.height;
    const diag = Math.hypot(w, h);

    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';

    for (const cloud of scene.clouds) {
      const sprite = this.sprites[cloud.tone] ?? this.sprites.key;
      // Deeper clouds parallax less, so the field has front and back.
      const cx = (cloud.cx + scene.camX * (1 - cloud.depth)) * w;
      const cy = (cloud.cy + scene.camY * (1 - cloud.depth)) * h;
      for (const layer of LAYERS) {
        const d = diag * cloud.size * cloud.scale * layer.scale;
        c.globalAlpha = 0.38 * layer.alpha * cloud.glow;
        c.drawImage(sprite, cx - d / 2, cy - d / 2, d, d);
      }
    }
  }

  /** Stars, sharp, at full resolution. */
  drawStars(scene) {
    const { ctx, W, H } = this;
    const { air, bloom } = scene.palette;
    // The field's centre sits off the left edge, so the dense core is behind the
    // artwork and the sparse outer arms fall where the lyrics sit.
    const ox = W * 0.28;
    const oy = H * 0.52;
    const reach = Math.hypot(W, H) * 0.5;

    for (const s of scene.stars) {
      if (s.brightness < 0.02) continue;
      const a = s.angle + scene.spin * s.depth;
      const x = ox + Math.cos(a) * s.radius * reach + scene.camX * W * s.depth * 2;
      const y = oy + Math.sin(a) * s.radius * reach * 0.72 + scene.camY * H * s.depth * 2;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;

      const r = s.size * (0.5 + s.depth * 0.5);
      // Only the brightest carry a halo — haloing everything is what turns a
      // star field into fog.
      if (s.brightness > 0.42 && r > 0.9) {
        const d = r * 22;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (s.brightness - 0.42) * 0.95;
        ctx.drawImage(this.starGlow, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = s.brightness;
      ctx.fillStyle = rgba(s.warm > 0.72 ? bloom : air, 0.55 + s.warm * 0.45);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
