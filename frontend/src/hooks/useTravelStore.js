import { useCallback, useEffect, useState } from 'react';

/**
 * Trips live entirely in the browser — the backend only supplies live data
 * (flights, rates, weather, places), never the plan itself. This is a
 * module-level store with subscribers (same shape as useSettings), so the view,
 * the map and every editor read one source of truth and re-render together.
 */
const KEY = 'pulse.travel.v3';
const LEGACY_KEY = 'pulse.travel.v2';
const LEGACY_PACKING_KEY = 'pulse.travel.packing';

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Itinerary categories. The six built-ins cover most of a trip; anything else
 * the user adds lives alongside them with its own colour, and is shared across
 * trips because "Diving" or "Work" is a habit, not a one-off.
 */
export const DEFAULT_CATEGORIES = [
  { id: 'plan', label: 'Plan', color: '#7dd3fc', builtIn: true },
  { id: 'food', label: 'Food', color: '#fbbf24', builtIn: true },
  { id: 'sight', label: 'Sight', color: '#a78bfa', builtIn: true },
  { id: 'transport', label: 'Transport', color: '#34d399', builtIn: true },
  { id: 'stay', label: 'Stay', color: '#f472b6', builtIn: true },
  { id: 'flight', label: 'Flight', color: '#60a5fa', builtIn: true },
];

/** Swatches offered when naming a new category. */
export const CATEGORY_COLORS = [
  '#7dd3fc', '#fbbf24', '#a78bfa', '#34d399', '#f472b6', '#60a5fa',
  '#fb923c', '#f87171', '#4ade80', '#e879f9', '#facc15', '#22d3ee',
];

/** Look a category up by id, falling back to the first built-in. */
export const categoryOf = (categories, id) =>
  categories.find((c) => c.id === id) ?? categories[0] ?? DEFAULT_CATEGORIES[0];

export const emptyItem = (patch = {}) => ({
  id: uid('i'),
  // Set when the line came from a booking rather than being typed: it then
  // follows that booking's date and disappears with it.
  source: null,
  type: 'plan',
  time: '',
  endTime: '',
  title: 'New plan',
  place: null,
  // Ordered list of { ref, url }; the first one is the cover shown on the row.
  photos: [],
  note: '',
  cost: '',
  booked: false,
  done: false,
  ...patch,
});

export const emptyDay = (date = '', index = 0) => ({
  id: uid('d'),
  label: `Day ${index + 1}`,
  date,
  items: [],
});

/** A blank trip. `destination` is filled in once a place is picked. */
export function emptyTrip(patch = {}) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const inAMonth = new Date(Date.now() + 30 * 86400000);
  const week = new Date(inAMonth.getTime() + 6 * 86400000);
  return {
    id: uid('t'),
    name: 'New trip',
    destination: null,
    start: iso(inAMonth),
    end: iso(week),
    homeCurrency: 'GBP',
    flights: [],
    stay: null,
    itinerary: [],
    packing: [],
    notes: '',
    ...patch,
  };
}

const STARTER_PACKING = [
  'Passport & tickets',
  'Power adapter',
  'Portable charger',
  'eSIM / roaming sorted',
  'Travel insurance',
  'Comfortable shoes',
];

const freshPacking = () => STARTER_PACKING.map((label) => ({ id: uid('p'), label, done: false }));

/**
 * The trip a brand-new install opens on, so the view is never a blank slate.
 * The flight number and the pinned places are real, which means the live
 * tracking, the map pins and the currency all have something to show on day one.
 */
