import { warmCalendar } from '../hooks/useCalendarEvents.js';
import { getSettings } from '../hooks/useSettings.js';
import { api } from './api/backendClient.js';
import { getWeatherSummary } from './api/weather.js';

// Race a promise against a timeout so one slow/unreachable source can't stall
// the whole launch sequence.
const withTimeout = (promise, ms) =>
  Promise.race([Promise.resolve(promise), new Promise((resolve) => setTimeout(resolve, ms))]);

/**
 * Warm the app's data on launch so switching tabs feels instant: calendar
 * (shared store), weather (module cache), news, markets and music (backend
 * caches). Reports progress 0→1 as each task settles.
 */
export async function runPreload(onProgress = () => {}) {
  const s = getSettings();
  const location = s.location || 'London';

  const tasks = [
    ['Calendar', () => warmCalendar()],
    ['Weather', () => getWeatherSummary(location)],
    ['News', () => Promise.allSettled([api.news.headlines({}), api.news.local(location)])],
    ['Markets', () => Promise.allSettled([api.stocks.ticker(), api.stocks.quotes(s.stocks ?? [])])],
    ['Music', () => Promise.allSettled([api.music.token(), api.music.nowPlaying(), api.music.playlists()])],
  ];

  let done = 0;
  const total = tasks.length;
  onProgress(0.04, 'Waking up…');

  await Promise.all(
    tasks.map(async ([name, run]) => {
      try {
        await withTimeout(run(), 9000);
      } catch {
        /* a failed source shouldn't block launch */
      }
      done += 1;
      onProgress(Math.max(0.04, done / total), name);
    }),
  );
}
