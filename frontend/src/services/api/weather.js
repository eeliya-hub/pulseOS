import { api } from './backendClient.js';

// Short module cache so weather is instant across tab switches (and reused from
// the launch preloader) without refetching every mount.
const cache = new Map(); // city → { at, data }
const TTL = 15 * 60 * 1000;

// Live OpenWeather data via the backend. Pass the user's location (city) if set;
// falls back to London. If the backend has no OPENWEATHER_API_KEY (or the call
// fails), we return the sample payload below so the dashboard still looks alive.
export async function getWeatherSummary(city) {
  const key = (city?.trim() || 'London').toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const data = await api.weather.summary({ city: city?.trim() || 'London' });
    if (data && data.temperature != null) {
      cache.set(key, { at: Date.now(), data });
      return data;
    }
  } catch {
    /* fall through to sample data */
  }
  return sampleWeather();
}

function sampleWeather() {

  return {
    location: 'London',
    temperature: 18,
    condition: 'Soft rain clearing',
    high: 21,
    low: 12,
    feelsLike: 17,
    airQuality: 24,
    precipitation: '38%',
    wind: '9 mph SW',
    sunrise: '04:43',
    sunset: '21:16',
    hourly: [
      { time: '08:00', temp: 16, icon: 'rain' },
      { time: '09:00', temp: 16, icon: 'rain' },
      { time: '10:00', temp: 17, icon: 'cloud' },
      { time: '11:00', temp: 18, icon: 'cloud' },
      { time: '12:00', temp: 19, icon: 'cloud' },
      { time: '13:00', temp: 20, icon: 'sun' },
      { time: '14:00', temp: 21, icon: 'sun' },
      { time: '15:00', temp: 21, icon: 'sun' },
      { time: '16:00', temp: 20, icon: 'cloud' },
      { time: '17:00', temp: 19, icon: 'cloud' },
      { time: '18:00', temp: 18, icon: 'cloud' },
      { time: '19:00', temp: 16, icon: 'rain' },
    ],
  };
}
