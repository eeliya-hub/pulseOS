import { useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { peek, put } from '../services/warmCache.js';

// Map a UI scope to GNews params. Worldwide scopes omit `country` so the feed
// pulls from a wider mix of sources; 'local' pins to the chosen country.
export const SCOPE_PARAMS = {
  top: { category: 'general' },
  world: { category: 'world' },
  business: { category: 'business' },
  technology: { category: 'technology' },
  sports: { category: 'sports' },
};

/** The one request a scope maps to — shared with the launch preloader. */
export const newsKey = (scope, location) => (scope === 'local' ? `news:local:${location}` : `news:${scope}`);
export const fetchNews = (scope, location) =>
  scope === 'local'
    ? api.news.local(location)
    : api.news.headlines({ ...(SCOPE_PARAMS[scope] ?? SCOPE_PARAMS.top), lang: 'en', max: 10 });

export function useNews({ scope, location }) {
  const warmed = peek(newsKey(scope, location));
  const [articles, setArticles] = useState(() => warmed?.articles ?? []);
  const [place, setPlace] = useState(() => warmed?.place ?? null);
  const [loading, setLoading] = useState(() => !warmed);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    // Whatever the launch screen already fetched paints first; the refresh
    // below replaces it without the list ever being empty.
    const cached = peek(newsKey(scope, location));
    if (cached) {
      setArticles(cached.articles ?? []);
      setPlace(cached.place ?? null);
    }
    setLoading(!cached);
    setError(null);

    fetchNews(scope, location)
      .then((d) => {
        if (!alive) return;
        put(newsKey(scope, location), d);
        setArticles(d.articles ?? []);
        setPlace(d.place ?? null);
      })
      .catch((e) => alive && !cached && setError(e))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [scope, location]);

  return { articles, place, loading, error, notConfigured: error?.code === 'NOT_CONFIGURED' };
}
