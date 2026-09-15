import { allDayKey, dateKey, getLifeData, keyToDate, lifeActions, occursOn } from '../../hooks/useLifeData.js';
import { getSettings } from '../../hooks/useSettings.js';
import { addPackingItem, getTravelState, setPackingDone } from '../../hooks/useTravelStore.js';
import {
  chooseKeeper,
  clockOf,
  distinctEvents,
  eventWindow,
  findDuplicate,
  narrowEvents,
  normalizeDate,
  titleKey,
} from './calendarInput.js';
import { NEWS_CHANNELS, getLiveNews, setChannel, setImmersive } from '../news/liveChannels.js';
import { goToView } from '../ui/navigation.js';
import { afterSpeech, endSessionAfterSpeech } from '../ui/afterSpeech.js';
import { spotifyPlayer } from '../../hooks/useSpotifyPlayer.js';
import { api } from '../api/backendClient.js';
import { getWeatherSummary } from '../api/weather.js';

const firstTime = (t) => (t || '').match(/\d{1,2}:\d{2}/)?.[0] || '';
const fullDay = (key) => keyToDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const clockTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// Guard the music tools: return a friendly error object when the shared Spotify
// player can't play yet (not connected / not Premium / still starting up).
function musicNotReady() {
  const { status } = spotifyPlayer.getSnapshot();
  if (status === 'ready') return null;
  if (status === 'not-premium') return { error: 'In-app playback needs Spotify Premium.' };
  if (status === 'needs-auth' || status === 'error') {
    return { error: 'Spotify isn’t connected. Open the Music tab and connect Spotify first.' };
  }
  return { error: 'The Spotify player is still starting up — try again in a moment.' };
}

