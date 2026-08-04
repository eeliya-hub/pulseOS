import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { dateKey } from './useLifeData.js';
import { getSettings, useSettings } from './useSettings.js';

// Colour + label per connected source (fallback tint when a calendar has none).
export const SOURCE_META = {
  google: { label: 'Google', color: '#4285F4' },
  apple: { label: 'Apple', color: '#FF3B30' },
  ical: { label: 'Subscribed', color: '#34C759' },
};

const ICAL_PALETTE = ['#34C759', '#FF9F0A', '#5E5CE6', '#FF2D55', '#64D2FF', '#BF5AF2'];
const fmtTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const HOUR = 60 * 60 * 1000;
const LS_KEY = 'pulse.calendar.cache.v1';

// ── Module-level store, shared across every mount ──────────────────────────
// Events/calendars are fetched once and cached (in memory + localStorage) so
// switching tabs never refetches; it auto-refreshes at most hourly, plus on
// demand (refresh button) and after create/edit/delete.
const DEFAULTS = {
  rawEvents: [],
  remoteCalendars: [],
  status: { googleConnected: false, googleConfigured: false, appleConnected: false },
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

let inFlight = null;
async function fetchAll(feedUrls) {
  if (inFlight) return inFlight;
  setStore({ loading: true });
  inFlight = (async () => {
    try {
      const status = await api.calendar.status().catch(() => ({ google: {}, apple: {} }));
      const g = Boolean(status.google?.connected);
      const a = Boolean(status.apple?.connected);
      const nextStatus = { googleConnected: g, googleConfigured: Boolean(status.google?.configured), appleConnected: a };
      const remoteCalendars = g || a ? await api.calendar.calendars().then((r) => r.calendars ?? []).catch(() => []) : [];

      let rawEvents = [];
      if (feedUrls || g || a) {
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const timeMax = new Date(now.getTime() + 75 * 86_400_000).toISOString();
        const res = await api.calendar
          .events({ source: 'all', url: feedUrls, timeMin, timeMax })
          .catch(() => ({ events: [] }));
        rawEvents = res.events ?? [];
      }

      setStore({ rawEvents, remoteCalendars, status: nextStatus, fetchedAt: Date.now(), fetchedFeeds: feedUrls, loading: false });
      persist();
    } finally {
      setStore({ loading: false });
      inFlight = null;
    }
  })();
  return inFlight;
}

// Warm the shared calendar store on launch (used by the preloader), so Home and
// the Life Hub render instantly. No-op if fetched within the last hour.
export function warmCalendar() {
  const feedUrls = (getSettings().icalFeeds ?? [])
    .map((f) => f.url)
    .filter(Boolean)
    .join(',');
  if (Date.now() - store.fetchedAt < HOUR && store.fetchedAt !== 0) return Promise.resolve();
  return fetchAll(feedUrls);
}

// Map a backend calendar event → the LifeHub shape, keeping CRUD references.
function toLifeEvent(e, colorForCalendar) {
  const start = e.start ? new Date(e.start) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const end = e.end ? new Date(e.end) : null;
  const date = e.allDay && typeof e.start === 'string' ? e.start.slice(0, 10) : dateKey(start);
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

  // Fetch only when the cache is stale (>1h), empty, or the feed list changed.
  useEffect(() => {
    const stale = Date.now() - store.fetchedAt > HOUR;
    if (stale || store.fetchedAt === 0 || store.fetchedFeeds !== feedUrls) fetchAll(feedUrls);
  }, [feedUrls]);

  // Hourly auto-refresh while mounted.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() - store.fetchedAt >= HOUR) fetchAll(feedUrls);
    }, HOUR);
    return () => window.clearInterval(id);
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

  const createEvent = useCallback(
    async (payload) => {
      const res = await api.calendar.createEvent(payload);
      await fetchAll(feedUrls);
      window.setTimeout(() => fetchAll(feedUrls), 1500); // reconcile provider propagation
      return res;
    },
    [feedUrls],
  );
  const updateEvent = useCallback(
    async (payload) => {
      const res = await api.calendar.updateEvent(payload);
      await fetchAll(feedUrls);
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
