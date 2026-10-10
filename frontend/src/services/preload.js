import { warmCalendar } from '../hooks/useCalendarEvents.js';
import { warmMail } from '../hooks/useMail.js';
import { getTravelState } from '../hooks/useTravelStore.js';
import { flightKey } from '../hooks/useTripLive.js';
import { fetchNews, newsKey } from '../hooks/useNews.js';
import { getSettings } from '../hooks/useSettings.js';
import { whenPlayerSettled } from '../hooks/useSpotifyPlayer.js';
import { api } from './api/backendClient.js';
import { getWeatherSummary } from './api/weather.js';
import { placePhotoUrl } from '../utils/places.js';
import { warm } from './warmCache.js';

// Race a promise against a timeout so one slow/unreachable source can't stall
// the whole launch sequence.
const withTimeout = (promise, ms) =>
  Promise.race([Promise.resolve(promise), new Promise((resolve) => setTimeout(resolve, ms))]);

const settle = (promises) => Promise.allSettled(promises);

/** Pull an image into the browser cache; failures are not worth knowing about. */
function prefetch(url) {
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = url;
  });
}

/** Every picture the open trip will paint: where you're staying, and each stop. */
function tripPhotos(trip) {
  if (!trip) return [];
  const out = [];
  const take = (photos) => {
    const url = placePhotoUrl((photos ?? [])[0], 640);
    if (url) out.push(url);
  };
  take(trip.stay?.photos);
  for (const day of trip.itinerary ?? []) {
    for (const item of day.items ?? []) take(item.photos);
  }
  return out.slice(0, 24); // a launch sequence, not a whole trip's gallery
}

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
  const tape = s.ticker ?? [];
  // Matches the Markets view's own persisted choice.
  const newsScope = localStorage.getItem('pulse.news.scope') || 'top';
  const follows = s.follows ?? [];

  // The open trip, read straight off the store rather than a mounted hook.
  const travel = getTravelState();
  const trip = travel.trips.find((t) => t.id === travel.activeId) ?? travel.trips[0] ?? null;

  const tasks = [
    ['Calendar', () => warmCalendar()],
    // The Life Hub's mail card, so it opens on real figures rather than a
    // skeleton. Headers only — no bodies are fetched before they are asked for.
    ['Mail', () => warmMail()],
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
          // Keyed on the symbols, so a tape that has been edited warms the
          // list it will actually show rather than the one it used to.
          warm(`stocks:ticker:${tape.join(',')}`, () => api.stocks.ticker(tape)),
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
      'Travel',
      // The flight lookup is several hops deep — a route database, then the
      // live ADS-B feeds, then a rate-limited timetable — and the place photos
      // are a search followed by an image fetch. All of it used to happen when
      // the view opened, which is exactly when there is someone watching.
      () =>
        settle([
          ...(trip?.flights ?? [])
            .filter((f) => (f.code || '').trim())
            .map((f) => {
              const code = f.code.trim().toUpperCase();
              const date = (f.date || '').trim();
              return warm(flightKey(code, date), () => api.travel.flight(code, date || undefined)).then(
                // Every picture the card draws, as bytes rather than as URLs
                // that point at them. The crest is the one that was arriving
                // late: it is served from Firebase Storage, which is slower to
                // first byte than anything else on the card, so it used to pop
                // in well after the flight around it had settled.
                (data) =>
                  Promise.all([
                    prefetch(data?.airline?.photo?.url),
                    prefetch(api.travel.airlineArtUrl(data?.airline?.art)),
                  ]),
              );
            }),
          trip?.destination?.currency?.code && trip.destination.currency.code !== (trip.homeCurrency || 'GBP')
            ? warm(`travel:fx:${trip.homeCurrency || 'GBP'}:${trip.destination.currency.code}`, () =>
                api.travel.fx(trip.homeCurrency || 'GBP', trip.destination.currency.code),
              )
            : null,
          // By coordinates, which getWeatherSummary doesn't take — this warms
          // the backend's own cache, which is what the view reads through.
          trip?.destination?.lat != null
            ? warm(`travel:weather:${trip.destination.lat},${trip.destination.lon}`, () =>
                api.weather.summary({
                  lat: trip.destination.lat,
                  lon: trip.destination.lon,
                  units: getSettings().units || 'metric',
                }),
              )
            : null,
          // Hotel and itinerary pictures, fetched as images so they are in the
          // browser's cache and paint instantly rather than popping in.
          ...tripPhotos(trip).map((url) => prefetch(url)),
        ]),
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
