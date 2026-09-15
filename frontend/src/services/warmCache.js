// Data warmed during the launch screen, kept so a view can paint with real
// content on its very first frame.
//
// The preloader used to warm only the *backend's* caches: a view still mounted
// empty, fired its own fetch and showed "Loading…" until the round trip came
// back. Fast, but still a flash of nothing every time you opened a tab. Holding
// the payloads here removes that — a view seeds its state from this map, then
// refreshes in the background and overwrites it.

const store = new Map();

// Old enough that showing it first would be misleading rather than seamless.
const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Run a fetch and remember its result under `key`.
 * Failures are not stored — a view falls back to its own fetch.
 */
export function warm(key, run) {
  return Promise.resolve()
    .then(run)
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    });
}

/** Synchronously read a warmed value; `undefined` when there isn't a fresh one. */
export function peek(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > MAX_AGE_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/** Replace a warmed value from a view that has just fetched a newer one. */
export function put(key, value) {
  store.set(key, { value, at: Date.now() });
}
