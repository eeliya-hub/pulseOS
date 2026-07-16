import { useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';

// Map a UI scope to GNews params. Worldwide scopes omit `country` so the feed
// pulls from a wider mix of sources; 'local' pins to the chosen country.
const SCOPE_PARAMS = {
  top: { category: 'general' },
  world: { category: 'world' },
  business: { category: 'business' },
  technology: { category: 'technology' },
  sports: { category: 'sports' },
};

export function useNews({ scope, location }) {
  const [articles, setArticles] = useState([]);
  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const promise =
      scope === 'local'
        ? api.news.local(location)
        : api.news.headlines({ ...(SCOPE_PARAMS[scope] ?? SCOPE_PARAMS.top), lang: 'en', max: 10 });

    promise
      .then((d) => {
        if (!alive) return;
        setArticles(d.articles ?? []);
        setPlace(d.place ?? null);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [scope, location]);

  return { articles, place, loading, error, notConfigured: error?.code === 'NOT_CONFIGURED' };
}
