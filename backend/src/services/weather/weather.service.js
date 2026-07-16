import { createCache } from '../../utils/cache.js';
import { openWeatherProvider } from './openweather.provider.js';

/**
 * Weather business logic. Normalizes the raw OpenWeather payload into the shape
 * the frontend actually renders, so swapping providers later never touches the UI.
 */
const cache = createCache(15 * 60 * 1000); // 15 min — plenty fresh, stays under the free tier's limits

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => (deg == null ? '' : COMPASS[Math.round((deg % 360) / 45) % 8]);
const hhmm = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// Collapse an OpenWeather "main"/description string into one of the UI's 3 glyphs.
function iconKey(condition = '') {
  const c = condition.toLowerCase();
  if (/(rain|drizzle|shower|thunder|snow|sleet)/.test(c)) return 'rain';
  if (/(clear|sun)/.test(c)) return 'sun';
  return 'cloud';
}

export const weatherService = {
  async getCurrent(params) {
    return normalizeCurrent(await openWeatherProvider.getCurrent(params));
  },

  async getForecast(params) {
    const raw = await openWeatherProvider.getForecast(params);
    return {
      location: raw.city?.name,
      units: params.units ?? 'metric',
      points: (raw.list ?? []).map((p) => ({
        time: p.dt * 1000,
        temp: Math.round(p.main?.temp),
        condition: p.weather?.[0]?.main,
        icon: p.weather?.[0]?.icon,
      })),
    };
  },

  // Single call the dashboard uses: current conditions + 12h outlook + air, all
  // mapped to the exact shape WeatherCard/Home render. Cached per city+units.
  async getSummary(params) {
    const units = params.units ?? 'metric';
    const key = `summary:${params.city ?? `${params.lat},${params.lon}`}:${units}`;
    return cache.wrap(key, async () => {
      // OpenWeather reads anything after a comma as a country/state code, so
      // "Ashford, Kent" 404s. Fall back to just the first part (the town/city).
      const getCurrent = async () => {
        try {
          return await openWeatherProvider.getCurrent({ ...params, units });
        } catch (err) {
          const short = params.city?.split(',')[0]?.trim();
          if (short && short !== params.city) {
            return openWeatherProvider.getCurrent({ ...params, city: short, units });
          }
          throw err;
        }
      };
      const shortCity = params.city?.split(',')[0]?.trim() || params.city;
      const [current, forecast] = await Promise.all([
        getCurrent(),
        openWeatherProvider.getForecast({ ...params, city: shortCity, units }).catch(() => ({})),
      ]);

      const points = (forecast.list ?? []).slice(0, 12).map((p) => ({
        time: hhmm(p.dt * 1000),
        temp: Math.round(p.main?.temp),
        icon: iconKey(p.weather?.[0]?.main),
      }));

      const next24 = (forecast.list ?? []).slice(0, 8).map((p) => p.main?.temp).filter((t) => t != null);
      const high = next24.length ? Math.round(Math.max(...next24)) : Math.round(current.main?.temp_max);
      const low = next24.length ? Math.round(Math.min(...next24)) : Math.round(current.main?.temp_min);
      const pop = forecast.list?.[0]?.pop;

      const daily = dailyFromForecast(forecast.list ?? [], current);

      // Wind speed is m/s (metric) or mph (imperial). Present mph for the UI.
      const windRaw = current.wind?.speed ?? 0;
      const mph = Math.round(units === 'imperial' ? windRaw : windRaw * 2.237);

      // Air quality is best-effort — it needs coords and its own endpoint.
      let airQuality = null;
      if (current.coord) {
        const air = await openWeatherProvider
          .getAirQuality({ lat: current.coord.lat, lon: current.coord.lon })
          .catch(() => null);
        const pm25 = air?.list?.[0]?.components?.pm2_5;
        if (pm25 != null) airQuality = Math.round(pm25);
      }

      return {
        location: current.name,
        temperature: Math.round(current.main?.temp),
        condition: current.weather?.[0]?.description
          ? current.weather[0].description.replace(/\b\w/g, (m) => m.toUpperCase())
          : current.weather?.[0]?.main,
        high,
        low,
        feelsLike: Math.round(current.main?.feels_like),
        precipitation: pop != null ? `${Math.round(pop * 100)}%` : '—',
        wind: `${mph} mph ${compass(current.wind?.deg)}`.trim(),
        airQuality,
        sunrise: current.sys?.sunrise ? hhmm(current.sys.sunrise * 1000) : null,
        sunset: current.sys?.sunset ? hhmm(current.sys.sunset * 1000) : null,
        hourly: points,
        daily,
      };
    });
  },
};

// Aggregate the 3-hour forecast list into per-day high/low + a representative
// icon (whatever's forecast closest to midday). Returns up to 6 days incl. today.
function dailyFromForecast(list, current) {
  const byDay = new Map();
  for (const p of list) {
    const d = new Date(p.dt * 1000);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { key, hi: -Infinity, lo: Infinity, noon: null, noonGap: Infinity };
    const hi = p.main?.temp_max ?? p.main?.temp;
    const lo = p.main?.temp_min ?? p.main?.temp;
    if (hi != null) entry.hi = Math.max(entry.hi, hi);
    if (lo != null) entry.lo = Math.min(entry.lo, lo);
    const gap = Math.abs(d.getUTCHours() - 12);
    if (gap < entry.noonGap) {
      entry.noonGap = gap;
      entry.noon = p.weather?.[0]?.main;
    }
    byDay.set(key, entry);
  }

  const days = [...byDay.values()]
    .filter((e) => Number.isFinite(e.hi) && Number.isFinite(e.lo))
    .slice(0, 6)
    .map((e) => ({
      date: e.key,
      day: new Date(`${e.key}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }),
      hi: Math.round(e.hi),
      lo: Math.round(e.lo),
      icon: iconKey(e.noon),
    }));

  // Ensure "today" reflects the live current reading if the forecast list already rolled past it.
  const today = new Date().toISOString().slice(0, 10);
  if (days[0]?.date !== today && current?.main?.temp != null) {
    days.unshift({
      date: today,
      day: 'Today',
      hi: Math.round(current.main.temp_max ?? current.main.temp),
      lo: Math.round(current.main.temp_min ?? current.main.temp),
      icon: iconKey(current.weather?.[0]?.main),
    });
  } else if (days[0]) {
    days[0].day = 'Today';
  }

  return days.slice(0, 6);
}

function normalizeCurrent(raw) {
  return {
    location: raw.name,
    country: raw.sys?.country,
    temp: Math.round(raw.main?.temp),
    feelsLike: Math.round(raw.main?.feels_like),
    condition: raw.weather?.[0]?.main,
    description: raw.weather?.[0]?.description,
    icon: raw.weather?.[0]?.icon,
    humidity: raw.main?.humidity,
    windSpeed: raw.wind?.speed,
    observedAt: raw.dt ? raw.dt * 1000 : Date.now(),
  };
}
