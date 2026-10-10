/**
 * How much the app moves.
 *
 * Two things can ask it to keep still: the system's own "reduce motion", and
 * the switch in Settings. CSS hears both through styles.css; the few movements
 * driven from script — the light running the baseline — ask here.
 */

/** Whether to hold still. */
export const prefersLessMotion = () =>
  document.documentElement.dataset.motion === 'reduced' ||
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Apply the Settings switch to the whole document. */
export function applyMotion(reduced) {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}