const ordinal = (n) => {
  if (n == null) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// Compress one followed team's card into a compact, accurate summary for the model.
/**
 * The slice of a league table worth showing: the top of it, plus where the
 * followed team actually sits. A plain top-six is no use to someone in ninth —
 * it leaves their own team off the card entirely.
 */
function standingsWindow(standings, size = 6) {
  const rows = standings ?? [];
  if (rows.length <= size) return rows.map(toTableRow);

  const meIndex = rows.findIndex((r) => r.me);
  if (meIndex < 0 || meIndex < size) return rows.slice(0, size).map(toTableRow);

  // Top three for context, then the team with a neighbour either side.
  const near = rows.slice(Math.max(0, meIndex - 1), meIndex + 2);
  const picked = [...rows.slice(0, size - near.length), ...near];
  return picked.map(toTableRow);
}

const toTableRow = (row) => ({
  rank: row.rank,
  team: row.team ?? row.name,
  points: row.points,
  played: row.played ?? null,
  record: row.record ?? null,
  me: Boolean(row.me),
});

function summarizeSport(follow, card) {
  if (!card || card.found === false) {
    return { team: follow.team, sport: follow.sport, note: 'No live data right now (may be off-season).' };
  }
  if (card.kind === 'f1') {
    return {
      sport: 'Formula 1',
      nextRace: card.fixture
        ? `${card.fixture.name} — ${card.fixture.date}${card.fixture.time ? ` ${card.fixture.time}` : ''}${card.fixture.venue ? ` (${card.fixture.venue})` : ''}`
        : null,
      lastRace: card.lastRace
        ? {
            race: card.lastRace.name,
            podium: (card.lastRace.podium ?? []).map((p) => `${p.position}. ${p.driver} (${p.team})`),
          }
        : null,
      driverStandings: (card.driverStandings ?? []).slice(0, 5).map((d) => `${d.position}. ${d.driverName} — ${d.points} pts`),
      constructorStandings: (card.constructorStandings ?? []).slice(0, 5).map((c) => `${c.position}. ${c.constructor} — ${c.points} pts`),
      // Display-only, as above.
      table: (card.driverStandings ?? []).slice(0, 6).map((d) => ({
        rank: d.position,
        team: d.driverName,
        points: d.points,
        played: null,
        record: d.constructor ?? null,
        me: false,
      })),
      
      fixture: card.fixture
        ? { name: card.fixture.name, date: card.fixture.date ?? null, time: card.fixture.time ?? null, venue: card.fixture.venue ?? null }
        : null,
      results: (card.lastRace?.podium ?? []).slice(0, 3).map((p) => ({
        homeTeam: `${p.position}. ${p.driver}`,
        awayTeam: p.team,
        homeScore: null,
        awayScore: null,
        date: card.lastRace?.name ?? null,
      })),
    };
  }
  const me = (card.standings ?? []).find((s) => s.me);
  return {
    team: card.name ?? follow.team,
    sport: card.sport ?? follow.sport,
    league: card.league,
    nextFixture: card.fixture
      ? `${card.fixture.name}${card.fixture.date ? ` — ${card.fixture.date}` : ''}${card.fixture.time ? ` ${card.fixture.time}` : ''}`
      : null,
    recentResults: (card.results ?? [])
      .slice(0, 5)
      .map((r) => `${r.homeTeam} ${r.homeScore ?? '–'}–${r.awayScore ?? '–'} ${r.awayTeam}`),
    standing: me
      ? `${ordinal(me.rank)} in ${card.league} — ${me.points} pts${
          me.record ? ` (${me.record})` : me.played != null ? ` (P${me.played} W${me.won} L${me.lost})` : ''
        }`
      : null,
    // Display-only, for the card voice mode puts on screen: the same facts with
    // their structure kept, which the flattened strings above have lost.
    table: standingsWindow(card.standings ?? []),
    fixture: card.fixture
      ? { name: card.fixture.name, date: card.fixture.date ?? null, time: card.fixture.time ?? null, venue: card.fixture.venue ?? null }
      : null,
    results: (card.results ?? []).slice(0, 4).map((r) => ({
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      homeScore: r.homeScore ?? null,
      awayScore: r.awayScore ?? null,
      date: r.date ?? null,
    })),
  };
}

// Keep the news payload small — the model just needs headline, source + gist.
const trimArticles = (articles = []) =>
  articles.slice(0, 8).map((a) => ({
    title: a.title,
    source: a.source,
    publishedAt: a.publishedAt,
    summary: a.description,
    url: a.url,
  }));


/**
 * One calendar event, described in full for the model: both times, whether it's
 * all day, which calendar it lives on, whether that calendar is currently hidden
 * in the UI, and the reference needed to change or delete it later.
 *
 * The assistant kept missing things because the tools only ever handed it a
 * start time and a title — no end, no calendar, no way to act on what it found.
 */
function describeEvent(e, { hiddenIds = new Set() } = {}) {
  const startD = e.startISO ? new Date(e.startISO) : null;
  const endD = e.endISO ? new Date(e.endISO) : null;
  const date = e.date ?? (startD ? dateKey(startD) : null);
  return {
    ref: e.ref ?? e.id ?? null,
    date,
    day: date ? fullDay(date) : null,
    allDay: Boolean(e.allDay),
    start: e.allDay ? null : startD ? clockTime(startD) : firstTime(e.time) || null,
    end: e.allDay ? null : endD ? clockTime(endD) : null,
    durationMinutes: startD && endD ? Math.round((endD - startD) / 60000) : null,
    title: e.title || '(untitled)',
    location: e.location || e.place || '',
    notes: (e.description || '').slice(0, 300) || undefined,
    calendar: e.calendarName || e.calendar || e.source || 'local',
    source: e.source || 'local',
    // Display-only: lets voice mode tint each event with its calendar's colour.
    color: e.color ?? null,
    // The Life Hub can hide a calendar from the dashboard. The assistant still
    // sees those events, but is told which are hidden so it can respect that.
    hiddenInApp: e.calendarId ? hiddenIds.has(e.calendarId) : false,
    recurring: Boolean(e.recurring),
    editable: Boolean(e.writable),
  };
}

/**
 * One trip, described for the model. `full` adds the itinerary, flights, stay and
 * packing; the short form is just enough to tell trips apart. Dates are compared
 * as day keys so a trip is never "past" because of a timezone offset.
 */
function describeTrip(trip, { full = false, day = null, categories = [] } = {}) {
  const today = dateKey(new Date());
  const start = trip.start || '';
  const end = trip.end || start;
  const phase = !start ? 'unplanned' : today < start ? 'upcoming' : today > end ? 'past' : 'happening now';
  const daysAway = start ? Math.round((keyToDate(start) - keyToDate(today)) / 86_400_000) : null;

  const base = {
    id: trip.id,
    name: trip.name || 'Trip',
    destination: [trip.destination?.city, trip.destination?.country].filter(Boolean).join(', ') || null,
    country: trip.destination?.country ?? null,
    start,
    end,
    phase,
    countdown: phase === 'upcoming' ? daysAway : null,
  };
  if (!full) return base;

  // Only the day they asked about, when they asked about one.
  const wanted = (day || '').trim();
  const days = (trip.itinerary ?? []).filter((d, i) =>
    !wanted ? true : d.date === wanted || d.label === wanted || String(i + 1) === wanted,
  );
  const colorOf = (type) => categories.find((c) => c.id === type)?.color ?? null;

  return {
    ...base,
    nights: trip.itinerary?.length ? Math.max(0, trip.itinerary.length - 1) : null,
    currency: trip.destination?.currency?.code ?? null,
    timeZone: trip.destination?.timeZone ?? null,
    flights: (trip.flights ?? []).map((f) => ({ code: f.code, label: f.label, date: f.date })),
    stay: trip.stay ? { name: trip.stay.name, address: trip.stay.address ?? null } : null,
    itinerary: days.map((d) => ({
      label: d.label,
      date: d.date,
      items: (d.items ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        color: colorOf(i.type),
        time: i.time || '',
        endTime: i.endTime || '',
        place: i.place?.name ?? '',
        booked: Boolean(i.booked),
        done: Boolean(i.done),
        note: (i.note || '').slice(0, 160) || undefined,
      })),
    })),
    packing: {
      total: (trip.packing ?? []).length,
      outstanding: (trip.packing ?? []).filter((p) => !p.done).map((p) => p.label),
    },
  };
}

// Map a raw backend calendar event into the shape describeEvent expects.
const fromRemote = (e) => ({
  id: `ext:${e.source}:${e.calendarId ?? ''}:${e.id}`,
  ref: `ext:${e.source}:${e.calendarId ?? ''}:${e.id}`,
  date: e.allDay ? allDayKey(e.start) : e.start ? dateKey(new Date(e.start)) : null,
  title: e.title,
  location: e.location,
  description: e.description,
  calendarName: e.calendarName,
  calendarId: e.calendarId,
  source: e.source,
  writable: e.writable,
  recurring: e.recurring,
  allDay: e.allDay,
  color: e.color ?? null,
  startISO: e.start,
  endISO: e.end,
  eventId: e.id,
  recurringEventId: e.recurringEventId,
  providerUrl: e.providerUrl,
  etag: e.etag,
  uid: e.uid ?? null,
});

/**
 * Every event between two instants, from every connected calendar — including
 * ones hidden in the Life Hub — merged with the locally added ones. This is the
 * single source the read tools answer from, so "what's on?" and "what's on that
 * calendar I turned off?" can never disagree.
 */
