import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Column, ColumnHead, Ground, SkyZone } from '../components/Stage.jsx';
import { ensureCalendarRange, SOURCE_META, useCalendarEvents } from '../hooks/useCalendarEvents.js';
import { api } from '../services/api/backendClient.js';
import {
  CALENDARS,
  REPEAT_OPTIONS,
  calendarColor,
  dateKey,
  keyToDate,
  occursOn,
  useLifeData,
} from '../hooks/useLifeData.js';
import { useSettings } from '../hooks/useSettings.js';

const inputClass =
  'w-full rounded-lg bg-white/8 px-3 py-2 text-sm text-moon placeholder:text-moon/35 ring-1 ring-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45';
const selectClass =
  'rounded-lg bg-white/8 px-2 py-2 text-xs font-medium text-moon ring-1 ring-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const projectAccents = ['#0A84FF', '#BF5AF2', '#30D158', '#FF9F0A', '#FF453A'];

// Grey provider marks shown next to events/calendars so it's clear where each
// one comes from. Rendered as a monochrome grey silhouette regardless of the
// source artwork's colours.
const SOURCE_LOGO = { google: '/logos/calendar/google.png', apple: '/logos/calendar/apple.png' };
function SourceLogo({ source, className = 'h-3.5 w-3.5' }) {
  const src = SOURCE_LOGO[source];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={source === 'apple' ? 'Apple Calendar' : 'Google Calendar'}
      className={`${className} shrink-0 object-contain [filter:brightness(0)_invert(0.6)]`}
    />
  );
}

