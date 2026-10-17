import {
  Check,
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
import { createPortal } from 'react-dom';
import { ColumnHead, Ground, SkyZone } from '../components/Stage.jsx';
import MonthGrid from './schedule/MonthGrid.jsx';
import { dayShape } from '../services/schedule/day.js';
import { TODO_REPEAT, repeatBlurb, repeatNote, todoDoneOn, todoOccursOn } from '../services/schedule/todos.js';
import { SOURCE_META, useCalendarEvents } from '../hooks/useCalendarEvents.js';
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
import { useMinute } from '../hooks/useMinute.js';
import { useSettings } from '../hooks/useSettings.js';

const inputClass =
  'w-full rounded-lg bg-white/8 px-3 py-2 text-sm text-moon placeholder:text-moon/35 ring-1 ring-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45';


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
 * The sky holds the day you are reading and what it amounts to. The ground is
 * the month, at the size of a month, with the day you picked out of it read
 * down the side: its events with their gaps drawn between them, and the to-dos
 * that belong to it.
 */
export default function LifeHub() {
  const life = useLifeData();
  const calendar = useCalendarEvents();
  /*
   * The minute, which is what keeps this view honest. Today, what is on now,
   * and where the clock falls in the day are all worked out during render —
   * without a tick they would all still be on the minute the tab was opened,
   * and on yesterday for a Pulse left running overnight.
   */
  useMinute();

  const [selectedKey, setSelectedKey] = useState(() => dateKey(new Date()));
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
  const todos = life.todos.filter((todo) => todoOccursOn(todo, selectedKey));
  const todosLeft = todos.filter((todo) => !todoDoneOn(todo, selectedKey)).length;

  /*
   * The day's shape — its gaps and where the clock is in it — which only means
   * anything on today. On any other date `now` is null and the agenda is a
   * plain reading of it, because a line saying "you are here" through next
   * Tuesday is a line saying nothing.
   */
  const clock = new Date();
  const shape = dayShape(events, {
    now: selectedKey === dateKey(clock) ? clock.getHours() * 60 + clock.getMinutes() : null,
  });

  const pick = (key) => {
    setSelectedKey(key);
  };
  const jumpToToday = () => {
    setSelectedKey(dateKey(new Date()));
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Sky: the day you're looking at, and the month it sits in ─────── */}
      <SkyZone className="flex items-end">
        <div className="min-w-0 flex-1">
          <p className="t-eyebrow">{relativeDayLabel(selectedKey)}</p>
          <h1 className="t-hero mt-3 truncate">
            {keyToDate(selectedKey).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
          {/* What the day amounts to, and then the one thing about it worth
              knowing before you read it: what you are in, or what is coming. */}
          <p className="t-lede mt-3">
            {events.length || todos.length ? (
              <>
                {plural(events.length, 'event')} · {plural(todos.length, 'to-do')}
                {shape.onNow ? (
                  <>
                    {' · '}
                    <span className="text-moon">On now: {shape.onNow.title}</span>
                  </>
                ) : shape.next ? (
                  <>
                    {' · '}
                    <span className="text-moon">
                      {shape.next.title} at {(shape.next.time || '').split(/\s*[–—-]\s*/)[0]}
                    </span>
                  </>
                ) : null}
              </>
            ) : (
              'Nothing planned'
            )}
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

      {/* ── Ground: the month, and the day you have picked out of it ────── */}
      <Ground className="grid grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* The calendar, at the size that makes it the point of this screen
            rather than one of three equal columns. */}
        <div className="flex min-h-0 flex-col pr-8 pt-6">
          <MonthGrid
            selectedKey={selectedKey}
            events={allEvents}
            onPick={pick}
            onOpenEvent={(event) => setViewing(event)}
          />
        </div>

        {/* The chosen day, and the things that belong to it rather than to a
            date — stacked, because they are one reading rather than three. */}
        <div className="ground-rule glass-scroll flex min-h-0 flex-col gap-7 overflow-y-auto pl-8 pr-1 pt-6">
          <section>
            <ColumnHead
              label={relativeDayLabel(selectedKey)}
              action={
                calendar?.loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent/70" aria-hidden="true" />
                ) : null
              }
            />
            <div className="cascade mt-1">
              {events.length === 0 ? (
                <EmptyLine>{calendar?.loading ? 'Syncing calendars…' : 'Nothing planned'}</EmptyLine>
              ) : (
                shape.rows.map((row) => (
                  <EventRow
                    key={row.event.id}
                    event={row.event}
                    state={row.state}
                    onClick={() => setViewing(row.event)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="pb-5">
            <ColumnHead
              label="To-do"
              action={todosLeft ? <span className="t-meta">{todosLeft} left</span> : null}
            />
            {todos.length === 0 ? (
              <EmptyLine>Nothing to do</EmptyLine>
            ) : (
              <div className="cascade mt-1 space-y-0.5">
                {todos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    done={todoDoneOn(todo, selectedKey)}
                    onToggle={() => life.toggleTodo(todo.id, selectedKey)}
                    onRemove={() => life.removeTodo(todo.id)}
                  />
                ))}
              </div>
            )}
            {/* Adding one takes a line, not a dialogue — including how often
                it should come back, which is the whole of what the popup was
                needed for. */}
            <InlineAdd
              label="Add a to-do"
              onAdd={(text, repeat) => life.addTodo({ label: text, date: selectedKey, repeat })}
            />
          </section>
        </div>
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
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[#070b18]/72 backdrop-blur-md"
      />
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
      <iframe title={`Map — ${label}`} src={src} className="h-56 w-full border-0" loading="lazy" />
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

/**
 * How far off it is, in the words a person would use.
 *
 * The panel already says the date and the time; what it could not say was
 * whether that meant now, later or last Tuesday — which is the first thing
 * anyone wants from an event they have just tapped.
 */
function whenFromNow(event) {
  const day = keyToDate(event.date);
  if (!day || Number.isNaN(day.getTime())) return null;
  const [h, m] = (event.time || '').split(':').map(Number);
  const at = new Date(day);
  if (Number.isFinite(h)) at.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);

  const mins = Math.round((at - Date.now()) / 60_000);
  // An all-day event has no clock to count down to, so it counts in days.
  if (!Number.isFinite(h)) {
    const days = Math.round((at.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
  }
  if (mins >= -180 && mins <= 0) return 'Happening now';
  if (mins < 0) {
    const ago = Math.abs(mins);
    if (ago < 60) return `${ago} min ago`;
    if (ago < 1440) return `${Math.round(ago / 60)}h ago`;
    return `${Math.round(ago / 1440)} days ago`;
  }
  if (mins < 60) return `In ${mins} min`;
  if (mins < 1440) return `In ${Math.round(mins / 60)}h`;
  return `In ${Math.round(mins / 1440)} days`;
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
  const relative = whenFromNow(event);

  // The scrim used to be `absolute inset-0` inside the view, so it covered the
  // view's box and nothing else: a grey slab with the page showing around its
  // edges. A portal and `fixed` put it over the window, where an overlay
  // belongs, and it dims rather than paints over.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md" aria-hidden="true" />

      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl">
        {/* The calendar's own colour, as light thrown up the head of the panel
            rather than as a 1px bar beside the title. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.55]"
          style={{ background: `linear-gradient(to bottom, ${event.color}, transparent 78%)` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ backgroundColor: event.color }}
          aria-hidden="true"
        />

        <div className="relative flex items-start gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <p className="t-label" style={{ color: event.color }}>
              {event.calendarName || sourceLabel || 'Event'}
            </p>
            <p className="display-type mt-1 text-[1.75rem] font-light leading-tight text-moon">{event.title}</p>
          </div>
          <IconButton onClick={onClose} label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="glass-scroll relative min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
          {/* When it is, at the size the one thing you opened this for deserves */}
          <div className="flex items-end gap-5 border-y border-white/10 py-3.5">
            <div>
              <p className="t-label text-moon/40">When</p>
              <p className="clock-figures mt-1 text-2xl font-light leading-none text-moon">
                {event.time || 'All day'}
              </p>
              <p className="mt-1.5 text-[0.8125rem] text-moon/50">{dateLabel}</p>
            </div>
            {relative ? (
              <p className="ml-auto shrink-0 rounded-full bg-white/8 px-3 py-1 text-[0.8125rem] font-semibold text-moon/80 ring-1 ring-white/12">
                {relative}
              </p>
            ) : null}
          </div>

          {location && (
            <div>
              <p className="t-label text-moon/40">Where</p>
              <p className="mt-1 flex items-start gap-2 text-sm text-moon/85">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-moon/40" aria-hidden="true" />
                <span className="min-w-0">{location}</span>
              </p>
            </div>
          )}

          {event.description && (
            <div>
              <p className="t-label text-moon/40">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-moon/60">
                {stripHtml(event.description)}
              </p>
            </div>
          )}

          {geo && <EventMap lat={geo.lat} lon={geo.lon} label={location} />}

          <div className="flex items-center gap-2 border-t border-white/10 pt-3">
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
    </div>,
    document.body,
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
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[#070b18]/72 backdrop-blur-md"
      />
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

/**
 * One event in the day.
 *
 * `state` is where the clock stands against it — 'now' for the one you are in,
 * 'next' for the one coming, 'past' for the ones gone, 'plain' on any day that
 * is not today. What is over steps back rather than disappearing, because a
 * day you can no longer see the morning of reads as a day with no morning.
 */
function EventRow({ event, state = 'plain', onClick }) {
  const recurring = event.repeat !== 'none' || event.recurring;
  const [start, end] = (event.time || '').split(/\s*[–-]\s*/);
  const tint = event.color || calendarColor(event.calendar);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ground-row day-row day-row--${state} group grid w-full grid-cols-[4.25rem_3px_minmax(0,1fr)_auto] items-stretch gap-4 px-2 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`}
      style={{ '--tint': tint }}
    >
      <span className="pt-1 text-right leading-tight">
        <span className="clock-figures block text-[1rem] font-medium text-moon">{start || 'All day'}</span>
        {end ? <span className="clock-figures mt-0.5 block text-[0.8125rem] text-dim">{end}</span> : null}
      </span>
      <span className="day-row-spine rounded-full" style={{ backgroundColor: tint }} />
      <span className="min-w-0">
        <span className="display-type block truncate text-[1.375rem] leading-tight text-moon">{event.title}</span>
        <span className="mt-1 flex items-center gap-2 text-[0.8125rem] text-dim">
          {state === 'now' ? <span className="day-badge">On now</span> : null}
          {state === 'next' ? <span className="day-badge day-badge--quiet">Next</span> : null}
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

/**
 * Add one, on one line.
 *
 * It opens as a word and becomes a field when you reach for it, so the column
 * does not carry an empty input down the screen for the ninety per cent of the
 * time nobody is typing into it. How often it should come back is part of the
 * same line, because a to-do you have to open a dialogue to repeat is a to-do
 * nobody repeats.
 */
function InlineAdd({ label, onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [repeat, setRepeat] = useState('none');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="day-add">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (value) onAdd(value, repeat);
        setText('');
        // Left open, and on the same frequency: adding one thing is usually
        // adding three, and three of the same kind.
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        onBlur={(event) => {
          // Not when the blur is somebody reaching for the frequency beside it.
          if (!text.trim() && !event.currentTarget.form?.contains(event.relatedTarget)) setOpen(false);
        }}
        placeholder={label}
        aria-label={label}
        className={inputClass}
      />
      <div className="day-repeat">
        {TODO_REPEAT.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRepeat(option.value)}
            aria-pressed={repeat === option.value}
            className={`day-repeat-chip ${repeat === option.value ? 'is-on' : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {repeat !== 'none' ? <p className="day-repeat-note">{repeatBlurb(repeat)}</p> : null}
    </form>
  );
}


function AddEditPopup({ life, calendar, selectedKey, event, onClose }) {
  const isNew = !event;
  const [type, setType] = useState('event');
  const mode = isNew ? type : 'event';
  const connectedCalendars = calendar?.writableCalendars ?? [];

  // The colour of whichever calendar the event is going on, so the panel is lit
  // by its subject from the first keystroke rather than after it is saved.
  const [tint, setTint] = useState(
    () => [...CALENDARS, ...connectedCalendars].find((c) => c.id === (event?.calendar ?? 'personal'))?.color ?? '#8ea2ff',
  );

  // Same treatment as the detail panel: over the window rather than over the
  // card, dimming what is behind instead of painting a grey rectangle on it.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md" aria-hidden="true" />

      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.55] transition-[background] duration-500"
          style={{ background: `linear-gradient(to bottom, ${tint}, transparent 78%)` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px transition-colors duration-500"
          style={{ backgroundColor: tint }}
          aria-hidden="true"
        />

        <div className="relative flex items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div>
            <p className="t-label" style={{ color: tint }}>
              {isNew ? 'New' : 'Editing'}
            </p>
            <p className="display-type mt-1 text-2xl font-light leading-tight text-moon">
              {relativeDayLabel(selectedKey)}
            </p>
          </div>
          <IconButton onClick={onClose} label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        {isNew && (
          <div className="relative mx-6 mb-3 flex gap-1 rounded-full bg-white/6 p-1">
            {['event', 'task'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={[
                  'flex-1 rounded-full py-1.5 text-xs font-semibold capitalize transition',
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
            onTint={setTint}
          />
        )}
      </div>
    </div>,
    document.body,
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
    <form onSubmit={submit} className="relative flex min-h-0 flex-1 flex-col">
      <div className="glass-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What needs doing?"
          aria-label="Task"
          className="display-type w-full border-b border-white/12 bg-transparent pb-2 text-[1.75rem] font-light leading-tight text-moon outline-none transition placeholder:text-moon/25 focus:border-white/35 focus-visible:outline-none"
        />
        <section>
          <p className="t-label text-moon/45">Comes back</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TODO_REPEAT.map((option) => (
              <Chip key={option.value} on={repeat === option.value} onClick={() => setRepeat(option.value)}>
                {option.value === 'none' ? null : <Repeat className="h-3 w-3" aria-hidden="true" />}
                {option.label}
              </Chip>
            ))}
          </div>
          <p className="t-meta mt-2">{repeatBlurb(repeat)}</p>
        </section>
      </div>
      <div className="relative flex shrink-0 items-center gap-2 border-t border-white/10 px-6 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-moon/55 transition hover:text-moon"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!label.trim()}
          className="soft-button rounded-lg px-4 py-1.5 text-xs font-semibold text-moon/90 transition disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Add
        </button>
      </div>
    </form>
  );
}

function EventForm({ event, connectedCalendars = [], onSave, onDelete, onCancel, onTint }) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [time, setTime] = useState(event?.time ?? '');
  const [place, setPlace] = useState(event?.place ?? '');
  const [calendar, setCalendar] = useState(event?.calendar ?? 'personal');
  const [repeat, setRepeat] = useState(event?.repeat ?? 'none');
  const [busy, setBusy] = useState(false);
  const calendars = [...CALENDARS, ...connectedCalendars];

  // The panel around this takes its colour from the calendar being chosen.
  useEffect(() => {
    onTint?.(calendars.find((c) => c.id === calendar)?.color ?? '#8ea2ff');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `calendars` is rebuilt each render
  }, [calendar]);

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
    <form onSubmit={submit} className="relative flex min-h-0 flex-1 flex-col">
      <div className="glass-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
        {/* The title is the event. It gets written, not filled in — so it is set
            at the size it will be read at, on a rule rather than in a box. */}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it?"
          aria-label="Title"
          className="display-type w-full border-b border-white/12 bg-transparent pb-2 text-[1.75rem] font-light leading-tight text-moon outline-none transition placeholder:text-moon/25 focus:border-white/35 focus-visible:outline-none"
        />

        <section>
          <p className="t-label text-moon/45">When</p>
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="All day"
            aria-label="Time"
            className="clock-figures mt-1 w-full bg-transparent text-2xl font-light text-moon outline-none placeholder:text-moon/25"
          />
          {/* The times a day actually gets divided at, so the common case is a
              tap rather than eight keystrokes. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['09:00 – 10:00', '12:00 – 13:00', '14:00 – 15:00', '18:00 – 19:00'].map((slot) => (
              <Chip key={slot} on={time === slot} onClick={() => setTime(time === slot ? '' : slot)}>
                {slot}
              </Chip>
            ))}
            <Chip on={!time} onClick={() => setTime('')}>
              All day
            </Chip>
          </div>
        </section>

        <section>
          <p className="t-label text-moon/45">Where</p>
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Add a place"
            aria-label="Location"
            className="mt-1 w-full bg-transparent text-sm text-moon outline-none placeholder:text-moon/25"
          />
        </section>

        <section>
          <p className="t-label text-moon/45">Calendar</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {calendars.map((cal) => (
              <button
                key={cal.id}
                type="button"
                onClick={() => setCalendar(cal.id)}
                className={[
                  'flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3.5 text-[0.8125rem] transition focus:outline-none',
                  calendar === cal.id ? 'bg-white/12 text-moon' : 'text-moon/55 hover:bg-white/6',
                ].join(' ')}
                style={calendar === cal.id ? { boxShadow: `inset 0 0 0 1px ${cal.color || '#888'}` } : undefined}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cal.color || '#888' }} />
                {cal.name}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="t-label text-moon/45">Repeats</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REPEAT_OPTIONS.map((option) => (
              <Chip key={option.value} on={repeat === option.value} onClick={() => setRepeat(option.value)}>
                {option.value === 'none' ? null : <Repeat className="h-3 w-3" aria-hidden="true" />}
                {option.label}
              </Chip>
            ))}
          </div>
        </section>
      </div>

      <div className="relative flex shrink-0 items-center gap-2 border-t border-white/10 px-6 py-3">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-moon/55 transition hover:text-moon"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="soft-button inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-moon/90 transition disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/** A small either-or in a row of them. */
function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition focus:outline-none',
        on ? 'bg-accent/18 text-accent ring-1 ring-accent/35' : 'bg-white/6 text-moon/55 ring-1 ring-white/10 hover:text-moon/90',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */


/**
 * One to-do.
 *
 * `done` is passed in rather than read off the to-do, because for a repeat it
 * is a property of the DAY — Monday's bins being out says nothing about next
 * Monday's. Only the caller knows which day this row is being read on.
 */
function TodoRow({ todo, done, onToggle, onRemove, compact }) {
  const repeats = todo.repeat && todo.repeat !== 'none';
  const ticked = done ?? todo.done;
  return (
    <div className="ground-row group flex items-center gap-3 px-1.5 py-1.5">
      <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none">
        <CheckMark done={ticked} />
        <span className="min-w-0 flex-1">
          <span
            className={[
              compact ? 'text-[0.875rem]' : 'text-[0.9375rem]',
              'block truncate transition-colors',
              ticked ? 'text-moon/35 line-through' : 'text-moon/85',
            ].join(' ')}
          >
            {todo.label}
          </span>
          {/* Said in words rather than left to an icon: "every day until you
              tick it off" is a promise about tomorrow, and a small circular
              arrow does not make that promise. */}
          {repeats && !ticked ? <span className="day-todo-note">{repeatNote(todo.repeat)}</span> : null}
        </span>
        {repeats ? <Repeat className="h-3 w-3 shrink-0 self-start text-moon/30" aria-hidden="true" /> : null}
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