function starterTrip() {
  const place = (name, lat, lon, address) => ({ name, lat, lon, address, id: `seed:${name}` });
  return emptyTrip({
    name: 'Tokyo escape',
    destination: {
      city: 'Tokyo',
      country: 'Japan',
      countryCode: 'JP',
      lat: 35.6768601,
      lon: 139.7638947,
      timeZone: 'Asia/Tokyo',
      currency: { code: 'JPY', symbol: '¥' },
      flag: '🇯🇵',
      sockets: 'A/B',
      voltage: 100,
      drivingSide: 'left',
      callingCode: '+81',
      emergency: '110 / 119',
    },
    start: '2026-08-20',
    end: '2026-09-02',
    flights: [{ id: uid('f'), label: 'Outbound', code: 'JL044', date: '2026-08-20' }],
    itinerary: [
      {
        id: uid('d'),
        label: 'Day 1',
        date: '2026-08-20',
        items: [
          emptyItem({ type: 'flight', time: '09:10', title: 'Land at Haneda' }),
          emptyItem({
            type: 'sight',
            time: '16:30',
            title: 'Shibuya crossing walk',
            place: place('Shibuya Scramble Crossing', 35.6595, 139.7005, 'Shibuya City, Tokyo'),
          }),
          emptyItem({ type: 'food', time: '19:30', title: 'Ramen reset' }),
        ],
      },
      {
        id: uid('d'),
        label: 'Day 2',
        date: '2026-08-21',
        items: [
          emptyItem({
            type: 'sight',
            time: '10:00',
            title: 'Meiji Jingu',
            place: place('Meiji Jingu', 35.6764, 139.6993, 'Shibuya City, Tokyo'),
          }),
          emptyItem({ type: 'plan', time: '', title: 'Coffee in Shimokitazawa' }),
        ],
      },
      {
        id: uid('d'),
        label: 'Day 3',
        date: '2026-08-22',
        items: [
          emptyItem({
            type: 'sight',
            time: '10:00',
            title: 'teamLab Planets',
            place: place('teamLab Planets TOKYO', 35.6487, 139.7902, 'Koto City, Tokyo'),
          }),
          emptyItem({ type: 'food', time: '20:00', title: 'Roppongi dinner' }),
        ],
      },
    ],
    packing: freshPacking(),
  });
}

/* ── Persistence ──────────────────────────────────────────────────────────── */

/** Saved categories, always with the built-ins present and in front. */
function normalizeCategories(saved) {
  const custom = (Array.isArray(saved) ? saved : [])
    .filter((c) => c?.id && c?.label && !DEFAULT_CATEGORIES.some((d) => d.id === c.id))
    .map((c) => ({ id: c.id, label: String(c.label).slice(0, 24), color: c.color || CATEGORY_COLORS[0] }));
  return [...DEFAULT_CATEGORIES, ...custom];
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Reconciled on the way in, not only on write: a stored trip can predate
      // the flight it now carries (or a change to what gets derived), and it
      // shouldn't take an unrelated edit before the flight appears in the plan.
      const trips = (parsed?.trips ?? []).map(normalizeTrip).filter(Boolean).map(reconcileDerived);
      if (trips.length) {
        const activeId = trips.some((t) => t.id === parsed.activeId) ? parsed.activeId : trips[0].id;
        return { trips, activeId, categories: normalizeCategories(parsed.categories) };
      }
    }
    const migrated = migrateLegacy();
    if (migrated) return { ...migrated, trips: migrated.trips.map(reconcileDerived) };
  } catch {
    // corrupt storage — fall through to a fresh trip rather than crashing the view
  }
  const trip = reconcileDerived(starterTrip());
  return { trips: [trip], activeId: trip.id, categories: normalizeCategories([]) };
}

/**
 * Lift the old single-trip shape (pulse.travel.v2, plus its separate packing
 * list) into the first trip of the new multi-trip store, so an existing plan
 * survives the upgrade instead of being replaced by the starter.
 */
function migrateLegacy() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  const old = JSON.parse(raw);
  if (!old || typeof old !== 'object') return null;

  let packing = [];
  try {
    packing = (JSON.parse(localStorage.getItem(LEGACY_PACKING_KEY) || '[]') ?? []).map((p) => ({
      id: p?.id ?? uid('p'),
      label: p?.label ?? '',
      done: Boolean(p?.done),
    }));
  } catch {
    /* ignore a broken packing list */
  }

  const trip = normalizeTrip({
    id: uid('t'),
    name: old.city ? `${old.city} trip` : 'My trip',
    destination: old.city
      ? {
          city: old.city,
          country: old.country ?? null,
          countryCode: null,
          lat: null,
          lon: null,
          timeZone: old.timeZone ?? null,
          currency: null,
          flag: '',
        }
      : null,
    start: old.start ?? '',
    end: old.end ?? '',
    homeCurrency: 'GBP',
    flights: old.flightCode
      ? [{ id: uid('f'), label: 'Outbound', code: old.flightCode, date: old.start ?? '' }]
      : [],
    stay: old.hotelName ? { name: old.hotelName, address: old.hotelDetail ?? '' } : null,
    itinerary: old.itinerary ?? [],
    packing: packing.filter((p) => p.label).length ? packing.filter((p) => p.label) : freshPacking(),
    notes: '',
  });

  return { trips: [trip], activeId: trip.id, categories: normalizeCategories([]) };
}

