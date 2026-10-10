import { useEffect, useState } from 'react';
import { getWeatherSummary } from '../services/api/weather.js';
import { useSettings } from './useSettings.js';

export function useWeather() {
  const { settings } = useSettings();
  const location = settings.location;
  const units = settings.units || 'metric';
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    getWeatherSummary(location, units)
      .then((data) => {
        if (isMounted) setWeather(data);
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
  }, [location, units]);

  return { weather, loading, error };
}
