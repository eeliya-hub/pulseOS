import { AmbientScene } from './AmbientScene.js';

/** One ambient scene for the app, stepped once per frame. */
export const scene = new AmbientScene();

let steppedAt = -1;

/**
 * Advance the atmosphere. Idempotent per frame so the canvas and any DOM
 * consumer see the same state regardless of which asks first.
 */
export function stepScene({ artwork, dt, stamp }) {
  if (stamp === steppedAt) return scene;
  steppedAt = stamp;
  scene.update(artwork, dt);
  return scene;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__pulseScene = scene;
}

export { AmbientScene };
export { AmbientRenderer as SceneRenderer } from './AmbientRenderer.js';
