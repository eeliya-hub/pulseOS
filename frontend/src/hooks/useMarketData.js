import { useCallback, useEffect, useState } from 'react';
import { getMarketSnapshot, summarizeMarket } from '../services/api/markets.js';

export function useMarketData() {
  const [market, setMarket] = useState(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    getMarketSnapshot()
      .then((data) => {
        if (isMounted) {
          setMarket(data);
          setSummary(data.summary ?? '');
        }
      })
      .catch((caughtError) => {
        if (isMounted) setError(caughtError);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const requestSummary = useCallback(async () => {
    setSummarizing(true);
    const result = await summarizeMarket();
    setSummary(result);
    setSummarizing(false);
  }, []);

  return { market, summary, loading, summarizing, error, requestSummary };
}