/** Coerce any saved trip into the current shape — old copies must never crash the view. */
function normalizeTrip(trip) {
  if (!trip || typeof trip !== 'object') return null;
  return {
    ...emptyTrip(),
    ...trip,
    id: trip.id ?? uid('t'),
    name: trip.name ?? 'Trip',
    flights: (trip.flights ?? []).map((f, i) => ({
      departTime: f?.departTime ?? '',
      arriveTime: f?.arriveTime ?? '',
      id: f?.id ?? uid('f'),
      label: f?.label ?? (i === 0 ? 'Outbound' : 'Return'),
      code: f?.code ?? '',
      date: f?.date ?? '',
    })),
    packing: (trip.packing ?? []).map((p) => ({
      id: p?.id ?? uid('p'),
      label: p?.label ?? '',
      done: Boolean(p?.done),
    })),
    itinerary: (trip.itinerary ?? []).map((day, index) => ({
      id: day?.id ?? uid('d'),
      label: day?.label ?? `Day ${index + 1}`,
      date: day?.date ?? '',
      items: (day?.items ?? []).map((item) =>
        emptyItem({
          ...item,
          id: item?.id ?? uid('i'),
          type: typeof item?.type === 'string' && item.type ? item.type : 'plan',
          source: item?.source ?? null,
          title: item?.title ?? '',
          photos: Array.isArray(item?.photos) ? item.photos.filter((p) => p?.ref || p?.url) : [],
        }),
      ),
    })),
  };
}

/* ── Bookings → itinerary ─────────────────────────────────────────────────── */

/** The day matching a date, created (and the days re-sorted) when there isn't one. */
function ensureDay(itinerary, date) {
  const existing = itinerary.find((day) => day.date === date);
  if (existing) return { itinerary, day: existing };

  const day = emptyDay(date, itinerary.length);
  // Dated days read best in order; undated ones stay on the end.
  const sorted = [...itinerary, day].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  // Only renumber the labels nobody has renamed.
  const relabelled = sorted.map((d, index) => (/^Day \d+$/.test(d.label) ? { ...d, label: `Day ${index + 1}` } : d));
  return { itinerary: relabelled, day: relabelled.find((d) => d.id === day.id) };
}

/**
 * Keep the itinerary in step with what's booked.
 *
 * Every flight with a number and a date gets a line on that day, and a hotel
 * gets check-in and check-out lines on the trip's dates. They're tagged with
 * `source`, so they move when the booking moves and vanish when it's deleted —
 * while anything typed onto them (a time, a note, a cost) is left alone.
 */
function reconcileDerived(trip) {
  const stayPlace = trip.stay
    ? {
        id: trip.stay.id ?? null,
        name: trip.stay.name,
        address: trip.stay.address ?? '',
        lat: trip.stay.lat ?? null,
        lon: trip.stay.lon ?? null,
        photos: trip.stay.photos ?? [],
      }
    : null;

  const wanted = [];
  for (const flight of trip.flights) {
    const code = (flight.code || '').trim();
    if (!code || !flight.date) continue;
    wanted.push({
      source: { kind: 'flight', id: flight.id },
      date: flight.date,
      fields: { type: 'flight', title: `${code}${flight.label ? ` · ${flight.label}` : ''}` },
      // The departure time belongs to the flight, so it overwrites rather than
      // merely seeding: change the time on the flight card and the itinerary
      // line moves with it, instead of keeping whatever it was created with.
      derived: flight.departTime ? { time: flight.departTime } : undefined,
    });
  }
  if (stayPlace?.name) {
    if (trip.start) {
      wanted.push({
        source: { kind: 'stay', part: 'in' },
        date: trip.start,
        fields: { type: 'stay', title: `Check in · ${stayPlace.name}`, place: stayPlace },
        defaults: { time: '15:00' },
      });
    }
    if (trip.end) {
      wanted.push({
        source: { kind: 'stay', part: 'out' },
        date: trip.end,
        fields: { type: 'stay', title: `Check out · ${stayPlace.name}`, place: stayPlace },
        defaults: { time: '11:00' },
      });
    }
  }

  // Drop every derived line first, remembering what the user added to it.
  const kept = new Map();
  let itinerary = trip.itinerary.map((day) => ({
    ...day,
    items: day.items.filter((item) => {
      if (!item.source) return true;
      kept.set(JSON.stringify(item.source), item);
      return false;
    }),
  }));

  for (const entry of wanted) {
    const previous = kept.get(JSON.stringify(entry.source));
    const item = emptyItem({
      ...(previous ?? entry.defaults ?? {}),
      ...entry.fields,
      // `defaults` only seed a brand-new line, so your own edits survive;
      // `derived` values are owned by the flight or stay and always win.
      ...(entry.derived ?? {}),
      id: previous?.id ?? uid('i'),
      source: entry.source,
    });
    const placed = ensureDay(itinerary, entry.date);
    itinerary = placed.itinerary.map((day) =>
      day.id === placed.day.id ? { ...day, items: sortByTime([...day.items, item]) } : day,
    );
  }

  return { ...trip, itinerary };
}

