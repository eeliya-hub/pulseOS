import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { allDayKey, dateKey } from './useLifeData.js';
import { getSettings, useSettings } from './useSettings.js';

// Colour + label per connected source (fallback tint when a calendar has none).
export const SOURCE_META = {
  google: { label: 'Google', color: '#4285F4' },
  apple: { label: 'Apple', color: '#FF3B30' },
  ical: { label: 'Subscribed', color: '#34C759' },
};

const ICAL_PALETTE = ['#34C759', '#FF9F0A', '#5E5CE6', '#FF2D55', '#64D2FF', '#BF5AF2'];
const fmtTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// How old the calendar may get before the dashboard reads it again. This was an
// hour, so an event added or moved on a phone could take that long to show up
// here — which is exactly what "it isn't syncing" looks like.
const STALE_AFTER = 2 * 60 * 1000;
// Checked well inside that window. Checking only every STALE_AFTER would find the
// last read a moment short of stale on every other tick, and refresh half as often.
const POLL_EVERY = 30 * 1000;
// v2: v1 cached all-day events as UTC instants, which read back a day early.
const LS_KEY = 'pulse.calendar.cache.v2';

// ── Module-level store, shared across every mount ──────────────────────────
// Events/calendars are fetched once and cached (in memory + localStorage) so
// switching tabs never refetches; it auto-refreshes at most hourly, plus on
// demand (refresh button) and after create/edit/delete.
const DEFAULTS = {
  rawEvents: [],
  remoteCalendars: [],
  status: { googleConnected: false, googleConfigured: false, appleConnected: false },
  // Whether the last refresh actually reached the backend. Null until we've
  // tried, so the UI can tell "not set up" from "haven't looked yet".
  reachable: null,
  fetchedAt: 0,
  fetchedFeeds: '',
  loading: false,
};

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw), loading: false };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

let store = loadCache();
const subscribers = new Set();

function setStore(patch) {
  store = { ...store, ...patch };
  subscribers.forEach((fn) => fn(store));
}

function persist() {
  try {
    const { rawEvents, remoteCalendars, status, fetchedAt, fetchedFeeds } = store;
    localStorage.setItem(LS_KEY, JSON.stringify({ rawEvents, remoteCalendars, status, fetchedAt, fetchedFeeds }));
  } catch {
    /* storage disabled — non-fatal */
  }
}

/**
 * The span of events the dashboard keeps loaded: the month before this one to the
 * end of six months ahead. It used to stop 75 days out, so anything further — an
 * appointment in December seen from September — was never fetched at all, however
 * far the calendar was paged forward.
 */
function defaultRange(now = new Date()) {
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to: new Date(now.getFullYear(), now.getMonth() + 7, 1),
  };
}

/** How far ahead the calendar is kept loaded — views that look forward stop here. */
export const loadedUntil = () => defaultRange().to;

// A span the calendar has been paged to outside the default one, loaded alongside
// it. Only the span being looked at: paging a year ahead shouldn't make every
// refresh from then on read a year of calendars.
let viewedRange = null;

