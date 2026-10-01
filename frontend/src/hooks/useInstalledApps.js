import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';

/**
 * Every application on the machine, kept current.
 *
 * This used to be read once, when the Launchpad view first mounted, and never
 * again — which is fine for a page you open and close, and wrong for a
 * dashboard that stays up for days. Install something and it simply would not
 * be there: not missing for a moment, missing until the whole app was reloaded.
 * Brave web apps made it obvious, because installing one is a thing you do in
 * the middle of using the launchpad you then want to put it on.
 *
 * So it re-reads at the two moments it could have gone stale: when you come
 * back to the window, because installing happens somewhere else, and on demand
 * when something is about to show the list. The read is a directory walk and
 * one Spotlight query — cheap enough to do on a hunch, and far cheaper than
 * being wrong.
 */
const EMPTY = [];

export function useInstalledApps() {
  const [apps, setApps] = useState(EMPTY);

  const refresh = useCallback(
    () =>
      api.launch
        .apps()
        .then((d) => {
          const next = d.apps ?? EMPTY;
          // Replace only when something actually changed, so a refresh on every
          // focus doesn't re-render every tile that reads this.
          setApps((prev) =>
            prev.length === next.length && prev.every((a, i) => a.name === next[i].name && a.via === next[i].via)
              ? prev
              : next,
          );
          return next;
        })
        .catch(() => EMPTY),
    [],
  );

  useEffect(() => {
    refresh();
    // `focus` covers coming back from the installer; `visibilitychange` covers
    // the dashboard being on another desktop or behind a full-screen window,
    // where focus alone never fires.
    const onBack = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [refresh]);

  return { apps, refresh };
}