async function fetchRange(life, settings, from, to) {
  const feedUrls = (settings.icalFeeds ?? []).map((f) => f.url).filter(Boolean).join(',');
  const { events: remote = [] } = await api.calendar
    .events({ source: 'all', url: feedUrls, timeMin: from.toISOString(), timeMax: to.toISOString() })
    .catch(() => ({ events: [] }));

  const out = remote.map(fromRemote).filter((e) => e.date);

  // Locally added events repeat by rule, so walk the range day by day.
  const days = Math.ceil((to - from) / 86_400_000);
  for (let i = 0; i <= days; i += 1) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const key = dateKey(d);
    for (const e of life.events ?? []) {
      if (!occursOn(e, key)) continue;
      const start = firstTime(e.time);
      out.push({
        id: `local:${e.id}:${key}`,
        ref: `local:${e.id}:${key}`,
        date: key,
        title: e.title,
        location: e.place,
        source: 'local',
        allDay: !start,
        startISO: start ? `${key}T${start}:00` : `${key}T00:00:00`,
        endISO: (e.time || '').match(/\d{1,2}:\d{2}/g)?.[1] ? `${key}T${(e.time.match(/\d{1,2}:\d{2}/g) || [])[1]}:00` : null,
        writable: true,
      });
    }
  }
  return out.sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
}

// Every way a view gets asked for → the id the dashboard uses.
const VIEW_IDS = {
  home: 'home',
  dashboard: 'home',
  launchpad: 'launchpad',
  apps: 'launchpad',
  life: 'life',
  'life hub': 'life',
  lifehub: 'life',
  calendar: 'life',
  planner: 'life',
  tasks: 'life',
  habits: 'life',
  markets: 'markets',
  'markets and news': 'markets',
  news: 'markets',
  stocks: 'markets',
  sport: 'markets',
  sports: 'markets',
  music: 'music',
  spotify: 'music',
  travel: 'travel',
  trips: 'travel',
  assistant: 'ai',
  chat: 'ai',
  ai: 'ai',
};

/** Exact name first, then containment either way. */
function pickByName(list, wanted, nameOf) {
  const needle = titleKey(wanted);
  if (!needle) return null;
  const items = list ?? [];
  return (
    items.find((x) => titleKey(nameOf(x)) === needle) ||
    items.find((x) => titleKey(nameOf(x)).includes(needle)) ||
    items.find((x) => needle.includes(titleKey(nameOf(x)))) ||
    null
  );
}

/**
 * The one to-do a request means. An exact match wins; otherwise a single partial
 * match; otherwise the ambiguity is handed back rather than guessed at.
 */
function pickTodo(todos, text, { date, includeDone = false } = {}) {
  const needle = titleKey(text);
  if (!needle) return { error: 'Say which task.' };
  const day = date ? normalizeDate(date) : null;
  const pool = (todos ?? []).filter((t) => (includeDone || !t.done) && (!day || occursOn(t, day)));
  const exact = pool.filter((t) => titleKey(t.label) === needle);
  if (exact.length) return { todo: exact[0] };
  const partial = pool.filter((t) => titleKey(t.label).includes(needle) || needle.includes(titleKey(t.label)));
  if (partial.length === 1) return { todo: partial[0] };
  if (partial.length > 1) {
    return { error: `${partial.length} tasks match "${text}" — say which.`, matches: partial.slice(0, 8).map((t) => t.label) };
  }
  // It may already be done — say so rather than "not found".
  const done = (todos ?? []).find((t) => t.done && titleKey(t.label).includes(needle));
  if (done && !includeDone) return { todo: done };
  return { error: `No task matching "${text}" on your list.` };
}

/** The trip a request is about: named, or the one open in Travel. */
function pickTrip(travel, wanted) {
  const trips = travel?.trips ?? [];
  if (!trips.length) return { error: 'No trips planned yet — add one in the Travel view.' };
  if (!String(wanted ?? '').trim()) return travel.trip ?? trips[0];
  const hit = pickByName(trips, wanted, (t) => `${t.name ?? ''} ${t.destination?.city ?? ''}`);
  return hit ?? { error: `No trip matching "${wanted}". You have: ${trips.map((t) => t.name).join(', ')}.` };
}

/**
 * The calendar an event should go on. Asks the backend directly when the
 * dashboard's list hasn't loaded — the first moments of a session, or just after
 * a blip — rather than reporting that nothing is connected when it is.
 */
async function resolveCalendar(calendar, wanted) {
  let writable = calendar?.writableCalendars ?? [];
  if (!writable.length) {
    const fresh = await api.calendar.calendars().catch(() => null);
    writable = (fresh?.calendars ?? []).filter((c) => c.writable);
  }
  if (!writable.length) {
    return { error: 'No calendar you can add to is connected — connect Google or Apple in the Life Hub first.' };
  }
  const needle = String(wanted ?? '').trim().toLowerCase();
  if (!needle) return writable[0];
  const hit =
    writable.find((c) => (c.name || '').toLowerCase() === needle) ||
    writable.find((c) => (c.name || '').toLowerCase().includes(needle)) ||
    writable.find((c) => needle.includes((c.name || '').toLowerCase()));
  return hit ?? { error: `No calendar called "${wanted}". You can add events to: ${writable.map((c) => c.name).join(', ')}.` };
}

/** Every event on one day, from every calendar. */
function eventsOn(day) {
  const start = keyToDate(day);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59);
  return fetchRange(getLifeData(), getSettings(), start, end);
}

/**
 * Builds the tool registry the AI agent executes against. `getData` returns the
 * live hook values ({ life, settings, update, calendar }) so tools always read
 * and write the latest app state.
 */
