/**
 * Lattice — a sheet of wire the record is pushing from behind.
 *
 * A field of hairlines, flat until the music touches it. Every downbeat sends a
 * ring out from the middle; a sung line sends a stronger one. Between them the
 * whole sheet carries a slow standing wave running at the track's tempo, so it
 * is never quite still.
 *
 * This is the sharp one of the three — it keeps the hairline vocabulary the rest
 * of Pulse OS is drawn in, where Resonance and Ink are soft. Lines are drawn at
 * full resolution because their crispness is the whole point.
 */

const LINES = 46;
const POINTS = 84;
const MAX_RINGS = 7;

export default class Lattice {
  static label = 'Lattice';

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rings = [];
    this.lastAccent = 0;
    this.lastBar = 0;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.W = w;
    this.H = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  push(strength) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ age: 0, strength });
  }

  draw(p, palette, dt) {
    const { ctx, W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // The room behind the wire.
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, W, H);

    if (p.accent > 0.82 && this.lastAccent <= 0.82) this.push(1);
    if (p.barPulse > 0.9 && this.lastBar <= 0.9) this.push(0.55);
    this.lastAccent = p.accent;
    this.lastBar = p.barPulse;

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      this.rings[i].age += dt;
      if (this.rings[i].age > 3.2) this.rings.splice(i, 1);
    }

    const cx = W * 0.5;
    const cy = H * 0.46;
    const diag = Math.hypot(W, H) * 0.5;
    const spacing = H / (LINES - 1);
    const step = W / (POINTS - 1);

    // How far a line can be pushed. A quiet record barely disturbs the sheet.
    const reach = spacing * (0.95 + p.drive * 2.9);
    // The standing wave underneath, running at the track's tempo.
    const waveK = (Math.PI * 2) / (W / (2.2 + p.drive * 2.4));
    const waveT = p.beats * Math.PI * 0.5;

    const [r, g, b] = palette.accent;
    const [gr, gg, gb] = palette.glow;

    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';

    for (let li = 0; li < LINES; li += 1) {
      const baseY = li * spacing;
      // Lines nearer the middle of the sheet are pushed hardest, so the field
      // reads as a surface with an edge rather than as a repeating pattern.
      const centred = 1 - Math.abs(baseY - cy) / (H * 0.75);
      const weight = Math.max(0.12, centred);

      ctx.beginPath();
      let lift = 0;
      for (let pi = 0; pi < POINTS; pi += 1) {
        const x = pi * step;
        const dx = x - cx;
        const dy = baseY - cy;
        const d = Math.hypot(dx, dy);

        // Every ring that has reached this point, and not yet passed it by.
        let ring = 0;
        for (let ri = 0; ri < this.rings.length; ri += 1) {
          const rg = this.rings[ri];
          const front = rg.age * diag * 0.62;
          const edge = (d - front) / (diag * 0.13);
          if (edge > -2.6 && edge < 2.6) {
            const decay = Math.max(0, 1 - rg.age / 3.2);
            ring += Math.cos(edge * 1.5) * Math.exp(-edge * edge * 0.9) * decay * decay * rg.strength;
          }
        }

        const standing = Math.sin(x * waveK + waveT + baseY * 0.004) * (0.22 + p.pulse * 0.45);
        const y = baseY + (ring * 1.5 + standing) * reach * weight;
        if (pi === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        lift = Math.max(lift, Math.abs(ring));
      }

      // A line that is being pushed lights up; the rest stay structural.
      const hot = Math.min(1, lift * 1.1);
      const alpha = (0.14 + weight * 0.34 + hot * 0.7) * (0.6 + p.drive * 0.4);
      ctx.strokeStyle = hot > 0.04
        ? `rgba(${Math.round(r + (gr - r) * hot)}, ${Math.round(g + (gg - g) * hot)}, ${Math.round(b + (gb - b) * hot)}, ${alpha.toFixed(3)})`
        : `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      ctx.stroke();
    }
  }
}