/** Timed lines first and in order; untimed ones keep their place at the end. */
function sortByTime(items) {
  return [...items].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

let state = load();
const subscribers = new Set();

function commit(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode) — keep working in memory
  }
  subscribers.forEach((fn) => fn(state));
}

/**
 * Apply a change to one trip by id, leaving the rest of the store untouched.
 * `derive` re-runs the booking → itinerary sync, for the changes that need it.
 */
function withTrip(id, updater, { derive = false } = {}) {
  commit({
    ...state,
    trips: state.trips.map((trip) => {
      if (trip.id !== id) return trip;
      const next = updater(trip);
      return derive ? reconcileDerived(next) : next;
    }),
  });
}

const mapDays = (trip, dayId, updater) => ({
  ...trip,
  itinerary: trip.itinerary.map((day) => (day.id === dayId ? updater(day) : day)),
});

/* ── Outside React ────────────────────────────────────────────────────────── */

// The assistant works on whichever trip it was asked about, not only the one open
// in the Travel view, so these take the trip's id instead of reading it from a
// mounted hook.

/** The travel store as it is right now. */
export const getTravelState = () => state;

export function addPackingItem(tripId, label) {
  const item = { id: uid('p'), label, done: false };
  withTrip(tripId, (t) => ({ ...t, packing: [...(t.packing ?? []), item] }));
  return item;
}

