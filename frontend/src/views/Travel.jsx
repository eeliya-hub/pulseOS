import {
  BedDouble,
  Check,
  ChevronDown,
  Clock,
  Cloud,
  CloudRain,
  Luggage,
  MapPin,
  Maximize2,
  Plane,
  Plus,
  Settings2,
  Star,
  Sun,
  Ticket,
  TrendingUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import GlassCard from '../components/GlassCard.jsx';
import { AddRow, EditableDate, EditableTime, RemoveButton } from '../components/InlineEdit.jsx';
import { flightTimes, formatDuration } from '../services/travel/flightTimes.js';
import ItineraryItemEditor from '../components/ItineraryItemEditor.jsx';
import PlaceSearch from '../components/PlaceSearch.jsx';
import TripEditor from '../components/TripEditor.jsx';
import TripMap from '../components/TripMap.jsx';
import { api } from '../services/api/backendClient.js';
import { toDestination } from '../utils/destination.js';
import { placePhotoUrl } from '../utils/places.js';
import { useTripLive } from '../hooks/useTripLive.js';
import { categoryOf, emptyTrip, useTravelStore } from '../hooks/useTravelStore.js';
import { useSettings } from '../hooks/useSettings.js';

const QUICK_AMOUNTS = [20, 50, 100, 250];
const DAY_MS = 86400000;

/* ── Formatting helpers ───────────────────────────────────────────────────── */

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayOf = (iso) => (iso ? new Date(`${iso}T00:00:00`) : null);
const fmtDate = (iso) => (dayOf(iso) ? dateFmt.format(dayOf(iso)) : '—');
const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Where the trip sits relative to today, as a short line for the header. */
function tripPhase(trip, now) {
  const start = dayOf(trip.start);
  const end = dayOf(trip.end);
  if (!start || !end) return { label: 'Dates not set', nights: 0 };

  const nights = Math.max(0, Math.round((end - start) / DAY_MS));
  const today = midnight(now);
  const toGo = Math.round((start - today) / DAY_MS);

  if (toGo > 0) return { label: `${toGo} day${toGo === 1 ? '' : 's'} to go`, nights, toGo };
  if (today > end) return { label: 'Trip complete', nights, done: true };
  const dayNumber = Math.round((today - start) / DAY_MS) + 1;
  return { label: `Day ${dayNumber} of ${nights + 1}`, nights, active: true };
}

/**
 * The time where the trip is. Prefers the IANA zone (correct across a daylight
 * saving change mid-trip); falls back to the raw UTC offset when the zone lookup
 * wasn't available.
 */
function destinationClock(destination, now) {
  if (!destination) return null;
  if (destination.timeZone) {
    const opts = { timeZone: destination.timeZone };
    return {
      time: new Intl.DateTimeFormat('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false }).format(now),
      date: new Intl.DateTimeFormat('en-GB', { ...opts, weekday: 'long', day: 'numeric', month: 'short' }).format(now),
      offsetHours: zoneOffsetHours(destination.timeZone, now),
    };
  }
  if (destination.utcOffsetSeconds == null) return null;
  // Shift into the destination's offset and read the result as UTC.
  const shifted = new Date(now.getTime() + destination.utcOffsetSeconds * 1000);
  return {
    time: shifted.toISOString().slice(11, 16),
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(shifted),
    // getTimezoneOffset() counts minutes *behind* UTC, so adding it gives the
    // gap between there and here.
    offsetHours: Math.round(destination.utcOffsetSeconds / 3600 + now.getTimezoneOffset() / 60),
  };
}

/** Hours the destination is ahead of (or behind) the machine's own clock. */
function zoneOffsetHours(timeZone, now) {
  try {
    const there = new Date(now.toLocaleString('en-US', { timeZone }));
    const here = new Date(now.toLocaleString('en-US'));
    return Math.round((there - here) / 3600000);
  } catch {
    return null;
  }
}

const weatherIcon = { rain: CloudRain, sun: Sun, cloud: Cloud };


/* ── View ─────────────────────────────────────────────────────────────────── */

export default function Travel() {
  const store = useTravelStore();
  const { trip, trips } = store;
  const live = useTripLive(trip);
  const { settings, update: updateSettings } = useSettings();

  const [now, setNow] = useState(() => new Date());
  const [activeDayId, setActiveDayId] = useState(null);
  const [activeFlightId, setActiveFlightId] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null); // 'new' | 'edit' | null
  const [editingItem, setEditingItem] = useState(null); // { dayId, itemId }
  const [pickingStay, setPickingStay] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Which layers the map draws, kept in settings so the way someone last left
  // their map is the way it comes back. Merged over the full layer list, so a
  // layer added after a preference was saved arrives switched on rather than
  // silently missing.
  const mapFilters = useMemo(
    () => ({ ...Object.fromEntries(MAP_LAYERS.map((l) => [l.key, true])), ...settings.travelMapLayers }),
    [settings.travelMapLayers],
  );
  const setMapFilters = useCallback((next) => updateSettings({ travelMapLayers: next }), [updateSettings]);
  // Which day's plans to pin — 'all', or one day's id.
  const [mapDay, setMapDay] = useState('all');
  const [amount, setAmount] = useState('50');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // A trip carried over from the older single-trip format knows its city but
  // not where it is. Resolve it once, and the map, currency, clock and country
  // facts all fill themselves in.
  const needsCoords = Boolean(trip?.destination?.city) && trip?.destination?.lat == null;
  useEffect(() => {
    if (!needsCoords) return undefined;
    let alive = true;
    api.travel
      .destination(trip.destination.city)
      .then((found) => {
        if (alive && found) store.patchTrip({ destination: { ...trip.destination, ...toDestination(found) } });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per trip that needs it
  }, [needsCoords, trip?.id]);

  const destination = trip?.destination ?? null;
  const phase = trip ? tripPhase(trip, now) : null;
  const clock = destinationClock(destination, now);

  const day = trip?.itinerary.find((d) => d.id === activeDayId) ?? trip?.itinerary[0] ?? null;
  const flight = trip?.flights.find((f) => f.id === activeFlightId) ?? trip?.flights[0] ?? null;
  const flightLive = flight?.code ? live.flights[flight.code.trim().toUpperCase()] : null;

  // Everything with coordinates goes on the map: the city, the hotel, and every
  // planned stop that has a real place attached. Each pin carries its category's
  // colour so the map reads the same way the itinerary does.
  const mapPoints = useMemo(() => {
    if (!trip) return [];
    const points = [];
    if (destination?.lat != null && mapFilters.places) {
      points.push({
        id: 'destination',
        lat: destination.lat,
        lon: destination.lon,
        kind: 'destination',
        label: destination.city,
        sublabel: destination.country,
      });
    }
    if (trip.stay?.lat != null && mapFilters.stay) {
      points.push({
        id: 'stay',
        lat: trip.stay.lat,
        lon: trip.stay.lon,
        kind: 'stay',
        label: trip.stay.name,
        sublabel: 'Where you’re staying',
      });
    }
    if (mapFilters.places) {
      for (const d of trip.itinerary) {
        if (mapDay !== 'all' && d.id !== mapDay) continue;
        for (const item of d.items) {
          if (item.place?.lat == null) continue;
          points.push({
            id: item.id,
            lat: item.place.lat,
            lon: item.place.lon,
            kind: item.type,
            color: categoryOf(store.categories, item.type).color,
            label: item.title || item.place.name,
            sublabel: `${d.label}${item.time ? ` · ${item.time}` : ''}`,
          });
        }
      }
    }
    return points;
  }, [trip, destination, mapFilters, mapDay, store.categories]);

  // A timetable lookup fills the flight in for you — but only the fields you
  // haven't set yourself, so an edit is never overwritten by the next refresh.
  useEffect(() => {
    if (!trip) return;
    for (const leg of trip.flights) {
      const code = (leg.code || '').trim().toUpperCase();
      const sched = code ? live.flights[code]?.schedule : null;
      if (!sched) continue;
      const patch = {};
      if (!leg.departTime && sched.departure?.time) patch.departTime = sched.departure.time;
      if (!leg.arriveTime && sched.arrival?.time) patch.arriveTime = sched.arrival.time;
      if (Object.keys(patch).length) store.patchFlight(leg.id, patch);
    }
  }, [trip, live.flights, store]);

  const rawEditedItem = editingItem
    ? trip?.itinerary
        .find((d) => d.id === editingItem.dayId)
        ?.items.find((i) => i.id === editingItem.itemId) ?? null
    : null;

  // A flight line is generated from the flight itself, so it has no photos of
  // its own — lend it the aircraft shot the flight card is already showing, and
  // the two views agree about what you're looking at.
  const editedItem = useMemo(() => {
    if (rawEditedItem?.source?.kind !== 'flight' || rawEditedItem.photos?.length) return rawEditedItem;
    const leg = trip?.flights.find((f) => f.id === rawEditedItem.source.id);
    const photo = leg?.code ? live.flights[leg.code.trim().toUpperCase()]?.airline?.photo : null;
    return photo?.url ? { ...rawEditedItem, photos: [photo] } : rawEditedItem;
  }, [rawEditedItem, trip, live.flights]);

  if (!trip) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header — trip switcher on the left, the active trip in the middle */}
      <header className="relative shrink-0 pb-3 pt-1 text-center">
        <h1 className="display-type text-3xl font-extralight tracking-wide text-white/95 md:text-4xl">
          {trip.name}
          {destination?.city ? (
            <>
              {' '}
              <span className="cyan-name font-light">{destination.city}</span>
            </>
          ) : null}
        </h1>
        <p className="mt-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.32em] text-white/36">
          {phase?.label}
          {trip.start ? ` · ${fmtDate(trip.start)} – ${fmtDate(trip.end)}` : ''}
        </p>

        <div className="hide-scrollbar absolute left-0 top-0 flex max-w-[45%] items-center gap-1.5 overflow-x-auto">
          {trips.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                store.selectTrip(t.id);
                setActiveDayId(null);
                setActiveFlightId(null);
              }}
              className={[
                'shrink-0 rounded-full px-3 py-1 text-[0.6875rem] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                t.id === trip.id ? 'accent-pill glow-ring' : 'soft-button text-white/55',
              ].join(' ')}
            >
              {t.destination?.flag ? `${t.destination.flag} ` : ''}
              {t.name}
            </button>
          ))}
        </div>

        <div className="absolute right-0 top-0 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditingTrip('new')}
            className="soft-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Trip
          </button>
          <button
            type="button"
            onClick={() => setEditingTrip('edit')}
            aria-label="Trip settings"
            className="soft-button grid h-7 w-7 place-items-center rounded-full text-white/60 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Three rows of twelve: hero + map + flight, then the itinerary spanning
          down beside the stay, currency and packing cards. 41rem is what's left
          under the header at the design scale, so the bento fills the screen
          without ever pushing the dock off it. */}
      <section className="my-auto grid max-h-[41rem] min-h-0 w-full flex-1 grid-cols-12 grid-rows-[1.25fr_1fr_1fr] gap-4">
        <TripHero destination={destination} phase={phase} clock={clock} weather={live.weather} />

        <GlassCard delay={80} className="relative col-span-4 row-span-2 min-h-0 overflow-hidden" noPadding>
          <TripMap
            points={mapPoints}
            flight={flightLive}
            showRoute={mapFilters.flight}
            showAirports={mapFilters.airports}
            center={destination}
            className="rounded-3xl"
          />
          <MapFilters
            value={mapFilters}
            onChange={setMapFilters}
            days={trip.itinerary}
            day={mapDay}
            onDay={setMapDay}
          />
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            aria-label="Expand map"
            className="absolute right-3 top-3 z-[500] grid h-8 w-8 place-items-center rounded-xl border border-white/12 bg-[#101630]/75 text-white/75 backdrop-blur-md transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </GlassCard>

        <FlightCard
          trip={trip}
          flight={flight}
          data={flightLive}
          onSelect={setActiveFlightId}
          onPatch={store.patchFlight}
          onAdd={store.addFlight}
          onRemove={store.removeFlight}
        />

        <ItineraryCard
          trip={trip}
          day={day}
          categories={store.categories}
          onSelectDay={setActiveDayId}
          onAddDay={store.addDay}
          onPatchDay={store.patchDay}
          onRemoveDay={(id) => {
            store.removeDay(id);
            setActiveDayId(null);
          }}
          onAddItem={(dayId) => {
            const item = store.addItem(dayId);
            if (item) setEditingItem({ dayId, itemId: item.id });
          }}
          onPatchItem={store.patchItem}
          onOpenItem={(dayId, itemId) => setEditingItem({ dayId, itemId })}
        />

        <StayCard trip={trip} onPick={() => setPickingStay(true)} onClear={() => store.patchTrip({ stay: null })} />

        <CurrencyCard
          trip={trip}
          destination={destination}
          fx={live.fx}
          amount={amount}
          onAmount={setAmount}
        />

        <PackingCard
          trip={trip}
          onToggle={(id, done) => store.patchPacking(id, { done })}
          onAdd={store.addPacking}
          onRemove={store.removePacking}
        />
      </section>

      {editingTrip && (
        <TripEditor
          trip={editingTrip === 'new' ? emptyTrip({ homeCurrency: trip.homeCurrency }) : trip}
          canDelete={editingTrip === 'edit' && trips.length > 1}
          onSave={(draft) => (editingTrip === 'new' ? store.createTrip(draft) : store.patchTrip(draft))}
          onDelete={() => store.deleteTrip(trip.id)}
          onClose={() => setEditingTrip(null)}
        />
      )}

      {editedItem && (
        <ItineraryItemEditor
          item={editedItem}
          categories={store.categories}
          onAddCategory={store.addCategory}
          currency={destination?.currency?.code ?? ''}
          near={destination}
          onPatch={(patch) => store.patchItem(editingItem.dayId, editingItem.itemId, patch)}
          onRemove={() => store.removeItem(editingItem.dayId, editingItem.itemId)}
          onClose={() => setEditingItem(null)}
        />
      )}

      {pickingStay && (
        <StayPicker
          near={destination}
          onPick={(place) => {
            store.patchTrip({
              stay: {
                id: place.id,
                name: place.name,
                address: place.address,
                lat: place.lat,
                lon: place.lon,
                rating: place.rating,
                ratingCount: place.ratingCount,
                photos: place.photos ?? [],
                photo: place.photo,
                phone: place.phone,
                website: place.website,
                mapsUrl: place.mapsUrl,
              },
            });
            setPickingStay(false);
          }}
          onClose={() => setPickingStay(false)}
        />
      )}

      {mapOpen && (
        <ExpandedMap
          points={mapPoints}
          flight={flightLive}
          center={destination}
          filters={mapFilters}
          onFilters={setMapFilters}
          days={trip.itinerary}
          day={mapDay}
          onDay={setMapDay}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Trip hero ────────────────────────────────────────────────────────────── */

function TripHero({ destination, phase, clock, weather }) {
  const photo = destination?.photo?.url ?? null;
  const Icon = weatherIcon[weather?.daily?.[0]?.icon] ?? Cloud;

  return (
    <GlassCard tone="cyan" className="relative col-span-5 flex min-h-0 flex-col justify-between overflow-hidden">
      {photo ? (
        <>
          <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div
            className="absolute inset-0 bg-gradient-to-tr from-[#0b1024]/95 via-[#0b1024]/82 to-[#0b1024]/55"
            aria-hidden="true"
          />
        </>
      ) : (
        <div
          className="breathe pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(116,242,255,0.12), transparent 68%)' }}
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 min-w-0">
        <span className="accent-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.2em]">
          <Plane className="h-3 w-3" aria-hidden="true" />
          {phase?.label}
        </span>
        <h2 className="display-type mt-2 flex min-w-0 items-baseline gap-2 text-3xl font-extralight tracking-wide text-white text-glow">
          <span className="truncate">{destination?.city ?? 'Pick a destination'}</span>
          {destination?.flag ? <span className="shrink-0 text-xl">{destination.flag}</span> : null}
        </h2>
        <p className="mt-1 truncate text-sm font-light text-white/55">
          {destination?.country ?? 'Open trip settings to search for one'}
          {phase?.nights ? <span className="text-white/35"> · {phase.nights} nights</span> : null}
        </p>
        {destination?.blurb && !destination?.sockets ? (
          <p className="mt-1 truncate text-[0.6875rem] leading-5 text-white/42">{destination.blurb}</p>
        ) : null}
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3">
        {/* Local time */}
        <div className="soft-row flex items-center gap-2.5 rounded-2xl p-2.5">
          <Clock className="h-4 w-4 shrink-0 text-cyan-100/80" aria-hidden="true" />
          <div className="min-w-0">
            <p className="clock-figures text-lg font-light leading-none text-white">{clock?.time ?? '--:--'}</p>
            <p className="mt-1 truncate text-[0.625rem] text-white/45">{clock?.date ?? 'Local time'}</p>
          </div>
          {clock?.offsetHours != null ? (
            <span className="ml-auto shrink-0 text-[0.625rem] font-medium text-white/40">
              {clock.offsetHours >= 0 ? `+${clock.offsetHours}` : clock.offsetHours}h
            </span>
          ) : null}
        </div>

        {/* Weather there */}
        <div className="soft-row flex items-center gap-2.5 rounded-2xl p-2.5">
          <Icon className="h-5 w-5 shrink-0 text-cyan-100/80" strokeWidth={1.6} aria-hidden="true" />
          <div className="min-w-0">
            <p className="clock-figures text-lg font-light leading-none text-white">
              {weather?.temperature != null ? `${weather.temperature}°` : '—'}
            </p>
            <p className="mt-1 truncate text-[0.625rem] text-white/45">{weather?.condition ?? 'Weather'}</p>
          </div>
          {weather?.high != null ? (
            <span className="clock-figures ml-auto shrink-0 text-[0.625rem] font-medium text-white/40">
              {weather.high}° / {weather.low}°
            </span>
          ) : null}
        </div>
      </div>

      {/* Country facts — the small stuff you look up on the first day */}
      {destination?.sockets ? (
        <div className="relative z-10 mt-2.5 flex items-center gap-x-4 overflow-hidden border-t border-white/10 pt-2 text-[0.5625rem] text-white/45">
          <Fact label="Plug" value={`Type ${destination.sockets} · ${destination.voltage}V`} />
          <Fact label="Drives" value={destination.drivingSide} />
          <Fact label="Dial" value={destination.callingCode} />
          <Fact label="Emergency" value={destination.emergency} />
        </div>
      ) : null}
    </GlassCard>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-semibold uppercase tracking-[0.14em] text-white/32">{label}</span>
      <span className="text-white/70">{value}</span>
    </span>
  );
}

/* ── Map filters ──────────────────────────────────────────────────────────── */

const MAP_LAYERS = [
  { key: 'places', label: 'Places', color: '#a78bfa' },
  { key: 'stay', label: 'Stay', color: '#f472b6' },
  { key: 'flight', label: 'Route', color: '#60a5fa' },
  { key: 'airports', label: 'Airports', color: '#94a3b8' },
];

/**
 * Which layers the map draws. Deliberately low-contrast — it sits on top of the
 * map and shouldn't compete with it, so it only comes forward on hover.
 */
function MapFilters({ value, onChange, days = [], day = 'all', onDay, className = '' }) {
  return (
    <div
      className={`pointer-events-auto absolute left-3 top-3 z-[500] flex flex-wrap items-center gap-1 opacity-55 transition hover:opacity-100 ${className}`}
    >
      {MAP_LAYERS.map((layer) => {
        const on = value[layer.key];
        return (
          <button
            key={layer.key}
            type="button"
            onClick={() => onChange({ ...value, [layer.key]: !on })}
            aria-pressed={on}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.1em] backdrop-blur-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              on
                ? 'border-white/12 bg-[#101630]/75 text-white/80'
                : 'border-white/8 bg-[#101630]/45 text-white/35 line-through decoration-white/30',
            ].join(' ')}
          >
            <span
              className="h-1.5 w-1.5 rounded-full transition"
              style={{ backgroundColor: layer.color, opacity: on ? 1 : 0.3 }}
              aria-hidden="true"
            />
            {layer.label}
          </button>
        );
      })}

      {/* Which day's plans to show — the itinerary filtered onto the map */}
      {onDay && days.length > 1 ? (
        <label className="relative inline-flex items-center">
          <span className="sr-only">Show plans for</span>
          <select
            value={day}
            onChange={(event) => onDay(event.target.value)}
            className="cursor-pointer appearance-none rounded-full border border-white/12 bg-[#101630]/75 py-0.5 pl-2 pr-5 text-[0.5625rem] font-semibold uppercase tracking-[0.1em] text-white/80 outline-none backdrop-blur-md focus:border-cyan-100/40"
          >
            <option value="all">All days</option>
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-1.5 h-2.5 w-2.5 text-white/50"
            aria-hidden="true"
          />
        </label>
      ) : null}
    </div>
  );
}

/* ── Flight ───────────────────────────────────────────────────────────────── */

/**
 * The booked flight: airline artwork behind the detail, the route across the
 * bottom. It shows the route only — no live position — so a number that flies
 * daily can't put someone else's aeroplane on your trip.
 */
function FlightCard({ trip, flight, data, onSelect, onPatch, onAdd, onRemove }) {
  const airline = data?.airline ?? null;
  // Departure is typed in; arrival follows from it unless it's typed in too.
  const times = flightTimes(flight, data);
  const [addingLeg, setAddingLeg] = useState(false);
  const away = data?.daysAway;
  const when =
    away == null
      ? null
      : away > 1
        ? `In ${away} days`
        : away === 1
          ? 'Tomorrow'
          : away === 0
            ? 'Today'
            : away === -1
              ? 'Yesterday'
              : `${Math.abs(away)} days ago`;

  return (
    <GlassCard delay={140} className="relative col-span-3 flex min-h-0 flex-col overflow-hidden">
      <AircraftPhoto photo={airline?.photo} label={airline?.name} />

      <div className="relative z-20 flex shrink-0 items-center gap-2">
        <p className="flex shrink-0 items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
          <Plane className="h-3.5 w-3.5" aria-hidden="true" />
          Flight
        </p>

        {/* Leg switcher sits on the header line — it's a label, not a control bar */}
        {trip.flights.length > 1 ? (
          <div className="hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
            {trip.flights.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelect(f.id)}
                className={[
                  'shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.1em] transition focus:outline-none',
                  f.id === flight?.id ? 'bg-cyan-200/15 text-cyan-100 ring-1 ring-cyan-200/25' : 'text-white/35 hover:text-white/70',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setAddingLeg((open) => !open)}
            aria-label="Add a flight"
            aria-expanded={addingLeg}
            className="text-white/35 transition hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* Which leg this is — a return, or another hop on a multi-leg trip */}
          {addingLeg ? (
            <>
              <button
                type="button"
                aria-label="Close leg menu"
                onClick={() => setAddingLeg(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <div className="absolute right-0 top-5 z-30 flex w-28 flex-col gap-0.5 rounded-xl border border-white/12 bg-[#101630]/95 p-1 shadow-xl backdrop-blur-md">
              {legOptions(trip.flights).map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    const created = onAdd({ label });
                    if (created) onSelect(created.id);
                    setAddingLeg(false);
                  }}
                  className="rounded-lg px-2 py-1 text-left text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none"
                >
                  {label}
                </button>
              ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!flight ? (
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <AddRow label="Add a flight" onClick={() => setAddingLeg(true)} />
        </div>
      ) : (
        <>
          <div className="group relative z-10 mt-2 flex shrink-0 items-center gap-2">
            <AirlineLogo src={airline?.logo} name={airline?.name} />
            <input
              value={flight.code}
              onChange={(event) => onPatch(flight.id, { code: event.target.value.toUpperCase() })}
              placeholder="BA117"
              aria-label="Flight number"
              size={6}
              className="editable-field editable-auto clock-figures min-w-[3.5rem] max-w-[7rem] bg-transparent text-lg font-medium tracking-wide text-white outline-none placeholder:text-white/25"
            />
            {when ? (
              <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-white/60 ring-1 ring-white/12">
                {when}
              </span>
            ) : null}
            <RemoveButton onClick={() => onRemove(flight.id)} label="Remove flight" className="ml-auto" />
          </div>

          <div className="relative z-10 mt-0.5 flex shrink-0 items-center gap-1.5 text-[0.625rem]">
            <EditableDate
              value={flight.date}
              onChange={(value) => onPatch(flight.id, { date: value })}
              aria-label="Flight date"
              className="text-cyan-100/60"
            />
            <span className="text-white/20" aria-hidden="true">
              ·
            </span>
            <span className="min-w-0 truncate text-white/45">
              {airline?.name ?? (flight.code ? 'No route on file for this number' : 'Enter a flight number')}
            </span>
          </div>


          {/* The route itself */}
          <div className="relative z-10 mt-auto shrink-0">
            <div className="flex items-end justify-between gap-2">
              <Airport
                code={data?.origin?.iata}
                city={data?.origin?.city}
                time={times.depart}
                onTime={(value) => onPatch(flight.id, { departTime: value })}
                timeLabel="Departure time"
              />
              <span className="mb-2 flex flex-1 items-center gap-1.5 text-white/25" aria-hidden="true">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/30" />
                <PlaneGlyph className="h-3 w-3 shrink-0 text-cyan-100/75" />
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/30" />
              </span>
              <Airport
                code={data?.destination?.iata}
                city={data?.destination?.city}
                align="right"
                time={times.arrive}
                onTime={(value) => onPatch(flight.id, { arriveTime: value })}
                timeLabel="Arrival time"
                estimated={times.arriveEstimated}
                dayOffset={times.dayOffset}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-1 border-t border-white/10 pt-2">
              <Stat
                label="Distance"
                value={data?.distanceKm ? `${data.distanceKm.toLocaleString('en-GB')} km` : '—'}
              />
              <Stat
                label={times.arrive && !times.arriveEstimated ? 'In the air' : 'In the air ≈'}
                value={formatDuration(times.minutes)}
              />
            </div>
          </div>
        </>
      )}
    </GlassCard>
  );
}

/**
 * What to call the next leg. Outbound and Return cover a return trip; anything
 * beyond that is numbered, so a multi-city itinerary keeps going.
 */
function legOptions(flights) {
  const used = new Set(flights.map((f) => (f.label || '').toLowerCase()));
  const options = [];
  if (!used.has('outbound')) options.push('Outbound');
  if (!used.has('return')) options.push('Return');
  options.push(`Leg ${flights.length + 1}`);
  return options;
}

/**
 * A rough time in the air from the great-circle distance — cruise plus taxi and
 * climb. Marked "≈" because free feeds carry no schedule to check it against.
 */
/** A plane seen from above, nose to the right — the glyph that rides a route line. */
function PlaneGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path
        transform="rotate(90 12 12)"
        d="M12 2c.7 0 1.2.9 1.2 2v5.6l7.6 4.4v1.9l-7.6-2.3v4.6l2.4 1.7v1.5L12 20.4l-3.6.9v-1.5l2.4-1.7v-4.6L3.2 15.9V14l7.6-4.4V4c0-1.1.5-2 1.2-2z"
      />
    </svg>
  );
}

/**
 * The airline's mark, small and inline with the flight number. Coverage isn't
 * complete, so a missing file leaves the row to the number itself.
 */
function AirlineLogo({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt={name ? `${name} logo` : ''}
      title={name ?? undefined}
      onError={() => setFailed(true)}
      className="h-5 w-5 shrink-0 rounded object-contain"
    />
  );
}

/**
 * One of the airline's aircraft behind the card, the way the hotel photo sits
 * behind the stay. It's whatever picture leads their Wikipedia article, so it's
 * their livery without anyone having to type a registration.
 */
function AircraftPhoto({ photo, label }) {
  const [failed, setFailed] = useState(false);
  if (!photo?.url || failed) return null;
  return (
    <>
      <img
        src={photo.url}
        alt={label ? `${label} aircraft` : ''}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.28]"
      />
      <div
        className="absolute inset-0 bg-gradient-to-tr from-[#0b1024]/95 via-[#0b1024]/82 to-[#0b1024]/55"
        aria-hidden="true"
      />
      {photo.photographer ? (
        <a
          href={photo.link ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-1.5 right-2.5 z-10 text-[0.5rem] uppercase tracking-[0.1em] text-white/25 transition hover:text-white/50"
        >
          © {photo.photographer} · {photo.credit}
        </a>
      ) : null}
    </>
  );
}

function Airport({ code, city, align = 'left', time, onTime, timeLabel, estimated, dayOffset = 0 }) {
  const right = align === 'right';
  return (
    <div className={right ? 'text-right' : ''}>
      <p className="clock-figures text-xl font-light leading-none text-white">{code ?? '···'}</p>
      <p className="mt-1 max-w-[6rem] truncate text-[0.625rem] text-white/40">{city ?? ''}</p>
      {onTime ? (
        <p className={`mt-1 flex items-baseline gap-1 text-[0.6875rem] ${right ? 'justify-end' : ''}`}>
          <EditableTime
            value={time ?? ''}
            onChange={onTime}
            placeholder="--:--"
            aria-label={timeLabel}
            className={estimated ? 'text-cyan-100/45' : 'text-cyan-100/80'}
          />
          {dayOffset ? (
            <span className="text-[0.5625rem] font-semibold text-amber-200/70">
              {dayOffset > 0 ? `+${dayOffset}` : dayOffset}d
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-white/32">{label}</p>
      <p className="clock-figures mt-0.5 text-[0.8125rem] font-medium text-white/85">{value}</p>
    </div>
  );
}

/* ── Itinerary ────────────────────────────────────────────────────────────── */

function ItineraryCard({
  trip,
  day,
  categories,
  onSelectDay,
  onAddDay,
  onPatchDay,
  onRemoveDay,
  onAddItem,
  onPatchItem,
  onOpenItem,
}) {
  const items = day?.items ?? [];
  const done = items.filter((item) => item.done).length;

  return (
    <GlassCard delay={200} className="col-span-5 row-span-2 flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">Itinerary</p>
        {day ? (
          <span className="clock-figures text-[0.6875rem] font-medium text-white/45">
            {done}/{items.length}
          </span>
        ) : null}
      </div>

      <div className="hide-scrollbar mt-2.5 flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5">
        {trip.itinerary.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelectDay(d.id)}
            className={[
              'shrink-0 rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] transition focus:outline-none',
              d.id === day?.id ? 'accent-pill glow-ring' : 'soft-button text-white/55',
            ].join(' ')}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAddDay()}
          aria-label="Add day"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-white/25 text-white/40 transition hover:border-cyan-100/55 hover:text-cyan-100/70 focus:outline-none"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {day ? (
        <>
          <div className="mt-2.5 flex shrink-0 items-center gap-2">
            <input
              value={day.label}
              onChange={(event) => onPatchDay(day.id, { label: event.target.value })}
              aria-label="Day label"
              className="editable-field editable-auto bg-transparent text-[0.8125rem] font-medium text-white/85 outline-none"
            />
            <span className="text-white/20" aria-hidden="true">
              ·
            </span>
            <EditableDate
              value={day.date}
              onChange={(value) => onPatchDay(day.id, { date: value })}
              aria-label="Day date"
              className="text-[0.75rem] text-cyan-100/70"
            />
            {trip.itinerary.length > 1 ? (
              <RemoveButton onClick={() => onRemoveDay(day.id)} label="Remove day" className="ml-auto" />
            ) : null}
          </div>

          <div className="glass-scroll mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {items.map((item) => (
              <ItineraryRow
                key={item.id}
                item={item}
                category={categoryOf(categories, item.type)}
                onToggle={() => onPatchItem(day.id, item.id, { done: !item.done })}
                onOpen={() => onOpenItem(day.id, item.id)}
              />
            ))}
            <AddRow label="Add a plan" onClick={() => onAddItem(day.id)} />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <AddRow label="Add your first day" onClick={() => onAddDay()} />
        </div>
      )}
    </GlassCard>
  );
}

function ItineraryRow({ item, category, onToggle, onOpen }) {
  const meta = category;
  return (
    <div className="group flex items-center gap-2 rounded-xl px-1 py-1.5 transition hover:bg-white/[0.05]">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.done ? 'Mark not done' : 'Mark done'}
        className="shrink-0 focus:outline-none"
      >
        <span
          className={[
            'grid h-4 w-4 place-items-center rounded-md border transition-all',
            item.done ? 'border-cyan-100/60 bg-cyan-100/15' : 'border-white/28',
          ].join(' ')}
        >
          {item.done && <Check className="h-2.5 w-2.5 text-cyan-100" aria-hidden="true" />}
        </span>
      </button>

      <span
        className="h-6 w-0.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color, opacity: item.done ? 0.3 : 0.9 }}
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span className="clock-figures w-11 shrink-0 text-[0.6875rem] text-cyan-100/65">{item.time || '—'}</span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[0.8125rem] ${item.done ? 'text-white/35 line-through' : 'text-white/85'}`}
          >
            {item.title || 'Untitled plan'}
          </span>
          {item.place?.name || item.note ? (
            <span className="mt-0.5 flex items-center gap-1 truncate text-[0.625rem] text-white/38">
              {item.place?.name ? (
                <>
                  <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.place.name}</span>
                </>
              ) : (
                <span className="truncate">{item.note}</span>
              )}
            </span>
          ) : null}
        </span>
        {item.cost ? (
          <span className="clock-figures shrink-0 text-[0.6875rem] font-medium text-white/45">{item.cost}</span>
        ) : null}
        {item.booked ? (
          <Ticket className="h-3 w-3 shrink-0 text-emerald-300/80" aria-hidden="true" />
        ) : null}
      </button>
    </div>
  );
}

/* ── Stay ─────────────────────────────────────────────────────────────────── */

function StayCard({ trip, onPick, onClear }) {
  const stay = trip.stay;
  const photo = placePhotoUrl(stay?.photos?.[0] ?? stay?.photo, 480);

  return (
    <GlassCard tone="pink" delay={260} className="relative col-span-3 flex min-h-0 flex-col overflow-hidden">
      {photo ? (
        <>
          <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1024]/92 to-[#0b1024]/45" aria-hidden="true" />
        </>
      ) : null}

      <div className="relative z-10 flex shrink-0 items-center justify-between">
        <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
          <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />
          Stay
        </p>
        <button
          type="button"
          onClick={onPick}
          aria-label="Find a hotel"
          className="text-white/35 transition hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {stay ? (
        <div className="relative z-10 mt-auto min-w-0">
          <p className="display-type truncate text-base font-normal text-white">{stay.name}</p>
          <p className="mt-0.5 line-clamp-2 text-[0.625rem] leading-4 text-white/45">{stay.address}</p>
          <div className="mt-2 flex items-center gap-3">
            {stay.rating ? (
              <span className="flex items-center gap-1 text-[0.6875rem] font-semibold text-amber-200/90">
                <Star className="h-3 w-3 fill-amber-200/90" aria-hidden="true" />
                {stay.rating.toFixed(1)}
                {stay.ratingCount ? <span className="text-white/35">({stay.ratingCount})</span> : null}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClear}
              className="ml-auto text-[0.625rem] font-medium text-white/30 transition hover:text-rose-300/80 focus:outline-none"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="relative z-10 m-auto flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3 text-white/40 transition hover:text-white/75 focus:outline-none"
        >
          <BedDouble className="h-5 w-5" aria-hidden="true" />
          <span className="text-[0.6875rem] font-medium uppercase tracking-[0.12em]">Find a hotel</span>
        </button>
      )}
    </GlassCard>
  );
}

function StayPicker({ near, onPick, onClose }) {
  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="theme-card fade-in relative z-10 flex h-[min(32rem,calc(100dvh-4rem))] w-full max-w-lg flex-col rounded-3xl p-5">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <div>
            <h2 className="display-type text-lg font-light text-white text-glow">Where are you staying?</h2>
            <p className="mt-0.5 text-[0.625rem] font-medium uppercase tracking-[0.22em] text-white/38">
              Hotels near {near?.city ?? 'your destination'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <PlaceSearch kind="hotel" near={near} onPick={onPick} autoFocus className="min-h-0 flex-1" />
      </div>
    </div>,
    document.body,
  );
}

/* ── Currency ─────────────────────────────────────────────────────────────── */

function CurrencyCard({ trip, destination, fx, amount, onAmount }) {
  const homeCode = trip.homeCurrency || 'GBP';
  const destCode = destination?.currency?.code ?? null;
  const destSymbol = destination?.currency?.symbol ?? '';
  const rate = fx?.rate ?? null;
  const value = Number(amount) || 0;
  const converted = rate ? value * rate : null;

  return (
    <GlassCard tone="green" delay={320} className="relative col-span-4 flex min-h-0 flex-col overflow-hidden">
      <BanknotePhoto photo={fx?.photo} label={destCode} />

      <div className="relative z-10 flex shrink-0 items-center justify-between">
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/60">Currency</p>
        {fx?.series?.length ? <Sparkline series={fx.series} /> : null}
      </div>

      {destCode ? (
        <>
          <div className="relative z-10 my-auto grid grid-cols-2 items-center gap-3">
            <label className="flex items-baseline gap-1.5">
              <span className="text-base font-light text-white/55">{homeCode}</span>
              <input
                value={amount}
                onChange={(event) => onAmount(event.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                aria-label={`Amount in ${homeCode}`}
                className="clock-figures w-full min-w-0 bg-transparent text-2xl font-light text-white focus:outline-none"
              />
            </label>
            <div className="flex items-baseline gap-1.5 border-l border-white/10 pl-3">
              <span className="text-base font-light text-cyan-100/70">{destSymbol || destCode}</span>
              <span className="clock-figures truncate text-2xl font-light text-cyan-100">
                {converted != null
                  ? converted.toLocaleString('en-GB', { maximumFractionDigits: converted > 100 ? 0 : 2 })
                  : '—'}
              </span>
            </div>
          </div>

          <div className="relative z-10 flex shrink-0 items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {QUICK_AMOUNTS.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => onAmount(String(quick))}
                  className="soft-button rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  {quick}
                </button>
              ))}
            </div>
            <p className="clock-figures truncate text-[0.625rem] font-medium text-white/65">
              {rate ? `1 ${homeCode} = ${rate.toFixed(rate > 20 ? 2 : 4)} ${destCode}` : 'Rate unavailable'}
            </p>
          </div>
          {fx?.date ? (
            <p className="relative z-10 mt-1 shrink-0 truncate text-[0.5625rem] uppercase tracking-[0.14em] text-white/45">
              {fx.source} · {fx.date}
            </p>
          ) : null}
        </>
      ) : (
        <p className="relative z-10 m-auto max-w-[16rem] text-center text-xs text-white/38">
          Set a destination and Pulse pulls its currency and the live rate.
        </p>
      )}
    </GlassCard>
  );
}

/**
 * The destination's banknotes behind the converter — Wikipedia's picture of the
 * current series, so the money you'll be handling is the money on the card.
 */
function BanknotePhoto({ photo, label }) {
  const [failed, setFailed] = useState(false);
  if (!photo?.url || failed) return null;
  return (
    <>
      <img
        src={photo.url}
        alt={label ? `${label} banknotes` : ''}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover opacity-[0.45]"
      />
      <div
        className="absolute inset-0 bg-gradient-to-tr from-[#0b1024]/88 via-[#0b1024]/68 to-[#0b1024]/40"
        aria-hidden="true"
      />
    </>
  );
}

/** 30 days of the pair, drawn small — the shape matters, not the numbers. */
function Sparkline({ series }) {
  const points = series.filter((p) => Number.isFinite(p.rate));
  if (points.length < 3) return null;

  const values = points.map((p) => p.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values
    .map((rate, index) => `${(index / (values.length - 1)) * 100},${28 - ((rate - min) / span) * 24}`)
    .join(' ');
  const rising = values[values.length - 1] >= values[0];

  return (
    <span className="flex items-center gap-1.5">
      <TrendingUp
        className={`h-3 w-3 ${rising ? 'text-emerald-300/80' : 'rotate-180 text-rose-300/80'}`}
        aria-hidden="true"
      />
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-4 w-16" aria-hidden="true">
        <polyline
          points={path}
          fill="none"
          stroke={rising ? 'rgba(110,231,183,0.8)' : 'rgba(253,164,175,0.8)'}
          strokeWidth="1.6"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

/* ── Packing ──────────────────────────────────────────────────────────────── */

function PackingCard({ trip, onToggle, onAdd, onRemove }) {
  const [text, setText] = useState('');
  const items = trip.packing;
  const done = items.filter((item) => item.done).length;

  return (
    <GlassCard tone="amber" delay={380} className="col-span-3 flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <p className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
          <Luggage className="h-3.5 w-3.5" aria-hidden="true" />
          Packing
        </p>
        <span className="clock-figures text-[0.6875rem] font-medium text-white/48">
          {done}/{items.length}
        </span>
      </div>

      <div className="mt-2 h-1 shrink-0 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-200 to-cyan-200 transition-all duration-500"
          style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
        />
      </div>

      <div className="glass-scroll mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-white/5">
            <button
              type="button"
              onClick={() => onToggle(item.id, !item.done)}
              aria-label={item.done ? 'Mark not packed' : 'Mark packed'}
              className="shrink-0 focus:outline-none"
            >
              <span
                className={[
                  'grid h-4 w-4 place-items-center rounded-md border transition-all',
                  item.done ? 'border-cyan-100/60 bg-cyan-100/15' : 'border-white/28',
                ].join(' ')}
              >
                {item.done && <Check className="h-2.5 w-2.5 text-cyan-100" aria-hidden="true" />}
              </span>
            </button>
            <span
              className={`min-w-0 flex-1 truncate text-[0.75rem] ${item.done ? 'text-white/35 line-through' : 'text-white/78'}`}
            >
              {item.label}
            </span>
            <RemoveButton onClick={() => onRemove(item.id)} />
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = text.trim();
          if (!value) return;
          onAdd(value);
          setText('');
        }}
        className="mt-2 flex shrink-0 items-center gap-1.5 border-t border-white/8 pl-1 pt-2"
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add item"
          className="w-full bg-transparent text-xs text-white placeholder:text-white/35 focus:outline-none"
        />
      </form>
    </GlassCard>
  );
}

/* ── Expanded map ─────────────────────────────────────────────────────────── */

function ExpandedMap({ points, flight, center, filters, onFilters, days, day, onDay, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div data-settings="" className="fixed inset-0 z-[70] p-4">
      <div className="absolute inset-0 bg-[#070b18]/80 backdrop-blur-sm" aria-hidden="true" />
      <div className="theme-card fade-in relative z-10 flex h-full w-full flex-col overflow-hidden rounded-3xl p-3">
        <div className="mb-2 flex shrink-0 items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-100/80" aria-hidden="true" />
            <p className="display-type text-base font-light text-white">{center?.city ?? 'Trip map'}</p>
            <span className="text-[0.625rem] uppercase tracking-[0.18em] text-white/35">
              {points.length} pin{points.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="grid h-8 w-8 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <TripMap
            points={points}
            flight={flight}
            showRoute={filters?.flight ?? true}
            showAirports={filters?.airports ?? true}
            center={center}
            className="h-full"
            interactive
          />
          {filters ? (
            <MapFilters value={filters} onChange={onFilters} days={days} day={day} onDay={onDay} />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