export function createToolExecutor(readHooks) {
  /**
   * The app's state as it is at this instant.
   *
   * The hooks hand over a copy taken at the last render, and for the length of a
   * batch that copy is stale: a task added by one call was invisible to the next,
   * and a memory saved by one was overwritten by the next. The shared stores are
   * read directly instead, so several actions made together each build on the
   * last. The calendar hook is still used for its write functions.
   */
  const getData = () => {
    const hooks = readHooks();
    const travelState = getTravelState();
    return {
      ...hooks,
      life: { ...getLifeData(), ...lifeActions },
      settings: getSettings(),
      travel: {
        ...hooks.travel,
        trips: travelState.trips,
        categories: travelState.categories,
        trip: travelState.trips.find((t) => t.id === travelState.activeId) ?? travelState.trips[0] ?? null,
      },
    };
  };

  // Creates in flight or just finished, by what they would create. The same
  // event asked for twice in one breath becomes one write.
  const recentCreates = new Map();

  const tools = {
    async get_upcoming_events({ days, from, to } = {}) {
      const { life, settings, calendar } = getData();
      const hiddenIds = new Set(calendar.hiddenCalendars ?? []);
      const now = new Date();
      const start = from ? new Date(`${from}T00:00:00`) : now;
      const end = to
        ? new Date(`${to}T23:59:59`)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.min(180, days || 14), 23, 59, 59);

      const events = (await fetchRange(life, settings, start, end))
        .filter((e) => (e.allDay ? e.date >= dateKey(start) : new Date(e.endISO || e.startISO) >= now || start > now))
        .slice(0, 80)
        .map((e) => describeEvent(e, { hiddenIds }));
      return { from: dateKey(start), to: dateKey(end), count: events.length, events };
    },

    async get_past_events({ days, from, to } = {}) {
      const { life, settings, calendar } = getData();
      const hiddenIds = new Set(calendar.hiddenCalendars ?? []);
      const now = new Date();
      const back = Math.min(365, Math.max(1, days || 14));
      const start = from ? new Date(`${from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
      const end = to ? new Date(`${to}T23:59:59`) : now;

      const events = (await fetchRange(life, settings, start, end))
        .filter((e) => new Date(e.startISO) <= end)
        .reverse()
        .slice(0, 60)
        .map((e) => describeEvent(e, { hiddenIds }));
      return { from: dateKey(start), to: dateKey(end), count: events.length, events };
    },

    async get_today() {
      const { life, settings, calendar } = getData();
      const hiddenIds = new Set(calendar.hiddenCalendars ?? []);
      const now = new Date();
      const key = dateKey(now);
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      // Fetched fresh across every calendar — the dashboard's cached list leaves
      // out calendars the user has hidden, and "what's on today" must not.
      const events = (await fetchRange(life, settings, start, end)).map((e) => describeEvent(e, { hiddenIds }));
      const todos = life.todos.filter((t) => occursOn(t, key)).map((t) => ({ text: t.label, done: t.done }));
      return { date: key, day: fullDay(key), now: clockTime(now), count: events.length, events, todos };
    },

    async find_events({ query, days = 60 } = {}) {
      const { life, settings, calendar } = getData();
      const hiddenIds = new Set(calendar.hiddenCalendars ?? []);
      const needle = (query || '').trim().toLowerCase();
      const now = new Date();
      const window = Math.min(365, Math.max(1, days));
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - window);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + window, 23, 59, 59);

      const all = await fetchRange(life, settings, start, end);
      const hits = (needle
        ? all.filter((e) => `${e.title || ''} ${e.location || ''} ${e.calendarName || ''}`.toLowerCase().includes(needle))
        : all
      )
        .slice(0, 40)
        .map((e) => describeEvent(e, { hiddenIds }));
      return { query, count: hits.length, events: hits };
    },

    async get_weather({ location } = {}) {
      const { settings } = getData();
      const place = (location || '').trim() || settings.location;
      const w = await getWeatherSummary(place);
      return {
        location: w.location,
        temperature: w.temperature,
        condition: w.condition,
        high: w.high,
        low: w.low,
        feelsLike: w.feelsLike,
        wind: w.wind,
        precipitation: w.precipitation,
        airQuality: w.airQuality,
        sunrise: w.sunrise ?? null,
        sunset: w.sunset ?? null,
        // The next few days, so "what's the week look like" is answerable — and
        // so voice mode can put the forecast on screen beside the answer.
        daily: (w.daily ?? []).slice(0, 6).map((d) => ({
          date: d.date,
          day: d.day,
          hi: d.hi,
          lo: d.lo,
          icon: d.icon,
        })),
      };
    },

    async get_sports({ team } = {}) {
      const { settings } = getData();
      const follows = settings.follows ?? [];
      const needle = (team || '').trim().toLowerCase();
      const picked = needle
        ? follows.filter((f) => `${f.team} ${f.leagueLabel} ${f.sport}`.toLowerCase().includes(needle))
        : follows;

      if (!picked.length) {
        return needle
          ? {
              error: `You're not following "${team}". Followed teams: ${follows.map((f) => f.team).join(', ') || 'none'}.`,
            }
          : { teams: [], note: 'No teams followed yet — add some in Settings.' };
      }

      const cards = await Promise.all(
        picked.map((f) =>
          api.sports
            .team(f.team, f.sport, f.leagueId, f.leagueLabel)
            .then((c) => summarizeSport(f, c))
            .catch(() => ({ team: f.team, sport: f.sport, note: 'Could not load right now.' })),
        ),
      );
      return { teams: cards };
    },

    async get_news({ query, scope } = {}) {
      const { settings } = getData();
      const q = (query || '').trim();
      // Local news uses free RSS feeds (always available); world search uses the
      // headlines/search provider, falling back to national RSS if it's not set up.
      try {
        if (scope === 'local') {
          const res = await api.news.local(settings.location || 'UK');
          let articles = res.articles ?? [];
          if (q) {
            const needle = q.toLowerCase();
            const hits = articles.filter((a) =>
              `${a.title || ''} ${a.description || ''}`.toLowerCase().includes(needle),
            );
            if (hits.length) articles = hits;
          }
          return { scope: 'local', place: res.place, articles: trimArticles(articles) };
        }

        // National is the UK feed asked for deliberately, not just the fallback.
        if (scope === 'national') {
          const res = await api.news.local('UK');
          return { scope: 'national', place: res.place ?? 'UK', articles: trimArticles(res.articles ?? []) };
        }

        const res = q ? await api.news.search(q) : await api.news.headlines({});
        return { scope: 'world', articles: trimArticles(res.articles ?? []) };
      } catch {
        // World provider needs an API key; fall back to the national RSS feed so
        // there is always live news rather than an error.
        try {
          const res = await api.news.local('UK');
          return { scope: 'national', place: res.place, articles: trimArticles(res.articles ?? []) };
        } catch {
          return { error: 'Could not fetch news right now.' };
        }
      }
    },

    async search_web({ query, recency } = {}) {
      const q = (query || '').trim();
      if (!q) return { error: 'Say what to search for.' };
      // Brave-style freshness codes; the backend ignores anything else.
      const freshness = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[recency];
      try {
        const res = await api.search(q, { max: 6, ...(freshness ? { freshness } : {}) });
        return {
          query: res.query,
          answer: res.answer ?? undefined,
          results: (res.results ?? []).map((r) => ({
            title: r.title,
            source: r.source,
            url: r.url,
            publishedAt: r.publishedAt ?? undefined,
            snippet: r.snippet ? r.snippet.slice(0, 400) : undefined,
            // Page text, when we could read it — this is what lets the model
            // answer from the page rather than from a one-line snippet.
            page: r.content ? r.content.slice(0, 1200) : undefined,
          })),
        };
      } catch (e) {
        return { error: e?.message || "Couldn't search the web right now." };
      }
    },

    async get_stocks() {
      const { settings } = getData();
      const symbols = settings.stocks ?? [];
      if (!symbols.length) return { stocks: [] };
      const { quotes } = await api.stocks.quotes(symbols).catch(() => ({ quotes: [] }));
      return {
        stocks: (quotes ?? []).map((q) => ({
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          changePercent: q.changePercent,
        })),
      };
    },

    async list_calendars() {
      const { calendar } = getData();
      const hiddenIds = new Set(calendar.hiddenCalendars ?? []);
      return {
        calendars: (calendar.calendars ?? []).map((c) => ({
          name: c.name,
          source: c.source,
          canAddEvents: Boolean(c.writable),
          // Hidden means "not drawn on the dashboard" — the events are still
          // yours and still readable; say so rather than pretending they're gone.
          hiddenInApp: hiddenIds.has(c.id),
        })),
        note: 'You can read events from every calendar, including hidden ones. Hidden only means it is switched off in the Life Hub view.',
      };
    },

    async create_calendar_event({ title, date, start_time, end_time, end_date, all_day, location, notes, calendar: calName } = {}) {
      const name = String(title ?? '').trim();
      if (!name) return { error: 'An event needs a title.' };

      const span = eventWindow({ date, startTime: start_time, endTime: end_time, endDate: end_date, allDay: all_day === true });
      if (span.error) return { error: span.error, title: name, date };

      const { calendar } = getData();
      const cal = await resolveCalendar(calendar, calName);
      if (cal.error) return { error: cal.error, title: name, date: span.date };

      const summary = {
        title: name,
        date: span.date,
        end_date: span.endDate ?? undefined,
        start: span.startTime,
        end: span.endTime,
        all_day: span.allDay,
        location: location || '',
        calendar: cal.name,
      };

      const key = `${cal.id}|${titleKey(name)}|${span.start}`;
      const prior = recentCreates.get(key);
      if (prior) {
        const earlier = await prior;
        return earlier.created
          ? { ...earlier, created: false, duplicate: true, note: 'Added a moment ago — nothing more was added.' }
          : earlier;
      }

      const run = (async () => {
        // Already there? A repeated request is the commonest way duplicates
        // happen: the reply gets talked over, the confirmation is lost, and they
        // quite reasonably ask again.
        const existing = await eventsOn(span.date);
        const clash = findDuplicate(existing, {
          title: name,
          start: span.start,
          allDay: span.allDay,
          date: span.date,
          calendarId: cal.id,
        });
        if (clash) {
          return {
            ...summary,
            created: false,
            duplicate: true,
            location: clash.location || summary.location,
            note: `"${clash.title}" is already on ${cal.name} at that time — nothing was added.`,
          };
        }
        await calendar.createEvent({
          source: cal.source,
          calendarId: cal.id,
          title: name,
          location: location || undefined,
          description: notes || undefined,
          start: span.start,
          end: span.end,
          allDay: span.allDay,
        });
        return { ...summary, created: true };
      })();

      recentCreates.set(key, run);
      // Held briefly after it lands: a provider can take a moment to list a new
      // event, and a repeat in that gap would otherwise slip past the check.
      run.catch(() => {}).finally(() => globalThis.setTimeout(() => recentCreates.delete(key), 15_000));
      try {
        return await run;
      } catch (e) {
        recentCreates.delete(key);
        return { error: e?.message || 'The calendar would not accept that event.', ...summary };
      }
    },

    async update_calendar_event({ title, date, at_time, calendar: calName, new_title, new_date, start_time, end_time, location, notes } = {}) {
      if (!String(title ?? '').trim()) return { error: 'Say which event to change.' };
      const { life, settings, calendar } = getData();
      const now = new Date();
      const pool = await fetchRange(
        life,
        settings,
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 365),
      );
      const matches = distinctEvents(
        narrowEvents(pool.filter((e) => e.source !== 'local'), { title, date, atTime: at_time, calendar: calName }),
      );
      if (!matches.length) {
        return { error: `No event matching "${title}"${date ? ` on ${date}` : ''}${at_time ? ` at ${at_time}` : ''}.`, title, date };
      }

      // Several identical copies of one event are the same event as far as the
      // user is concerned; change the fullest one rather than asking them to
      // choose between things they can't tell apart.
      const first = matches[0];
      const copies = matches.every((e) => titleKey(e.title) === titleKey(first.title) && e.startISO === first.startISO);
      if (matches.length > 1 && !copies) {
        return {
          error: `${matches.length} events match "${title}" — say which by its date or start time.`,
          title,
          date,
          matches: matches.slice(0, 8).map((e) => describeEvent(e)),
        };
      }
      const event = copies ? chooseKeeper(matches) : first;
      if (!event.writable) {
        return { error: `"${event.title}" is on a read-only calendar (${event.calendarName ?? event.source}).`, title: event.title, date: event.date };
      }

      const day = new_date ? normalizeDate(new_date) : event.date;
      if (!day) return { error: `"${new_date}" is not a date — use YYYY-MM-DD.`, title: event.title, date: event.date };
      const becomesTimed = Boolean(start_time);
      const span = eventWindow({
        date: day,
        startTime: start_time ?? (event.allDay ? null : clockOf(new Date(event.startISO))),
        endTime: end_time ?? null,
        allDay: event.allDay && !becomesTimed,
        // Moved or retimed, an event keeps its length unless a new end was given.
        durationMinutes:
          !event.allDay && event.endISO ? Math.round((new Date(event.endISO) - new Date(event.startISO)) / 60000) : undefined,
      });
      if (span.error) return { error: span.error, title: event.title, date: day };

      await calendar.updateEvent({
        source: event.source,
        calendarId: event.calendarId,
        eventId: event.eventId,
        providerUrl: event.providerUrl,
        etag: event.etag,
        uid: event.uid ?? undefined,
        title: new_title || event.title,
        location: location ?? event.location,
        description: notes ?? event.description,
        start: span.start,
        end: span.end,
        allDay: span.allDay,
      });
      return {
        updated: true,
        title: new_title || event.title,
        previous_title: new_title && new_title !== event.title ? event.title : undefined,
        date: span.date,
        start: span.startTime,
        end: span.endTime,
        all_day: span.allDay,
        location: location ?? event.location ?? '',
        calendar: event.calendarName ?? event.source,
        other_copies: copies && matches.length > 1 ? matches.length - 1 : undefined,
      };
    },

    async delete_calendar_event({ title, date, at_time, calendar: calName, all_matches, keep_one } = {}) {
      if (!String(title ?? '').trim()) return { error: 'Say which event to remove.' };
      const day = date ? normalizeDate(date) : null;
      if (date && !day) return { error: `"${date}" is not a date — use YYYY-MM-DD.`, title };

      const { life, settings, calendar } = getData();
      const now = new Date();
      const from = day ? keyToDate(day) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const to = day
        ? new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 365);
      // Read fresh rather than from the dashboard's list, so events on hidden
      // calendars can be removed too.
      const pool = (await fetchRange(life, settings, from, to)).filter((e) => e.source !== 'local');
      // A named day means that occurrence; no day means the event as a whole.
      const matches = distinctEvents(narrowEvents(pool, { title, date: day, atTime: at_time, calendar: calName }), {
        series: !day,
      });
      if (!matches.length) return { deleted: 0, title, date: day ?? undefined, note: 'No matching event found.' };

      let targets = matches;
      let kept = null;
      if (keep_one) {
        if (matches.length < 2) return { deleted: 0, title, date: day ?? undefined, note: 'Only one matches — there are no copies to remove.' };
        kept = chooseKeeper(matches);
        targets = matches.filter((e) => e !== kept);
      } else if (matches.length > 1 && !all_matches) {
        // Removing everything that shares a word with the request is how a whole
        // year of appointments disappears. More than one match is a question.
        return {
          deleted: 0,
          title,
          date: day ?? undefined,
          error: `${matches.length} events match — say which by its date or start time, or confirm that all of them should go.`,
          matches: matches.slice(0, 8).map((e) => describeEvent(e)),
        };
      }

      const removed = [];
      const skipped = [];
      const failed = [];
      for (const e of targets) {
        if (!e.writable) {
          skipped.push(`${e.title} (read-only ${e.calendarName ?? e.source})`);
          continue;
        }
        try {
          await calendar.deleteEvent(e, day ? 'this' : 'all');
          removed.push({
            title: e.title,
            date: e.date,
            start: e.allDay ? null : clockOf(new Date(e.startISO)),
            calendar: e.calendarName ?? e.source,
          });
        } catch (err) {
          failed.push(`${e.title} on ${e.date} (${err?.message || 'the calendar refused'})`);
        }
      }
      return {
        deleted: removed.length,
        removed,
        kept: kept ? describeEvent(kept) : undefined,
        skipped: skipped.length ? skipped : undefined,
        failed: failed.length ? failed : undefined,
      };
    },

    // ── Tasks ────────────────────────────────────────────────────────────
    async get_tasks({ date, include_done = false } = {}) {
      const { life } = getData();
      const day = date ? normalizeDate(date) : null;
      if (date && !day) return { error: `"${date}" is not a date — use YYYY-MM-DD.` };
      const tasks = (life.todos ?? [])
        .filter((t) => (day ? occursOn(t, day) : true))
        .filter((t) => include_done || !t.done)
        .slice(0, 80)
        .map((t) => ({
          text: t.label,
          date: t.date ?? null,
          repeat: t.repeat && t.repeat !== 'none' ? t.repeat : undefined,
          done: Boolean(t.done),
        }));
      return { date: day ?? undefined, count: tasks.length, tasks };
    },

    async add_task({ text, date } = {}) {
      const label = String(text ?? '').trim();
      if (!label) return { error: 'Say what the task is.' };
      const day = date ? normalizeDate(date) : dateKey(new Date());
      if (!day) return { error: `"${date}" is not a date — use YYYY-MM-DD.`, text: label };
      const { life } = getData();
      life.addTodo({ label, date: day, repeat: 'none' });
      return { added: true, text: label, date: day };
    },

    async complete_task({ text, date } = {}) {
      const { life } = getData();
      const found = pickTodo(life.todos, text, { date });
      if (found.error) return { ...found, text };
      if (found.todo.done) return { completed: true, already: true, text: found.todo.label };
      life.setTodoDone(found.todo.id, true);
      return { completed: true, text: found.todo.label };
    },

    async remove_task({ text, date } = {}) {
      const { life } = getData();
      const found = pickTodo(life.todos, text, { date, includeDone: true });
      if (found.error) return { ...found, text };
      life.removeTodo(found.todo.id);
      return { removed: true, text: found.todo.label };
    },

    // ── Habits ───────────────────────────────────────────────────────────
    async add_habit({ name } = {}) {
      const label = String(name ?? '').trim();
      if (!label) return { error: 'Say what the habit is.' };
      const { life } = getData();
      const existing = (life.habits ?? []).find((h) => titleKey(h.label) === titleKey(label));
      if (existing) return { added: false, duplicate: true, name: existing.label, note: 'Already tracking that habit.' };
      life.addHabit(label);
      return { added: true, name: label };
    },

    async log_habit({ name, done = true } = {}) {
      const { life } = getData();
      const habit = pickByName(life.habits, name, (h) => h.label);
      if (!habit) return { error: `No habit called "${name}". You track: ${(life.habits ?? []).map((h) => h.label).join(', ') || 'nothing yet'}.`, name };
      life.setHabitDone(habit.id, dateKey(new Date()), done !== false);
      return { logged: true, name: habit.label, done: done !== false };
    },

    async remove_habit({ name } = {}) {
      const { life } = getData();
      const habit = pickByName(life.habits, name, (h) => h.label);
      if (!habit) return { error: `No habit called "${name}".`, name };
      life.removeHabit(habit.id);
      return { removed: true, name: habit.label };
    },

    // ── Settings ─────────────────────────────────────────────────────────
    async set_location({ location } = {}) {
      const place = String(location ?? '').trim();
      if (!place) return { error: 'Say where.' };
      getData().update({ location: place });
      return { location: place };
    },

    async add_stock({ symbol } = {}) {
      const sym = String(symbol ?? '').toUpperCase().trim();
      if (!sym) return { error: 'Say which ticker.' };
      let watchlist = [];
      let already = false;
      getData().update((s) => {
        const current = s.stocks ?? [];
        already = current.includes(sym);
        watchlist = already ? current : [...current, sym];
        return { stocks: watchlist };
      });
      return { added: sym, already: already || undefined, watchlist };
    },

    async remove_stock({ symbol } = {}) {
      const sym = String(symbol ?? '').toUpperCase().trim();
      let watchlist = [];
      let had = false;
      getData().update((s) => {
        const current = s.stocks ?? [];
        had = current.includes(sym);
        watchlist = current.filter((x) => x !== sym);
        return { stocks: watchlist };
      });
      return had ? { removed: sym, watchlist } : { error: `${sym || 'That'} isn't on your watchlist.`, watchlist };
    },

    // ── Long-term memory ─────────────────────────────────────────────────
    async remember({ fact } = {}) {
      const text = String(fact ?? '').trim();
      if (!text) return { error: 'Nothing to remember.' };
      let outcome = { remembered: true, fact: text };
      // Built from the memories as they are NOW, so two saved together both stay.
      getData().update((s) => {
        const memories = s.memories ?? [];
        const norm = text.toLowerCase();
        const dup = memories.some((m) => {
          const t = (m.text || '').toLowerCase();
          return t === norm || t.includes(norm) || norm.includes(t);
        });
        if (dup) {
          outcome = { remembered: true, fact: text, note: 'Already knew something like that.' };
          return {};
        }
        const entry = { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, at: Date.now() };
        return { memories: [...memories, entry].slice(-200) };
      });
      return outcome;
    },

    async forget({ about } = {}) {
      const needle = String(about ?? '').trim().toLowerCase();
      if (!needle) return { error: 'Say what to forget.' };
      let forgotten = 0;
      getData().update((s) => {
        const memories = s.memories ?? [];
        const kept = memories.filter((m) => !(m.text || '').toLowerCase().includes(needle));
        forgotten = memories.length - kept.length;
        return { memories: kept };
      });
      return { forgotten, about };
    },

    // ── Around the app ───────────────────────────────────────────────────
    async open_view({ view } = {}) {
      const id = VIEW_IDS[String(view ?? '').trim().toLowerCase()];
      if (!id) return { error: `No view called "${view}". You can open: home, launchpad, life hub, markets and news, music, travel, assistant.` };
      goToView(id);
      return { opened: id };
    },

    async play_on_device({ device } = {}) {
      const wanted = String(device ?? '').trim().toLowerCase();
      if (!wanted) return { error: 'Say which device.' };
      await spotifyPlayer.controls.refreshDevices?.();
      const snap = spotifyPlayer.getSnapshot();
      if (/^(this|here|the dashboard|dashboard|pulse|pulse os|this device|the screen)$/.test(wanted)) {
        if (!snap.deviceId) return { error: "This dashboard can't play music itself right now." };
        await spotifyPlayer.controls.transferTo(snap.deviceId);
        return { playing_on: 'this dashboard' };
      }
      const devices = (snap.devices ?? []).filter((d) => !d.restricted);
      const hit = pickByName(devices, wanted, (d) => d.name);
      if (!hit) {
        return { error: `No Spotify device called "${device}". Available: ${devices.map((d) => d.name).join(', ') || 'none — open Spotify on the device first'}.` };
      }
      await spotifyPlayer.controls.transferTo(hit.id);
      return { playing_on: hit.name };
    },

    async add_packing_item({ item, trip: wanted } = {}) {
      const label = String(item ?? '').trim();
      if (!label) return { error: 'Say what to pack.' };
      const trip = pickTrip(getData().travel, wanted);
      if (trip.error) return { ...trip, item: label };
      const existing = (trip.packing ?? []).find((p) => titleKey(p.label) === titleKey(label));
      if (existing) return { added: false, duplicate: true, item: existing.label, trip: trip.name, note: 'Already on the packing list.' };
      addPackingItem(trip.id, label);
      return { added: true, item: label, trip: trip.name };
    },

    async check_packing_item({ item, trip: wanted, done = true } = {}) {
      const trip = pickTrip(getData().travel, wanted);
      if (trip.error) return { ...trip, item };
      const entry = pickByName(trip.packing, item, (p) => p.label);
      if (!entry) return { error: `"${item}" isn't on the packing list for ${trip.name}.`, item, trip: trip.name };
      setPackingDone(trip.id, entry.id, done !== false);
      return { checked: done !== false, item: entry.label, trip: trip.name };
    },

    async list_memories() {
      const { settings } = getData();
      return { memories: (settings.memories ?? []).map((m) => m.text) };
    },

    async open_app({ name } = {}) {
      await api.launch(name).catch(() => {});
      return { opened: name };
    },

    // ── Spotify playback (shared in-app player) ──────────────────────────
    async play_music({ query } = {}) {
      spotifyPlayer.ensureInit();
      const notReady = musicNotReady();
      if (notReady) return notReady;

      if (query && query.trim()) {
        const { tracks } = await api.music.search(query.trim()).catch(() => ({ tracks: [] }));
        const top = (tracks ?? [])[0];
        if (!top) return { error: `Couldn't find "${query}" on Spotify.` };
        await spotifyPlayer.controls.playContext({ uris: [top.uri] });
        return {
          playing: top.track,
          track: top.track,
          artists: Array.isArray(top.artists) ? top.artists.join(', ') : top.artists,
          album: top.album ?? null,
          image: top.image ?? null, // display-only: the sleeve voice mode shows
        };
      }

      await spotifyPlayer.controls.resume();
      return { resumed: true };
    },

    async pause_music() {
      const notReady = musicNotReady();
      if (notReady) return notReady;
      await spotifyPlayer.controls.pause();
      return { paused: true };
    },

    async next_track() {
      const notReady = musicNotReady();
      if (notReady) return notReady;
      await spotifyPlayer.controls.next();
      return { skipped: true };
    },

    async previous_track() {
      const notReady = musicNotReady();
      if (notReady) return notReady;
      await spotifyPlayer.controls.previous();
      return { back: true };
    },

    async watch_news_channel({ channel, fullscreen = true } = {}) {
      const wanted = (channel || '').trim();
      const picked = wanted ? setChannel(wanted) : NEWS_CHANNELS[getLiveNews().index];
      if (!picked) {
        return { error: `No channel called "${channel}". You can watch: ${NEWS_CHANNELS.map((c) => c.label).join(', ')}.` };
      }
      // The tile lives on the news view, so go there whether or not it is about
      // to be covered — leaving full screen should land somewhere that makes sense.
      goToView('markets');

      const takeOver = fullscreen !== false;
      if (takeOver) {
        // Wait for Pulse to finish introducing it. Handing the screen over mid
        // sentence means the channel's own audio talks over the introduction —
        // and then the session closes, because there is nothing left to answer.
        afterSpeech(() => setImmersive(true));
        endSessionAfterSpeech();
      } else {
        setImmersive(false);
      }
      return { watching: picked.label, fullscreen: takeOver };
    },

    async stop_news_channel() {
      const wasOn = getLiveNews().immersive;
      setImmersive(false);
      return { stopped: true, wasFullScreen: wasOn };
    },

    async get_trips() {
      const { travel } = getData();
      const trips = travel?.trips ?? [];
      if (!trips.length) return { trips: [], note: 'No trips planned yet — add one in the Travel view.' };
      return { count: trips.length, trips: trips.map((t) => describeTrip(t, { full: false })) };
    },

    async get_trip({ trip: wanted, day } = {}) {
      const { travel } = getData();
      const trips = travel?.trips ?? [];
      if (!trips.length) return { error: 'No trips planned yet — add one in the Travel view.' };

      const needle = (wanted || '').trim().toLowerCase();
      let picked = travel.trip ?? trips[0];
      if (needle) {
        const hit = trips.find((t) =>
          `${t.name ?? ''} ${t.destination?.city ?? ''} ${t.destination?.country ?? ''}`.toLowerCase().includes(needle),
        );
        if (!hit) {
          return { error: `No trip matching "${wanted}". You have: ${trips.map((t) => t.name).join(', ')}.` };
        }
        picked = hit;
      }
      return describeTrip(picked, { full: true, day, categories: travel.categories });
    },

    async get_now_playing() {
      const s = spotifyPlayer.getSnapshot().state;
      if (!s || !s.track) return { playing: false };
      return {
        playing: !s.paused,
        paused: s.paused,
        track: s.track,
        artists: s.artists,
        image: s.image ?? null, // display-only: the sleeve voice mode shows
      };
    },
  };

  /** Run one tool. Never throws: a failure comes back as `{ error }` for the model to report. */
  async function execute(name, args) {
    const fn = tools[name];
    if (!fn) return { error: `Unknown tool: ${name}` };
    try {
      return (await fn(args || {})) ?? {};
    } catch (e) {
      return { error: e?.message || 'Tool failed' };
    }
  }

  /**
   * Run everything one request asked for at once, and answer in the order asked.
   *
   * One spoken request is routinely several actions — two appointments, four
   * tasks — and the model sends them together. Running them one after another
   * made the reply wait for each in turn, long enough to be talked over and
   * cancelled. Every store write builds on the current state, and identical
   * creates collapse into one, so running them together is safe.
   *
   * @returns {Promise<Array<{ call, result }>>}
   */
  async function executeBatch(calls = []) {
    return Promise.all((calls ?? []).map(async (call) => ({ call, result: await execute(call.name, call.args) })));
  }

  return { execute, executeBatch };
}
