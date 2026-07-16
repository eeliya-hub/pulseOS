/**
 * Tiny in-memory TTL cache.
 *
 * - Serves a cached value while it's younger than `ttlMs` (no upstream call).
 * - On a cache miss it calls the loader and stores the result.
 * - If the loader THROWS on a miss but we have a stale value, we serve the stale
 *   value instead of failing — this is what keeps a rate-limited/flaky provider
 *   (e.g. GDELT's 1-req/5s limit) from breaking the UI.
 *
 * Swap for Redis later without changing call sites.
 */
export function createCache(defaultTtlMs) {
  const store = new Map();

  return {
    async wrap(key, loader, ttlMs = defaultTtlMs) {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;

      try {
        const value = await loader();
        store.set(key, { value, at: Date.now() });
        return value;
      } catch (err) {
        if (hit) return hit.value; // serve stale rather than fail
        throw err;
      }
    },
    // Drop cached entries (all, or those whose key contains `prefix`) — used to
    // invalidate after a write so the next read is fresh.
    clear(prefix) {
      if (!prefix) return store.clear();
      for (const key of store.keys()) if (key.includes(prefix)) store.delete(key);
      return undefined;
    },
  };
}