export function setPackingDone(tripId, itemId, done) {
  withTrip(tripId, (t) => ({
    ...t,
    packing: (t.packing ?? []).map((p) => (p.id === itemId ? { ...p, done } : p)),
  }));
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useTravelStore() {
  const [snapshot, setSnapshot] = useState(state);

  useEffect(() => {
    const fn = (next) => setSnapshot(next);
    subscribers.add(fn);
    setSnapshot(state); // sync in case it changed before mount
    return () => subscribers.delete(fn);
  }, []);

  const trip = snapshot.trips.find((t) => t.id === snapshot.activeId) ?? snapshot.trips[0] ?? null;
  const tripId = trip?.id;

  const selectTrip = useCallback((id) => commit({ ...state, activeId: id }), []);

  /* Categories — shared across trips */
  const addCategory = useCallback((label, color) => {
    const name = (label || '').trim().slice(0, 24);
    if (!name) return null;
    const existing = state.categories.find((c) => c.label.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const category = { id: uid('cat'), label: name, color: color || CATEGORY_COLORS[0] };
    commit({ ...state, categories: [...state.categories, category] });
    return category;
  }, []);

  const removeCategory = useCallback((id) => {
    if (DEFAULT_CATEGORIES.some((c) => c.id === id)) return;
    // Items pointing at a deleted category fall back to the first built-in.
    commit({
      ...state,
      categories: state.categories.filter((c) => c.id !== id),
      trips: state.trips.map((trip) => ({
        ...trip,
        itinerary: trip.itinerary.map((day) => ({
          ...day,
          items: day.items.map((item) => (item.type === id ? { ...item, type: 'plan' } : item)),
        })),
      })),
    });
  }, []);

  const createTrip = useCallback((patch) => {
    // The editor hands over a whole draft trip, whose packing list is empty —
    // only fall back to the starter list when it really has nothing.
    const packing = patch?.packing?.length ? patch.packing : freshPacking();
    const draft = emptyTrip({ ...patch, packing });
    const created = draft.itinerary.length ? draft : { ...draft, itinerary: [emptyDay(draft.start, 0)] };
    commit({ trips: [...state.trips, created], activeId: created.id });
    return created;
  }, []);

  const deleteTrip = useCallback((id) => {
    const remaining = state.trips.filter((t) => t.id !== id);
    const trips = remaining.length ? remaining : [starterTrip()];
    commit({ trips, activeId: trips.some((t) => t.id === state.activeId) ? state.activeId : trips[0].id });
  }, []);

  const patchTrip = useCallback(
    (patch) =>
      tripId &&
      withTrip(tripId, (t) => ({ ...t, ...patch }), {
        // The hotel and the trip's dates are what the derived lines hang off.
        derive: 'stay' in patch || 'start' in patch || 'end' in patch,
      }),
    [tripId],
  );

  /* Days */
  const addDay = useCallback(
    (date) => {
      if (!tripId) return;
      withTrip(tripId, (t) => ({
        ...t,
        itinerary: [...t.itinerary, emptyDay(date ?? nextDayDate(t), t.itinerary.length)],
      }));
    },
    [tripId],
  );
  const patchDay = useCallback(
    (dayId, patch) => tripId && withTrip(tripId, (t) => mapDays(t, dayId, (d) => ({ ...d, ...patch }))),
    [tripId],
  );
  const removeDay = useCallback(
    (dayId) => tripId && withTrip(tripId, (t) => ({ ...t, itinerary: t.itinerary.filter((d) => d.id !== dayId) })),
    [tripId],
  );

  /* Items */
  const addItem = useCallback(
    (dayId, patch) => {
      if (!tripId) return null;
      const item = emptyItem(patch);
      withTrip(tripId, (t) => mapDays(t, dayId, (d) => ({ ...d, items: [...d.items, item] })));
      return item;
    },
    [tripId],
  );
  const patchItem = useCallback(
    (dayId, itemId, patch) =>
      tripId &&
      withTrip(tripId, (t) =>
        mapDays(t, dayId, (d) => ({
          ...d,
          items: d.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
        })),
      ),
    [tripId],
  );
  const removeItem = useCallback(
    (dayId, itemId) =>
      tripId &&
      withTrip(tripId, (t) =>
        mapDays(t, dayId, (d) => ({ ...d, items: d.items.filter((item) => item.id !== itemId) })),
      ),
    [tripId],
  );

  /* Packing */
  const addPacking = useCallback(
    (label) =>
      tripId && withTrip(tripId, (t) => ({ ...t, packing: [...t.packing, { id: uid('p'), label, done: false }] })),
    [tripId],
  );
  const patchPacking = useCallback(
    (id, patch) =>
      tripId &&
      withTrip(tripId, (t) => ({ ...t, packing: t.packing.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    [tripId],
  );
  const removePacking = useCallback(
    (id) => tripId && withTrip(tripId, (t) => ({ ...t, packing: t.packing.filter((p) => p.id !== id) })),
    [tripId],
  );

  /* Flights */
  const addFlight = useCallback(
    (patch = {}) => {
      if (!tripId) return null;
      const flight = { id: uid('f'), label: 'Outbound', code: '', date: '', departTime: '', arriveTime: '', ...patch };
      withTrip(tripId, (t) => ({ ...t, flights: [...t.flights, flight] }), { derive: true });
      return flight;
    },
    [tripId],
  );
  const patchFlight = useCallback(
    (id, patch) =>
      tripId &&
      withTrip(
        tripId,
        (t) => ({ ...t, flights: t.flights.map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
        { derive: true },
      ),
    [tripId],
  );
  const removeFlight = useCallback(
    (id) =>
      tripId && withTrip(tripId, (t) => ({ ...t, flights: t.flights.filter((f) => f.id !== id) }), { derive: true }),
    [tripId],
  );

  return {
    trips: snapshot.trips,
    trip,
    activeId: snapshot.activeId,
    categories: snapshot.categories ?? DEFAULT_CATEGORIES,
    addCategory,
    removeCategory,
    selectTrip,
    createTrip,
    deleteTrip,
    patchTrip,
    addDay,
    patchDay,
    removeDay,
    addItem,
    patchItem,
    removeItem,
    addPacking,
    patchPacking,
    removePacking,
    addFlight,
    patchFlight,
    removeFlight,
  };
}

/** The day after the last planned one — or the trip's start date for day one. */
function nextDayDate(trip) {
  const last = trip.itinerary[trip.itinerary.length - 1];
  if (!last?.date) return trip.start || '';
  const d = new Date(`${last.date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  // Build the key from local parts — toISOString() would shift across the UTC offset.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
