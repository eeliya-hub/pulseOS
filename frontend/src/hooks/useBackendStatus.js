import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';

/**
 * What the backend can reach, and how much of today's AI allowance is spent.
 *
 * Shared, and kept for half a minute: Settings asks from several sections at
 * once, and the answer only changes when someone edits backend/.env.
 */
const FRESH_FOR = 30_000;
let cache = null; // { at, loading, integrations, usage, failed }
let inflight = null;

function load() {
  inflight ??= Promise.all([api.status().catch(() => null), api.usage().catch(() => null)])
    .then(([status, usage]) => {
      cache = {
        at: Date.now(),
        loading: false,
        integrations: status?.integrations ?? null,
        usage: usage?.ai ?? null,
        // A request that never came back says nothing about how things are set
        // up — only that the backend couldn't be reached to ask.
        failed: !status,
      };
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useBackendStatus() {
  const [state, setState] = useState(() => cache ?? { loading: true, integrations: null, usage: null, failed: false });

  const refresh = useCallback(() => {
    cache = null;
    setState((s) => ({ ...s, loading: true }));
    return load().then(setState);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!cache || Date.now() - cache.at > FRESH_FOR) {
      load().then((next) => alive && setState(next));
    }
    return () => {
      alive = false;
    };
  }, []);

  return { ...state, refresh };
}
