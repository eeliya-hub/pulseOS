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
/**
 * How many entries one cache may hold.
 *
 * Nothing used to remove anything: entries expired on read but were never
 * deleted, so a cache whose keys don't repeat grew for the life of the process,
 * each entry holding a full API payload. The calendar's key carried a "now + 75
 * days" timestamp, which is different on every single call — so every refresh
 * added an entry that would never be read again, and the backend climbed until
 * it was killed.
 */
const MAX_ENTRIES = 250;

export function createCache(defaultTtlMs) {
  const store = new Map();

  /** Drop what has expired, then the oldest, until the cache is within its cap. */
  function prune(ttlMs) {
    if (store.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.at >= ttlMs) store.delete(key);
    }
    if (store.size <= MAX_ENTRIES) return;
    // Still over: evict oldest first.
    const byAge = [...store.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [key] of byAge.slice(0, store.size - MAX_ENTRIES)) store.delete(key);
  }

  return {
    async wrap(key, loader, ttlMs = defaultTtlMs) {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttlMs) {
        // Re-insert so recency ordering reflects use, not just creation.
        store.delete(key);
        store.set(key, hit);
        return hit.value;
      }

      try {
        const value = await loader();
        store.set(key, { value, at: Date.now() });
        prune(ttlMs);
        return value;
      } catch (err) {
        if (hit) return hit.value; // serve stale rather than fail
        throw err;
      }
    },

    /** Entries currently held — for diagnostics. */
    size: () => store.size,
    // Drop cached entries (all, or those whose key contains `prefix`) — used to
    // invalidate after a write so the next read is fresh.
    clear(prefix) {
      if (!prefix) return store.clear();
      for (const key of store.keys()) if (key.includes(prefix)) store.delete(key);
      return undefined;
    },
  };
}
