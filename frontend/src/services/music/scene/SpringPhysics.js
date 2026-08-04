// Motion primitives for the scene.
//
// Everything visible is driven by a spring rather than an interpolation, because
// the difference is exactly what the eye reads as "alive": a lerp arrives at its
// target and stops dead, while a spring accelerates, overshoots a little and
// settles. Hits are applied as VELOCITY, not as a new target — that is what a
// physical impulse is, and it is why a kick feels like something was struck
// rather than something was set to a new value.

/** Semi-implicit Euler mass-spring-damper. Stable at any frame rate we hit. */
export class Spring {
  /**
   * @param {object} p
   * @param {number} [p.stiffness] higher = snappier
   * @param {number} [p.damping]   lower  = more overshoot; ~2·√(k·m) is critical
   * @param {number} [p.mass]
   * @param {number} [p.value]     initial position (also the initial target)
   */
  constructor({ stiffness = 120, damping = 16, mass = 1, value = 0 } = {}) {
    this.k = stiffness;
    this.c = damping;
    this.m = mass;
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  /** Move the rest position. The spring travels there under its own physics. */
  to(target) {
    this.target = target;
    return this;
  }

  /** Strike it. Velocity injection = an impulse, which overshoots then settles. */
  kick(strength) {
    this.velocity += strength;
    return this;
  }

  /** Teleport, no physics — for resets and track changes. */
  jump(value) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    return this;
  }

  update(dt) {
    // Sub-step long frames so a stalled tab can't blow the integrator up.
    const steps = dt > 1 / 40 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const force = (this.target - this.value) * this.k - this.velocity * this.c;
      this.velocity += (force / this.m) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Frame-rate independent exponential approach. For values that shouldn't spring. */
export const damp = (current, target, tau, dt) =>
  tau <= 0 ? target : current + (target - current) * (1 - Math.exp(-dt / tau));

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Cheap smooth noise: summed sines at incommensurate rates. Good enough for
 * drift and float, and far cheaper than real Perlin for the handful of channels
 * that need it.
 */
export const wobble = (t, seed = 0) =>
  Math.sin(t * 0.31 + seed) * 0.5 + Math.sin(t * 0.13 + seed * 2.7) * 0.35 + Math.sin(t * 0.07 + seed * 5.1) * 0.15;
