import Ink from './Ink.js';
import Lattice from './Lattice.js';
import Resonance from './Resonance.js';

/**
 * The three rooms the immersive player can be in.
 *
 * Each is a class taking a canvas, with `resize()` and
 * `draw(pulse, palette, dt)`. None of them owns a loop or listens to anything;
 * the view drives them, so switching is a matter of throwing one away and
 * building the next against the same canvas.
 */
export const VISUALS = [
  { id: 'resonance', label: 'Resonance', Renderer: Resonance },
  { id: 'ink', label: 'Ink', Renderer: Ink },
  { id: 'lattice', label: 'Lattice', Renderer: Lattice },
];

export const DEFAULT_VISUAL = 'resonance';

export function rendererFor(id) {
  return (VISUALS.find((v) => v.id === id) ?? VISUALS[0]).Renderer;
}
