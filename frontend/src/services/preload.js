import { warmCalendar } from '../hooks/useCalendarEvents.js';
import { fetchNews, newsKey } from '../hooks/useNews.js';
import { getSettings } from '../hooks/useSettings.js';
import { whenPlayerSettled } from '../hooks/useSpotifyPlayer.js';
import { api } from './api/backendClient.js';
import { getWeatherSummary } from './api/weather.js';
import { warm } from './warmCache.js';

// Race a promise against a timeout so one slow/unreachable source can't stall
// the whole launch sequence.
const withTimeout = (promise, ms) =>
  Promise.race([Promise.resolve(promise), new Promise((resolve) => setTimeout(resolve, ms))]);

const settle = (promises) => Promise.allSettled(promises);

/**
 * Warm the app's data on launch so no view ever has to show a spinner: the
 * calendar (shared store), weather (module cache), news and the Spotify token
 * (backend caches), and — through warmCache — the exact payloads the Music,
 * Sports and Stocks panels render, so they mount with content already in hand.
 *
 * Reports progress 0→1 as each task settles.
 */
export async function runPreload(onProgress = () => {}) {
  const s = getSettings();
  const location = s.location || 'London';
  const symbols = s.stocks ?? [];
  // Matches the Markets view's own persisted choice.
  const newsScope = localStorage.getItem('pulse.news.scope') || 'top';
  const follows = s.follows ?? [];

  const tasks = [
    ['Calendar', () => warmCalendar()],
    ['Weather', () => getWeatherSummary(location)],
    [
      'News',
      // The scope the Markets view will actually open on — warming a different
      // request would fill the backend's cache and still leave the view
      // fetching. Local is warmed too since it's one click away.
      () =>
        settle([
          warm(newsKey(newsScope), () => fetchNews(newsScope, location)),
          warm(newsKey('local', location), () => fetchNews('local', location)),
        ]),
    ],
    [
      'Markets',
      () =>
        settle([
          warm('stocks:ticker', () => api.stocks.ticker()),
          symbols.length ? warm(`stocks:${symbols.join(',')}`, () => api.stocks.quotes(symbols)) : null,
        ]),
    ],
    [
      'Sport',
      // Every followed team, not just the one that happens to open first —
      // clicking between them should be instant too.
      () =>
        settle(
          follows.map((f) =>
            warm(`sports:${f.id}`, () => api.sports.team(f.team, f.sport, f.leagueId, f.leagueLabel)),
          ),
        ),
    ],
    [
      'Music',
      () =>
        settle([
          api.music.token(),
          api.music.nowPlaying(),
          warm('music:playlists', () => api.music.playlists()),
          warm('music:recent', () => api.music.recentlyPlayed()),
          // The Web Playback SDK's own handshake, so the view doesn't open on
          // "Connecting to Spotify…". Bounded by this task's timeout.
          whenPlayerSettled(),
        ]),
    ],
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