function relativeDayLabel(key) {
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  if (key === yesterday) return 'Yesterday';
  return keyToDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The day in one place.
 *
 * The sky holds the day you're reading and the month you pick it from — the
 * calendar itself is the picker, so any day is one tap away. The ground carries
 * that day's schedule, its to-dos and habits, and the projects they belong to.
 */
export default function LifeHub() {
  const life = useLifeData();
  const calendar = useCalendarEvents();

  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [editing, setEditing] = useState(null); // null · 'new' · local event
  const [editingConnected, setEditingConnected] = useState(null); // connected event
  const [viewing, setViewing] = useState(null); // event open in detail view

  const openEdit = (event) => {
    setViewing(null);
    if (event.source) setEditingConnected(event);
    else setEditing(event);
  };
  const removeEvent = async (event, scope) => {
    setViewing(null);
    if (event.source) await calendar.deleteEvent(event, scope);
    else life.removeEvent(event.id);
  };

  // Local (editable) events + read-only ones from connected calendars.
  const allEvents = useMemo(() => [...life.events, ...(calendar?.events ?? [])], [life.events, calendar?.events]);
  const events = allEvents
    .filter((event) => occursOn(event, selectedKey))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const todos = life.todos.filter((todo) => occursOn(todo, selectedKey));
  const doneToday = life.habitLog[dateKey(new Date())] ?? [];
  const habitsDone = life.habits.filter((habit) => doneToday.includes(habit.id)).length;

  const pick = (key) => {
    setSelectedKey(key);
    setShowCalendar(false);
  };
  const jumpToToday = () => {
    setSelectedKey(dateKey(new Date()));
    setShowCalendar(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Sky: the day you're looking at, and the month it sits in ─────── */}
      <SkyZone className="flex items-end justify-between gap-10">
        <div className="min-w-0">
          <p className="t-eyebrow">{relativeDayLabel(selectedKey)}</p>
          <h1 className="t-hero mt-3 truncate">
            {keyToDate(selectedKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
          <p className="t-lede mt-3">
            {plural(events.length, 'event')}, {plural(todos.length, 'to-do')}, {habitsDone} of{' '}
            {plural(life.habits.length, 'habit')} done
          </p>
          <div className="mt-6 flex items-center gap-2">
            <button type="button" onClick={() => setEditing('new')} aria-label="Add" className="pill pill-lit h-10 px-4">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
            <button type="button" onClick={jumpToToday} aria-label="Jump to today" className="pill h-10 px-4">
              Today
            </button>
            <button
              type="button"
              onClick={() => setShowCalendar((v) => !v)}
              aria-pressed={showCalendar}
              aria-label="Pick a day"
              className="pill h-10 px-4"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Month
            </button>
            <button
              type="button"
              onClick={() => setShowConnect(true)}
              aria-label="Connect calendars"
              className="pill h-10 w-10 px-0 text-moon/75"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => calendar?.refresh()}
              aria-label="Refresh calendars"
              className="pill h-10 w-10 px-0 text-moon/75"
            >
              <RefreshCw className={`h-4 w-4 ${calendar?.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

      </SkyZone>

      {/* ── Ground: the day's plan, what to do, habits, projects ─────────── */}
      <Ground className="grid grid-cols-[1.35fr_1fr_1fr]">
        <Column
          label="Schedule"
          action={calendar?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent/70" aria-hidden="true" /> : null}
          className="pr-8 pt-7"
          bodyClassName="flex min-h-0 flex-col"
        >
          {/* The month drops in above the day's plan rather than replacing it,
              so choosing a day and reading it happen in the same place. */}
          {showCalendar ? <MonthCalendar selectedKey={selectedKey} events={allEvents} onPick={pick} /> : null}

          <div className="glass-scroll cascade mt-3 min-h-0 flex-1 overflow-y-auto pb-3 pr-1 [mask-image:linear-gradient(180deg,#000_91%,transparent)]">
            {events.length === 0 ? (
              <EmptyLine>{calendar?.loading ? 'Syncing calendars…' : 'Nothing planned'}</EmptyLine>
            ) : (
              events.map((event) => <EventRow key={event.id} event={event} onClick={() => setViewing(event)} />)
            )}
          </div>
        </Column>

        <Column label="To-do" className="ground-rule px-8 pt-7" bodyClassName="glass-scroll overflow-y-auto pr-1">
          {todos.length === 0 ? (
            <EmptyLine>Nothing to do</EmptyLine>
          ) : (
            <div className="cascade mt-1 space-y-0.5">
              {todos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  onToggle={() => life.toggleTodo(todo.id)}
                  onRemove={() => life.removeTodo(todo.id)}
                />
              ))}
            </div>
          )}
          <HabitsBlock life={life} />
        </Column>

        <ProjectsColumn life={life} />
      </Ground>

      {viewing && (
        <EventDetailPopup
          event={viewing}
          onClose={() => setViewing(null)}
          onEdit={(viewing.source ? viewing.editable : true) ? () => openEdit(viewing) : null}
          onDelete={viewing.readOnly ? null : (scope) => removeEvent(viewing, scope)}
        />
      )}

      {editing && (
        <AddEditPopup
          life={life}
          calendar={calendar}
          selectedKey={selectedKey}
          event={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {editingConnected && (
        <ConnectedEventEditor
          calendar={calendar}
          selectedKey={selectedKey}
          event={editingConnected}
          onClose={() => setEditingConnected(null)}
        />
      )}

      {showConnect && <CalendarConnectPopup calendar={calendar} onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function CalendarConnectPopup({ calendar, onClose }) {
  const { settings, update } = useSettings();
  const feeds = settings.icalFeeds ?? [];
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [appleId, setAppleId] = useState('');
  const [applePw, setApplePw] = useState('');
  const [appleErr, setAppleErr] = useState('');
  const [appleBusy, setAppleBusy] = useState(false);

  const connectApple = async () => {
    setAppleErr('');
    setAppleBusy(true);
    try {
      await calendar.connectApple(appleId.trim(), applePw.trim());
      setAppleId('');
      setApplePw('');
    } catch (e) {
      setAppleErr(e?.message || 'Could not connect. Check your Apple ID and app-specific password.');
    } finally {
      setAppleBusy(false);
    }
  };

  const addFeed = () => {
    const raw = url.trim();
    if (!/^(https?|webcal):\/\//i.test(raw)) return;
    const normalized = raw.replace(/^webcal:\/\//i, 'https://');
    update({
      icalFeeds: [
        ...feeds,
        { id: Math.random().toString(36).slice(2, 9), name: name.trim() || 'Calendar', url: normalized },
      ],
    });
    setName('');
    setUrl('');
    setTimeout(() => calendar.refresh(), 100);
  };
  const removeFeed = (id) => update({ icalFeeds: feeds.filter((f) => f.id !== id) });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/95" />
      <div className="theme-card relative z-10 flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[0.75rem] font-semibold text-moon/42">Connect calendars</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-full text-moon/50 transition hover:bg-white/10 hover:text-moon"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <SectionLabel>Google Calendar</SectionLabel>
            {calendar.googleConnected ? (
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                  <Check className="h-4 w-4" aria-hidden="true" /> Connected — events sync in.
                </p>
                <button
                  type="button"
                  onClick={calendar.disconnectGoogle}
                  className="rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold text-moon/45 transition hover:bg-white/10 hover:text-rose-300"
                >
                  Disconnect
                </button>
              </div>
            ) : calendar.googleConfigured ? (
              <button
                type="button"
                onClick={calendar.connectGoogle}
                className="soft-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-moon/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Connect Google Calendar
              </button>
            ) : calendar.backendReachable === false ? (
              // Not reaching the backend says nothing about how it is set up —
              // claiming "add your client ID" here is what made a restart look
              // like a broken install.
              <p className="flex items-center gap-2 text-xs leading-relaxed text-amber-200/70">
                <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Can’t reach the Pulse backend — your Google connection is untouched. Retrying automatically.
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-moon/45">
                Add <code className="text-moon/70">GOOGLE_CLIENT_ID</code> and{' '}
                <code className="text-moon/70">GOOGLE_CLIENT_SECRET</code> to{' '}
                <code className="text-moon/70">backend/.env</code> to enable read + write Google sync.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <SectionLabel>Apple iCloud Calendar</SectionLabel>
            {calendar.appleConnected ? (
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-emerald-300">
                  <Check className="h-4 w-4" aria-hidden="true" /> Connected — iCloud events sync in.
                </p>
                <button
                  type="button"
                  onClick={calendar.disconnectApple}
                  className="rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold text-moon/45 transition hover:bg-white/10 hover:text-rose-300"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <input
                  value={appleId}
                  onChange={(e) => setAppleId(e.target.value)}
                  placeholder="Apple ID (name@icloud.com)"
                  autoComplete="off"
                  className={inputClass}
                />
                <div className="flex items-center gap-1.5">
                  <input
                    value={applePw}
                    onChange={(e) => setApplePw(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        connectApple();
                      }
                    }}
                    type="password"
                    placeholder="App-specific password"
                    autoComplete="off"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={connectApple}
                    disabled={appleBusy || !appleId || !applePw}
                    className="shrink-0 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/25 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    {appleBusy ? '…' : 'Connect'}
                  </button>
                </div>
                {appleErr && <p className="text-[0.8125rem] leading-relaxed text-rose-300/90">{appleErr}</p>}
                <p className="text-[0.75rem] leading-relaxed text-moon/38">
                  Uses your Apple ID + an app-specific password (create one at{' '}
                  <span className="text-moon/60">appleid.apple.com → Sign-In and Security → App-Specific Passwords</span>).
                  iCloud requires this — your normal password won&rsquo;t work.
                </p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <SectionLabel>Subscribed feeds (.ics)</SectionLabel>
            <div className="space-y-1.5">
              {feeds.length === 0 ? (
                <EmptyLine>No feeds yet</EmptyLine>
              ) : (
                feeds.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_META.ical.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-moon/85">{f.name}</p>
                      <p className="truncate text-[0.75rem] text-moon/35">{f.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFeed(f.id)}
                      aria-label={`Remove ${f.name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-moon/40 transition hover:bg-white/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Uni timetable)" className={inputClass} />
            <div className="flex items-center gap-1.5">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFeed();
                  }
                }}
                placeholder="https://…/basic.ics"
                className={inputClass}
              />
              <button
                type="button"
                onClick={addFeed}
                aria-label="Add feed"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/25 transition hover:bg-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-[0.75rem] leading-relaxed text-moon/38">
              Paste a public .ics URL — e.g. Google Calendar&rsquo;s &ldquo;Secret address in iCal format&rdquo;, an
              Apple/Outlook share link, or a university timetable feed.
            </p>
          </div>

          {calendar.calendars.length > 0 && (
            <div className="space-y-1.5">
              <SectionLabel>Show calendars</SectionLabel>
              <div className="space-y-1">
                {calendar.calendars.map((c) => {
                  const off = calendar.hiddenCalendars.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => calendar.toggleCalendar(c.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color || '#888', opacity: off ? 0.3 : 1 }}
                      />
                      <span className={`min-w-0 flex-1 truncate text-sm ${off ? 'text-moon/35' : 'text-moon/80'}`}>
                        {c.name}
                      </span>
                      {c.source === 'google' || c.source === 'apple' ? (
                        <SourceLogo source={c.source} className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-[0.75rem] text-moon/30">{c.source}</span>
                      )}
                      {off ? (
                        <EyeOff className="h-4 w-4 shrink-0 text-moon/30" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4 shrink-0 text-moon/55" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

// Parse the free-text time field ("14:00", "14:00 – 15:00", "") into ISO
// start/end for writing to a real calendar. Empty time → all-day.
function timeToISO(dayKey, timeStr) {
  const times = (timeStr || '').match(/\d{1,2}:\d{2}/g);
  if (!times) return { start: `${dayKey}T00:00:00`, end: `${dayKey}T00:00:00`, allDay: true };
  const mk = (hm) => new Date(`${dayKey}T${hm.padStart(5, '0')}:00`);
  const start = mk(times[0]);
  const end = times[1] ? mk(times[1]) : new Date(start.getTime() + 3_600_000);
  return { start: start.toISOString(), end: end.toISOString(), allDay: false };
}

function EventMap({ lat, lon, label }) {
  const d = 0.006;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-white/10">
      <iframe title={`Map — ${label}`} src={src} className="h-40 w-full border-0" loading="lazy" />
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1 bg-white/[0.04] py-1.5 text-[0.75rem] font-medium text-moon/55 transition hover:text-moon/85"
      >
        Open in maps <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}

function EventDetailPopup({ event, onClose, onEdit, onDelete }) {
  const [geo, setGeo] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const location = event.location || event.place || '';

  useEffect(() => {
    let alive = true;
    setGeo(null);
    if (!location) return undefined;
    api
      .geo(location)
      .then((g) => alive && setGeo(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [location]);

  const sourceLabel = SOURCE_META[event.calendar]?.label;
  const dateLabel = keyToDate(event.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/95" />
      <div className="theme-card relative z-10 flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start gap-3 p-4 pb-3">
          <span className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
          <div className="min-w-0 flex-1">
            <p className="display-type text-lg font-normal leading-tight text-moon">{event.title}</p>
            {event.calendarName && <p className="mt-0.5 truncate text-[0.8125rem] text-moon/45">{event.calendarName}</p>}
          </div>
          <IconButton onClick={onClose} label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="glass-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <div className="space-y-1.5 text-sm text-moon/75">
            <p className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-moon/40" aria-hidden="true" />
              {dateLabel}
            </p>
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-moon/40" aria-hidden="true" />
              {event.time || 'All day'}
            </p>
            {location && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-moon/40" aria-hidden="true" />
                <span className="min-w-0">{location}</span>
              </p>
            )}
          </div>

          {event.description && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-moon/55">{stripHtml(event.description)}</p>
          )}

          {geo && <EventMap lat={geo.lat} lon={geo.lon} label={location} />}

          <div className="flex items-center gap-2 pt-1">
            <SourceLogo source={event.source} className="h-4 w-4" />
            {sourceLabel && (
              <span className="text-[0.75rem] font-medium text-moon/45">{sourceLabel}</span>
            )}
            {event.readOnly && <span className="text-[0.75rem] text-moon/35">Read-only</span>}
            {confirmDelete ? (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[0.75rem] text-moon/40">Delete</span>
                <button
                  type="button"
                  onClick={() => onDelete('this')}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10"
                >
                  This event
                </button>
                <button
                  type="button"
                  onClick={() => onDelete('all')}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10"
                >
                  All events
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1 text-xs text-moon/45">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="ml-auto flex items-center gap-2">
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => (event.recurring ? setConfirmDelete(true) : onDelete())}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                  </button>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="soft-button inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-moon/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Create / edit an event on a connected (Google/Apple) calendar.
function ConnectedEventEditor({ calendar, selectedKey, event, onClose }) {
  const isNew = !event;
  const writable = calendar.writableCalendars ?? [];
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? selectedKey);
  const [time, setTime] = useState(event?.time ?? '');
  const [location, setLocation] = useState(event?.location ?? event?.place ?? '');
  const [calId, setCalId] = useState(event?.calendarId ?? writable[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const target = writable.find((c) => c.id === calId) ?? writable[0];

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !target) return;
    setBusy(true);
    setErr('');
    const { start, end, allDay } = timeToISO(date, time);
    try {
      if (isNew) {
        await calendar.createEvent({
          source: target.source,
          calendarId: target.id,
          title: title.trim(),
          location: location.trim(),
          start,
          end,
          allDay,
        });
      } else {
        await calendar.updateEvent({
          source: event.source,
          calendarId: event.calendarId,
          eventId: event.eventId,
          providerUrl: event.providerUrl,
          etag: event.etag,
          uid: event.uid,
          title: title.trim(),
          location: location.trim(),
          start,
          end,
          allDay,
        });
      }
      onClose();
    } catch (e2) {
      setErr(e2?.message || 'Could not save the event.');
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-900/95" />
      <div className="theme-card relative z-10 flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[0.75rem] font-semibold text-moon/42">
            {isNew ? 'New event' : 'Edit event'}
          </p>
          <IconButton onClick={onClose} label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
        <form onSubmit={submit} className="glass-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputClass} />
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} flex-1`} />
            <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="14:00 – 15:00" className={`${inputClass} flex-1`} />
          </div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className={inputClass} />
          <div>
            <p className="mb-1.5 text-[0.75rem] font-semibold text-moon/42">Calendar</p>
            <div className="flex flex-wrap gap-1.5">
              {writable.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCalId(c.id)}
                  className={[
                    'flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-xs transition',
                    calId === c.id ? 'bg-white/12 text-moon ring-1 ring-white/25' : 'text-moon/55 hover:bg-white/6',
                  ].join(' ')}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color || '#888' }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-[0.8125rem] leading-relaxed text-rose-300/90">{err}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={onClose} className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-moon/55 transition hover:text-moon">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !title.trim() || !target}
              className="soft-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-moon/90 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EventRow({ event, onClick }) {
  const recurring = event.repeat !== 'none' || event.recurring;
  const [start, end] = (event.time || '').split(/\s*[–-]\s*/);
  return (
    <button
      type="button"
      onClick={onClick}
      className="ground-row group grid w-full grid-cols-[4.25rem_3px_minmax(0,1fr)_auto] items-stretch gap-4 px-2 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span className="pt-1 text-right leading-tight">
        <span className="clock-figures block text-[1rem] font-medium text-moon">{start || 'All day'}</span>
        {end ? <span className="clock-figures mt-0.5 block text-[0.8125rem] text-dim">{end}</span> : null}
      </span>
      <span className="rounded-full" style={{ backgroundColor: event.color || calendarColor(event.calendar) }} />
      <span className="min-w-0">
        <span className="display-type block truncate text-[1.375rem] leading-tight text-moon">{event.title}</span>
        <span className="mt-1 flex items-center gap-2 text-[0.8125rem] text-dim">
          {event.place ? <span className="truncate">{event.place}</span> : null}
          {recurring ? <Repeat className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
        </span>
      </span>
      <span className="self-center">
        {event.source === 'google' || event.source === 'apple' ? (
          <SourceLogo source={event.source} className="h-4 w-4" />
        ) : event.source === 'ical' ? (
          <span className="pill h-6 px-2 text-[0.8125rem] text-moon/60">iCal</span>
        ) : (
          <Pencil className="h-3.5 w-3.5 text-moon/25 transition group-hover:text-moon/60" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function MonthCalendar({ selectedKey, events, onPick }) {
  const [cursor, setCursor] = useState(() => {
    const d = keyToDate(selectedKey);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayKey = dateKey(new Date());

  useEffect(() => {
    const d = keyToDate(selectedKey);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [selectedKey]);

  // Whatever month is on screen has to be loaded. The dashboard keeps several
  // months to hand, but paging past them used to show empty days rather than
  // fetching them.
  useEffect(() => {
    ensureCalendarRange(new Date(year, month, 1), new Date(year, month + 1, 1));
  }, [year, month]);
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Always six rows. A month that only needs five would otherwise be shorter,
  // and since the hero sits on the horizon the whole calendar would jump every
  // time you paged into a longer month.
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length < 42) cells.push(null);

  return (
    <div className="mt-1 shrink-0 border-b border-white/[0.07] pb-5">
      <div className="grid w-full grid-cols-[2.25rem_1fr_2.25rem] items-center">
        <IconButton onClick={() => setCursor(new Date(year, month - 1, 1))} label="Previous month">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <span className="display-type text-center text-[1.375rem] text-moon">
          {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </span>
        <IconButton onClick={() => setCursor(new Date(year, month + 1, 1))} label="Next month">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="mt-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[0.75rem] font-medium text-moon/40">
          {WEEKDAYS.map((day, i) => (
            <span key={i}>{day}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-x-1 gap-y-0.5">
          {cells.map((day, i) => {
            if (day === null) return <span key={`b${i}`} className="h-8" />;
            const key = dateKey(new Date(year, month, day));
            const isSelected = key === selectedKey;
            const isToday = key === todayKey;
            const dayEvents = events.filter((event) => occursOn(event, key));
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPick(key)}
                className={[
                  'flex h-8 flex-col items-center justify-center gap-0.5 rounded-full text-[0.875rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  isSelected
                    ? 'bg-moon'
                    : isToday
                      ? 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_50%,transparent)] hover:bg-white/8'
                      : 'hover:bg-white/8',
                ].join(' ')}
              >
                <span
                  className={[
                    'clock-figures leading-none',
                    isSelected ? 'font-semibold text-ink' : isToday ? 'text-accent' : 'text-moon/75',
                  ].join(' ')}
                >
                  {day}
                </span>
                <span className="flex h-1 items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: event.color || calendarColor(event.calendar) }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AddEditPopup({ life, calendar, selectedKey, event, onClose }) {
  const isNew = !event;
  const [type, setType] = useState('event');
  const mode = isNew ? type : 'event';
  const connectedCalendars = calendar?.writableCalendars ?? [];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-3">
      {/* Opaque cover — hides the card content behind the popup */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/95"
      />
      <div className="theme-card relative z-10 flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[0.75rem] font-semibold text-moon/42">
            {isNew ? (type === 'task' ? 'New task' : 'New event') : 'Edit event'}
          </p>
          <IconButton onClick={onClose} label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        {isNew && (
          <div className="mb-3 flex gap-1 rounded-full bg-white/6 p-1">
            {['event', 'task'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={[
                  'flex-1 rounded-full py-1 text-xs font-semibold capitalize transition',
                  type === option ? 'glow-ring bg-white/15 text-moon' : 'text-moon/50 hover:text-moon/80',
                ].join(' ')}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {mode === 'task' ? (
          <TaskForm
            onSave={({ label, repeat }) => {
              life.addTodo({ label, date: selectedKey, repeat });
              onClose();
            }}
            onCancel={onClose}
          />
        ) : (
          <EventForm
            event={event}
            connectedCalendars={connectedCalendars}
            onSave={async (data) => {
              const connected = connectedCalendars.find((c) => c.id === data.calendar);
              if (isNew && connected) {
                const { start, end, allDay } = timeToISO(selectedKey, data.time);
                await calendar.createEvent({
                  source: connected.source,
                  calendarId: connected.id,
                  title: data.title,
                  location: data.place,
                  start,
                  end,
                  allDay,
                });
              } else if (isNew) {
                life.addEvent({ ...data, date: selectedKey });
              } else {
                life.updateEvent(event.id, data);
              }
              onClose();
            }}
            onDelete={
              !isNew
                ? () => {
                    life.removeEvent(event.id);
                    onClose();
                  }
                : null
            }
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}

function TaskForm({ onSave, onCancel }) {
  const [label, setLabel] = useState('');
  const [repeat, setRepeat] = useState('none');

  const submit = (e) => {
    e.preventDefault();
    const value = label.trim();
    if (!value) return;
    onSave({ label: value, repeat });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Task"
        className={inputClass}
      />
      <label className="flex items-center gap-2 text-[0.8125rem] text-moon/45">
        <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={`${selectClass} flex-1`}>
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-800">
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-moon/55 transition hover:text-moon"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="soft-button rounded-lg px-4 py-2 text-xs font-semibold text-moon/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Add
        </button>
      </div>
    </form>
  );
}

function EventForm({ event, connectedCalendars = [], onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [place, setPlace] = useState(event?.place ?? '');
  const [calendar, setCalendar] = useState(event?.calendar ?? 'personal');
  const [repeat, setRepeat] = useState(event?.repeat ?? 'none');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setBusy(true);
    try {
      await onSave({ title: value, time: time.trim(), place: place.trim(), calendar, repeat });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className={inputClass}
      />
      <input
        value={time}
        onChange={(e) => setTime(e.target.value)}
        placeholder="Time · e.g. 14:00 – 15:00"
        className={inputClass}
      />
      <input
        value={place}
        onChange={(e) => setPlace(e.target.value)}
        placeholder="Location"
        className={inputClass}
      />

      <div>
        <p className="mb-1.5 text-[0.75rem] font-semibold text-moon/42">Calendar</p>
        <div className="flex flex-wrap gap-1.5">
          {[...CALENDARS, ...connectedCalendars].map((cal) => (
            <button
              key={cal.id}
              type="button"
              onClick={() => setCalendar(cal.id)}
              className={[
                'flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-xs transition',
                calendar === cal.id
                  ? 'bg-white/12 text-moon ring-1 ring-white/25'
                  : 'text-moon/55 hover:bg-white/6',
              ].join(' ')}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cal.color || '#888' }} />
              {cal.name}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[0.8125rem] text-moon/45">
        <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={`${selectClass} flex-1`}>
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-800">
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2 pt-1">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-moon/55 transition hover:text-moon"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="soft-button inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-moon/90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Projects — deliberately styled apart from the day card             */
/* ------------------------------------------------------------------ */

function ProjectsColumn({ life }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    life.addProject(value);
    setName('');
    setAdding(false);
  };

  return (
    <Column
      label="Projects"
      action={
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-pressed={adding}
          aria-label="Add project"
          className="pill h-7 w-7 px-0 text-moon/75"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      }
      className="ground-rule pl-8 pt-7"
      bodyClassName="glass-scroll overflow-y-auto pr-1"
    >
      {adding && (
        <form onSubmit={submit} className="mt-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className={inputClass} />
        </form>
      )}
      <div className="cascade mt-2 space-y-7">
        {life.projects.map((project, i) => (
          <ProjectItem key={project.id} project={project} accent={projectAccents[i % projectAccents.length]} life={life} />
        ))}
      </div>
      {life.projects.length === 0 && <EmptyLine>No projects yet</EmptyLine>}
    </Column>
  );
}

function ProjectItem({ project, accent, life }) {
  const done = project.todos.filter((todo) => todo.done).length;
  const pct = project.todos.length ? (done / project.todos.length) * 100 : 0;

  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-title truncate text-[1.375rem]">{project.name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="clock-figures text-[0.8125rem] text-dim">
            {done} of {project.todos.length}
          </span>
          <RemoveButton onClick={() => life.removeProject(project.id)} />
        </div>
      </div>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
        <div className="bar-grow h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: accent }} />
      </div>
      <div className="mt-2 space-y-0.5">
        {project.todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} compact onToggle={() => life.toggleProjectTodo(project.id, todo.id)} />
        ))}
      </div>
      <InlineAdd placeholder="Add task" onAdd={(label) => life.addProjectTodo(project.id, label)} />
    </div>
  );
}

/**
 * Today's habits as pills: tap one and it lights, which is the whole point of a
 * habit tracker — the satisfaction of switching it on.
 */
function HabitsBlock({ life }) {
  const todayKey = dateKey(new Date());
  const doneToday = life.habitLog[todayKey] ?? [];
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const doneCount = life.habits.filter((habit) => doneToday.includes(habit.id)).length;

  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    life.addHabit(value);
    setText('');
    setAdding(false);
  };

  return (
    <div className="mt-9">
      <ColumnHead
        label="Habits today"
        action={
          <div className="flex items-center gap-2">
          <span className="clock-figures text-[0.8125rem] text-dim">
            {doneCount} of {life.habits.length}
          </span>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-pressed={adding}
            aria-label="Add habit"
            className="pill h-7 w-7 px-0 text-moon/75"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          </div>
        }
      />

      {adding && (
        <form onSubmit={submit} className="mt-2">
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="New habit" className={inputClass} />
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {life.habits.map((habit) => {
          const done = doneToday.includes(habit.id);
          return (
            <span key={habit.id} className="group relative inline-flex">
              <button
                type="button"
                onClick={() => life.toggleHabit(habit.id, todayKey)}
                aria-pressed={done}
                className="pill h-10 px-4 text-[0.875rem]"
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {habit.label}
              </button>
              <span className="absolute -right-1 -top-1">
                <RemoveButton onClick={() => life.removeHabit(habit.id)} />
              </span>
            </span>
          );
        })}
      </div>
      {life.habits.length === 0 && <EmptyLine>Add your first habit</EmptyLine>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function InlineAdd({ placeholder, onAdd }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText('');
  };
  return (
    <form onSubmit={submit} className="mt-1.5 flex items-center gap-2.5 px-1.5">
      <Plus className="h-4 w-4 shrink-0 text-moon/30" aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-1 text-[0.875rem] text-moon placeholder:text-moon/35 focus:outline-none"
      />
    </form>
  );
}

function TodoRow({ todo, onToggle, onRemove, compact }) {
  return (
    <div className="ground-row group flex items-center gap-3 px-1.5 py-1.5">
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none">
        <CheckMark done={todo.done} />
        <span
          className={[
            compact ? 'text-[0.875rem]' : 'text-[0.9375rem]',
            'truncate transition-colors',
            todo.done ? 'text-moon/35 line-through' : 'text-moon/85',
          ].join(' ')}
        >
          {todo.label}
        </span>
        {todo.repeat && todo.repeat !== 'none' && <Repeat className="h-3 w-3 shrink-0 text-moon/30" aria-hidden="true" />}
      </button>
      {onRemove && <RemoveButton onClick={onRemove} />}
    </div>
  );
}

/** Round, and it fills with the moon when done. */
function CheckMark({ done }) {
  return (
    <span
      className={[
        'grid h-5 w-5 shrink-0 place-items-center rounded-full transition-all duration-300',
        done ? 'bg-moon text-ink' : 'shadow-[inset_0_0_0_1.5px_rgba(226,230,248,0.35)]',
      ].join(' ')}
    >
      {done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
    </span>
  );
}

function RemoveButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Delete"
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/80 text-moon/45 opacity-0 transition hover:text-moon focus:opacity-100 focus:outline-none group-hover:opacity-100"
    >
      <X className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function IconButton({ onClick, active, label, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={Boolean(active)} className="pill h-8 w-8 px-0 text-moon/75">
      {children}
    </button>
  );
}

function SectionLabel({ children }) {
  return <p className="t-label">{children}</p>;
}

function EmptyLine({ children }) {
  return <p className="px-1.5 py-2 text-[0.9375rem] text-dim">{children}</p>;
}
