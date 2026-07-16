import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

const BASE = 'https://api.openweathermap.org/data/2.5';
const INTEGRATION = 'OpenWeather';

function requireKey() {
  const key = config.weather.openWeatherKey;
  if (!key) throw ApiError.notConfigured(INTEGRATION);
  return key;
}

function locationParams({ city, lat, lon }) {
  if (lat != null && lon != null) return `lat=${lat}&lon=${lon}`;
  if (city) return `q=${encodeURIComponent(city)}`;
  throw ApiError.badRequest('Provide a `city` or `lat`+`lon` query parameter.');
}

export const openWeatherProvider = {
  async getCurrent({ city, lat, lon, units = 'metric' }) {
    const key = requireKey();
    const url = `${BASE}/weather?${locationParams({ city, lat, lon })}&units=${units}&appid=${key}`;
    return fetchJson(url, { integration: INTEGRATION });
  },

  async getForecast({ city, lat, lon, units = 'metric' }) {
    const key = requireKey();
    const url = `${BASE}/forecast?${locationParams({ city, lat, lon })}&units=${units}&appid=${key}`;
    return fetchJson(url, { integration: INTEGRATION });
  },

  // Air pollution needs coordinates (returned by /weather as `coord`).
  async getAirQuality({ lat, lon }) {
    const key = requireKey();
    const url = `${BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${key}`;
    return fetchJson(url, { integration: INTEGRATION });
  },
};