/** One copy of each event, in order, from reads whose spans may overlap. */
function mergeEvents(events) {
  const seen = new Set();
  return events
    .filter((e) => {
      const key = `${e.source}|${e.calendarId ?? ''}|${e.id}|${e.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

const currentFeeds = () =>
  (getSettings().icalFeeds ?? [])
    .map((f) => f.url)
    .filter(Boolean)
    .join(',');

let inFlight = null;
// Asked for again while a refresh was already running. That refresh may have
// started before the change it was asked for, so one more runs straight after —
// otherwise the second of two events added back to back could stay invisible
// until the hourly refresh.
let rerunFeeds = null;

/**
 * Refresh everything the calendar needs, without ever downgrading what we
 * already know on a bad connection.
 *
 * The rule throughout: a request that FAILED tells us nothing. It used to be
 * read as an answer — a status call that didn't complete became "Google is not
 * configured", which is how a two-second backend restart turned into "add your
 * client ID to .env" on a machine where it had been set up for weeks. Anything
 * that fails now leaves the last known state alone and simply says the backend
 * could not be reached.
 */
async function fetchAll(feedUrls) {
  if (inFlight) {
    rerunFeeds = feedUrls;
    return inFlight;
  }
  setStore({ loading: true });
  inFlight = (async () => {
    let reachable = true;
    try {
      let status = null;
      try {
        status = await api.calendar.status();
      } catch {
        reachable = false;
      }

      // Only a status we actually received changes what we believe.
      const nextStatus = status
        ? {
            googleConnected: Boolean(status.google?.connected),
            googleConfigured: Boolean(status.google?.configured),
            appleConnected: Boolean(status.apple?.connected),
          }
        : store.status;

      const g = nextStatus.googleConnected;
      const a = nextStatus.appleConnected;

      let remoteCalendars = store.remoteCalendars;
      if (status && (g || a)) {
        try {
          remoteCalendars = (await api.calendar.calendars()).calendars ?? [];
        } catch {
          reachable = false; // keep the ones we had
        }
      } else if (status && !g && !a) {
        remoteCalendars = []; // genuinely signed out of both
      }

      let rawEvents = store.rawEvents;
      let fetchedAt = store.fetchedAt;
      if (feedUrls || g || a) {
        const spans = [defaultRange(), ...(viewedRange ? [viewedRange] : [])];
        try {
          const results = await Promise.all(
            spans.map(({ from, to }) =>
              api.calendar.events({ source: 'all', url: feedUrls, timeMin: from.toISOString(), timeMax: to.toISOString() }),
            ),
          );
          // A source that failed this time says nothing about its events. Keep the
          // ones already on screen for it, rather than replacing a whole calendar
          // with an empty month because iCloud dropped one request.
          const failed = new Set(
            results.flatMap((res) =>
              Object.entries(res.sources ?? {})
                .filter(([, outcome]) => outcome && !outcome.ok)
                .map(([name]) => name),
            ),
          );
          rawEvents = mergeEvents([
            ...results.flatMap((res) => res.events ?? []),
            ...store.rawEvents.filter((e) => failed.has(e.source)),
          ]);
          fetchedAt = Date.now(); // only a real fetch counts as fresh
        } catch {
          reachable = false; // hold the events already on screen
        }
      } else if (status) {
        rawEvents = [];
        fetchedAt = Date.now();
      }

      setStore({
        rawEvents,
        remoteCalendars,
        status: nextStatus,
        reachable,
        fetchedAt,
        fetchedFeeds: feedUrls,
        loading: false,
      });
      // Never persist a degraded read over a good cache.
      if (reachable) persist();
    } finally {
      setStore({ loading: false });
      inFlight = null;
      if (rerunFeeds !== null) {
        const next = rerunFeeds;
        rerunFeeds = null;
        void fetchAll(next);
      }
    }
  })();
  return inFlight;
}

// ── Staying fresh ───────────────────────────────────────────────────────────
// One refresher for the whole app, however many views use the calendar. Every
// mount used to start a timer of its own, each firing a full re-read of every
// calendar. Refreshes also run the moment the window comes back into focus, so
// switching over after changing something on a phone shows it straight away.
let watchers = 0;
let watchedFeeds = '';
let pollTimer = null;

function refreshIfStale() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  // Already reading — a routine check is answered by that, not queued behind it.
  if (inFlight) return;
  if (Date.now() - store.fetchedAt >= STALE_AFTER) void fetchAll(watchedFeeds);
}

function watchCalendar(feedUrls) {
  watchedFeeds = feedUrls;
  watchers += 1;
  if (watchers === 1) {
    pollTimer = window.setInterval(refreshIfStale, POLL_EVERY);
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
  }
  return () => {
    watchers -= 1;
    if (watchers > 0) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
    window.removeEventListener('focus', refreshIfStale);
    document.removeEventListener('visibilitychange', refreshIfStale);
  };
}

// Warm the shared calendar store on launch (used by the preloader), so Home and
// the Life Hub render instantly. No-op if fetched within the last hour.
export function warmCalendar() {
  if (Date.now() - store.fetchedAt < STALE_AFTER && store.fetchedAt !== 0) return Promise.resolve();
  return fetchAll(currentFeeds());
}

/**
 * Make sure a span of days is loaded — called as the calendar is paged. Inside the
 * default span there is nothing to fetch; outside it, that span is read too and
 * kept fresh for as long as it is the one on screen.
 */
export function ensureCalendarRange(from, to) {
  const base = defaultRange();
  if (from >= base.from && to <= base.to) {
    viewedRange = null;
    return;
  }
  if (viewedRange && viewedRange.from.getTime() === from.getTime() && viewedRange.to.getTime() === to.getTime()) return;
  viewedRange = { from, to };
  void fetchAll(currentFeeds());
}

// Map a backend calendar event → the LifeHub shape, keeping CRUD references.
function toLifeEvent(e, colorForCalendar) {
  const start = e.start ? new Date(e.start) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const end = e.end ? new Date(e.end) : null;
  const date = (e.allDay ? allDayKey(e.start) : null) ?? dateKey(start);
  let time = '';
  if (!e.allDay) time = end && end - start > 60_000 ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);

  return {
    id: `ext:${e.source}:${e.calendarId ?? ''}:${e.id}`,
    date,
    time,
    title: e.title || '(untitled)',
    place: e.location || '',
    repeat: 'none',
    calendar: e.source,
    calendarId: e.calendarId ?? null,
    calendarName: e.calendarName ?? null,
    color: e.color || colorForCalendar(e.calendarId) || SOURCE_META[e.source]?.color,
    source: e.source,
    writable: Boolean(e.writable),
    editable: Boolean(e.editable),
    readOnly: !e.writable,
    eventId: e.id,
    recurringEventId: e.recurringEventId ?? null,
    providerUrl: e.providerUrl ?? null,
    etag: e.etag ?? null,
    uid: e.uid ?? null,
    recurring: Boolean(e.recurring),
    description: e.description || '',
    location: e.location || '',
    allDay: Boolean(e.allDay),
    startISO: e.start,
    endISO: e.end,
  };
}

export function useCalendarEvents() {
  const { settings, update } = useSettings();
  const hidden = useMemo(() => settings.hiddenCalendars ?? [], [settings.hiddenCalendars]);
  const feedUrls = useMemo(
    () => (settings.icalFeeds ?? []).map((f) => f.url).filter(Boolean).join(','),
    [settings.icalFeeds],
  );

  const [snap, setSnap] = useState(store);
  useEffect(() => {
    subscribers.add(setSnap);
    setSnap(store);
    return () => subscribers.delete(setSnap);
  }, []);

  // Read now if what we have is old, empty, or for a different set of feeds — then
  // keep it fresh for as long as anything on screen uses the calendar.
  useEffect(() => {
    const stale = Date.now() - store.fetchedAt >= STALE_AFTER;
    if (stale || store.fetchedAt === 0 || store.fetchedFeeds !== feedUrls) fetchAll(feedUrls);
    return watchCalendar(feedUrls);
  }, [feedUrls]);

  // Refresh after the Google OAuth popup reports success.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data === 'pulse:google-calendar-connected') fetchAll(feedUrls);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [feedUrls]);

  const refresh = useCallback(() => fetchAll(feedUrls), [feedUrls]);

  const icalCalendars = useMemo(
    () =>
      (settings.icalFeeds ?? []).map((f, i) => ({
        id: f.url,
        name: f.name || 'Calendar',
        color: ICAL_PALETTE[i % ICAL_PALETTE.length],
        source: 'ical',
        writable: false,
      })),
    [settings.icalFeeds],
  );
  const calendars = useMemo(() => [...snap.remoteCalendars, ...icalCalendars], [snap.remoteCalendars, icalCalendars]);
  const colorMap = useMemo(() => Object.fromEntries(calendars.map((c) => [c.id, c.color])), [calendars]);

  const events = useMemo(() => {
    const hiddenSet = new Set(hidden);
    const colorFor = (id) => colorMap[id];
    return snap.rawEvents
      .map((e) => toLifeEvent(e, colorFor))
      .filter(Boolean)
      .filter((e) => !hiddenSet.has(e.calendarId));
  }, [snap.rawEvents, hidden, colorMap]);

  const toggleCalendar = useCallback(
    (id) => {
      const set = new Set(settings.hiddenCalendars ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      update({ hiddenCalendars: [...set] });
    },
    [settings.hiddenCalendars, update],
  );

  const connectGoogle = useCallback(async () => {
    const { url } = await api.calendar.googleAuthUrl();
    window.open(url, 'pulse-google-oauth', 'width=520,height=680');
  }, []);

  const connectApple = useCallback(
    async (appleId, appPassword) => {
      const res = await api.calendar.appleConnect(appleId, appPassword);
      await fetchAll(feedUrls);
      return res;
    },
    [feedUrls],
  );

  const disconnectGoogle = useCallback(async () => {
    await api.calendar.googleDisconnect();
    await fetchAll(feedUrls);
  }, [feedUrls]);

  const disconnectApple = useCallback(async () => {
    await api.calendar.appleDisconnect();
    await fetchAll(feedUrls);
  }, [feedUrls]);

  // A write is done the moment the provider accepts it. Refreshing the calendar
  // is the dashboard catching up, and it no longer holds the caller: the
  // assistant used to wait on a full re-read of every calendar for each event,
  // which made a two-event request slow enough to be talked over and cancelled.
  const createEvent = useCallback(
    async (payload) => {
      const res = await api.calendar.createEvent(payload);
      void fetchAll(feedUrls);
      window.setTimeout(() => fetchAll(feedUrls), 1500); // reconcile provider propagation
      return res;
    },
    [feedUrls],
  );
  const updateEvent = useCallback(
    async (payload) => {
      const res = await api.calendar.updateEvent(payload);
      void fetchAll(feedUrls);
      window.setTimeout(() => fetchAll(feedUrls), 1500);
      return res;
    },
    [feedUrls],
  );

  // Optimistically drop the right rows so the list updates instantly.
  const deleteEvent = useCallback(
    async (event, scope) => {
      const drop = (predicate) => {
        setStore({ rawEvents: store.rawEvents.filter((e) => !predicate(e)) });
        persist();
      };
      if (event.source === 'google') {
        if (scope === 'all' && event.recurringEventId) drop((e) => e.recurringEventId === event.recurringEventId);
        else drop((e) => e.id === event.eventId);
      } else if (event.source === 'apple') {
        if (scope === 'all') drop((e) => e.providerUrl === event.providerUrl);
        else drop((e) => e.providerUrl === event.providerUrl && e.start === event.startISO);
      }
      try {
        return await api.calendar.deleteEvent({
          source: event.source,
          calendarId: event.calendarId,
          eventId: event.eventId,
          recurringEventId: event.recurringEventId,
          providerUrl: event.providerUrl,
          etag: event.etag,
          scope,
          recurring: event.recurring,
          occurrenceStart: event.startISO,
          allDay: event.allDay,
        });
      } finally {
        window.setTimeout(() => fetchAll(feedUrls), 1200);
      }
    },
    [feedUrls],
  );

  return {
    events,
    calendars,
    writableCalendars: calendars.filter((c) => c.writable),
    hiddenCalendars: hidden,
    toggleCalendar,
    googleConnected: snap.status.googleConnected,
    googleConfigured: snap.status.googleConfigured,
    appleConnected: snap.status.appleConnected,
    backendReachable: snap.reachable,
    loading: snap.loading,
    lastFetchedAt: snap.fetchedAt,
    refresh,
    connectGoogle,
    connectApple,
    disconnectGoogle,
    disconnectApple,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
