/**
 * Ink — the record's colours released into dark water.
 *
 * Every sung line pushes a plume out from behind the sleeve; the beat gives
 * them a shove. Nothing is ever cleared: each frame lays a nearly-transparent
 * dark wash over the last one, so what has already been drawn fades over a few
 * seconds instead of vanishing, and the plumes leave the trails that make it
 * read as ink rather than as circles.
 *
 * That feedback is also why this is cheap — the diffusion is the fade, not a
 * simulation. A few dozen soft sprites a frame, drawn additively.
 */

const MAX_BLOBS = 30;
const FADE = 'rgba(4, 6, 13, 0.07)';

const rand = (a, b) => a + Math.random() * (b - a);

export default class Ink {
  static label = 'Ink';

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.trail = document.createElement('canvas');
    this.tctx = this.trail.getContext('2d');
    this.blobs = [];
    this.sprites = null;
    this.spriteKey = '';
    this.lastAccent = 0;
    this.lastBar = 0;
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = w;
    this.canvas.height = h;
    // Half resolution: every plume is soft, so the upscale costs nothing you can
    // see and saves three quarters of the fill.
    this.W = Math.max(2, Math.round(w * 0.5));
    this.H = Math.max(2, Math.round(h * 0.5));
    this.trail.width = this.W;
    this.trail.height = this.H;
    this.tctx.fillStyle = '#04060d';
    this.tctx.fillRect(0, 0, this.W, this.H);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /** One soft disc per palette colour, drawn once and stamped from then on. */
  buildSprites(palette) {
    const key = `${palette.base}|${palette.accent}|${palette.glow}`;
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    const size = 128;
    this.sprites = [palette.base, palette.accent, palette.glow].map((rgb) => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2)`);
      grad.addColorStop(0.45, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.06)`);
      grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      return c;
    });
  }

  spawn(count, strength) {
    const cx = this.W * 0.5;
    const cy = this.H * 0.48;
    for (let i = 0; i < count && this.blobs.length < MAX_BLOBS; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(6, 26) * (0.5 + strength);
      this.blobs.push({
        x: cx + Math.cos(angle) * rand(this.W * 0.06, this.W * 0.3),
        y: cy + Math.sin(angle) * rand(this.H * 0.06, this.H * 0.3),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.8,
        r: rand(0.07, 0.2) * Math.min(this.W, this.H) * (0.6 + strength * 0.8),
        age: 0,
        life: rand(3.4, 8.5),
        tint: (Math.random() * 3) | 0,
        spin: rand(-0.5, 0.5),
      });
    }
  }

  draw(p, palette, dt) {
    this.buildSprites(palette);
    const { W, H, tctx } = this;

    // A sung line releases ink; the downbeat gives it a push.
    if (p.accent > 0.82 && this.lastAccent <= 0.82) this.spawn(3 + Math.round(p.drive * 3), p.drive);
    if (p.barPulse > 0.9 && this.lastBar <= 0.9) this.spawn(1 + Math.round(p.drive * 2), p.drive * 0.7);
    this.lastAccent = p.accent;
    this.lastBar = p.barPulse;
    // Nothing playing, or an instrumental stretch: keep the water moving anyway.
    if (!this.blobs.length) this.spawn(4, 0.35);

    // The wash that turns motion into diffusion.
    tctx.globalCompositeOperation = 'source-over';
    tctx.fillStyle = FADE;
    tctx.fillRect(0, 0, W, H);

    tctx.globalCompositeOperation = 'lighter';
    const swell = 1 + p.pulse * 0.16 * p.drive;
    for (let i = this.blobs.length - 1; i >= 0; i -= 1) {
      const b = this.blobs[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.blobs.splice(i, 1);
        continue;
      }
      const t = b.age / b.life;
      // Out fast, then slowing, the way ink loses its push to the water.
      const ease = 1 - Math.pow(1 - t, 2.4);
      b.x += b.vx * dt * (1 - ease * 0.85);
      b.y += b.vy * dt * (1 - ease * 0.85) - dt * 5;
      b.vx += Math.sin(p.seconds * 0.7 + b.spin * 6) * dt * 5;
      b.vy += Math.cos(p.seconds * 0.5 + b.spin * 4) * dt * 4;

      const r = b.r * (0.35 + ease * 1.5) * swell;
      // In quickly, out slowly.
      const alpha = Math.min(1, t * 6) * Math.pow(1 - t, 1.5);
      tctx.globalAlpha = alpha * 0.5;
      const sprite = this.sprites[b.tint];
      tctx.drawImage(sprite, b.x - r, b.y - r, r * 2, r * 2);
    }
    tctx.globalAlpha = 1;
    tctx.globalCompositeOperation = 'source-over';

    this.ctx.drawImage(this.trail, 0, 0, this.canvas.width, this.canvas.height);
  }
}
