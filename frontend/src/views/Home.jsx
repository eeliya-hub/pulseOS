import {
  CalendarDays,
  Check,
  Cloud,
  CloudRain,
  ImagePlus,
  Plus,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import GlassCard from '../components/GlassCard.jsx';
import LaunchIcon, { AppIcon, SiteIcon } from '../components/LaunchIcon.jsx';
import SettingsButton from '../components/SettingsButton.jsx';
import { loadedUntil, useCalendarEvents } from '../hooks/useCalendarEvents.js';
import { calendarColor, dateKey, keyToDate, occursOn, useLifeData } from '../hooks/useLifeData.js';
import { useSettings } from '../hooks/useSettings.js';
import { useWeather } from '../hooks/useWeather.js';
import { api } from '../services/api/backendClient.js';
import { hostOf, isSite, itemKey, itemLabel, launchItem, normalizeUrl } from '../services/launchpad/items.js';
import { getGreeting } from '../utils/dateTime.js';

// Start-of-event helpers for the "Upcoming" list.
const timesOf = (t) => (t || '').match(/\d{1,2}:\d{2}/g) ?? [];
const firstTime = (t) => timesOf(t)[0] || '';
const toMinutes = (t) => {
  const m = firstTime(t);
  if (!m) return 0;
  const [h, mm] = m.split(':').map(Number);
  return h * 60 + mm;
};
const endMinutes = (t) => {
  const times = timesOf(t);
  if (times.length < 2) return null;
  const [h, mm] = times[times.length - 1].split(':').map(Number);
  return h * 60 + mm;
};
const normTitle = (title) => (title || '').trim().toLowerCase();

const relDay = (offset, key) =>
  offset === 0
    ? 'Today'
    : keyToDate(key).toLocaleDateString('en-GB', offset < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });

// Full date, e.g. "Tue 7 Jun".
const dateLabel = (key) =>
  keyToDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// Human countdown to an occurrence ("in 40m", "in 3h", "in 5d").
function startsIn(offset, time, now) {
  const [h, m] = (time || '00:00').split(':').map(Number);
  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h || 0, m || 0);
  const diff = when - now;
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
  const dys = Math.round(hrs / 24);
  return `in ${dys} day${dys === 1 ? '' : 's'}`;
}

// Subtle tint from a 6-digit hex colour (e.g. for the highlighted badge).
const tint = (hex, alpha = '22') => (/^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}${alpha}` : 'rgba(255,255,255,0.06)');

// Read an uploaded image, downscale it, and return a small JPEG data URL so it
// stays well within localStorage limits.
function fileToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Flatten local + connected events into a single time-ordered list of upcoming
// occurrences (recurring events expand to each date, so shifts show individually).
//
// It looks as far ahead as the calendar is loaded. A fixed 75 days hid anything
// further out — an appointment in December, seen from September — even though the
// events were sitting right there.
// A subscribed public-holiday calendar (Google's "Holidays in United Kingdom" and
// the like). Its days are reference, not plans: left in, Halloween and Remembrance
// Sunday took the few Upcoming slots ahead of the user's actual appointments.
const isHolidayCalendar = (calendarId) => /#holiday@group\.v\.calendar\.google\.com$/.test(calendarId || '');

function buildUpcoming(events, now, until = loadedUntil()) {
  const days = Math.ceil((until - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(now);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(d);
    for (const e of events) {
      if (!occursOn(e, key)) continue;
      // Holidays still show on the day itself, and always on the Life Hub calendar.
      if (i > 0 && isHolidayCalendar(e.calendarId)) continue;
      const t = firstTime(e.time);
      const allDay = !t;
      const mins = toMinutes(e.time);
      if (key === todayKey && !allDay && (endMinutes(e.time) ?? mins) < nowMin) continue;
      out.push({
        id: `${e.id}:${key}`,
        sourceId: e.id,
        key,
        offset: i,
        time: t,
        timeLabel: (e.time || '').trim(), // full "HH:MM – HH:MM" (start–finish) when present
        allDay,
        sortVal: i * 10000 + mins,
        title: e.title,
        meta: e.place || e.calendarName || '',
        color: e.color || calendarColor(e.calendar),
      });
    }
  }
  return out.sort((a, b) => a.sortVal - b.sortVal);
}

function uniqueEventChoices(upcoming) {
  const seen = new Set();
  return upcoming.filter((event) => {
    const key = normTitle(event.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fallback day-by-day outlook (used until live weather arrives / when there's no
// API key). Real data comes from weather.daily with per-day high + low.
const DEFAULT_DAILY = [
  { day: 'Today', hi: 21, lo: 13, icon: 'rain' },
  { day: 'Tue', hi: 23, lo: 14, icon: 'sun' },
  { day: 'Wed', hi: 24, lo: 15, icon: 'sun' },
  { day: 'Thu', hi: 22, lo: 14, icon: 'cloud' },
  { day: 'Fri', hi: 20, lo: 12, icon: 'cloud' },
  { day: 'Sat', hi: 19, lo: 12, icon: 'rain' },
];

const dailyIcon = { rain: CloudRain, sun: Sun, cloud: Cloud };

// Horizontal breathing room around the launchpad icon grid (not the gaps
// between icons). Any CSS length, e.g. '0.5rem', '1rem', '12px'.
const LAUNCHPAD_PADDING = '0.85rem';

// Home bento row heights: "<weather row> <launchpad row>". The weather row also
// sets how tall the day-by-day bars can grow (raise the first value for taller
// bars); the launchpad row sets the space above & below the launchpad icons.
const HOME_GRID_ROWS = '1.6fr 1fr';

// Bar height scaled to the visible range of daily highs.
const barHeight = (temp, min, max) => 28 + (72 * (temp - min)) / ((max - min) || 1);

export default function Home({ onAskPulse }) {
  const { weather } = useWeather();
  const { settings, update } = useSettings();
  const [now, setNow] = useState(() => new Date());
  const [askText, setAskText] = useState('');
  const life = useLifeData();
  const calendar = useCalendarEvents();
  const daily = weather?.daily?.length ? weather.daily : DEFAULT_DAILY;
  const dailyHis = daily.map((d) => d.hi);
  const dailyMin = Math.min(...dailyHis);
  const dailyMax = Math.max(...dailyHis);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  // Same events as the Life Hub — local + connected — flattened to an upcoming list.
  const upcoming = useMemo(
    () => buildUpcoming([...life.events, ...calendar.events], now),
    [life.events, calendar.events, now],
  );
  const eventChoices = useMemo(() => uniqueEventChoices(upcoming), [upcoming]);

  // Pinned tracker: the next occurrence whose title matches (e.g. a shift).
  const pinned = settings.pinned ?? { label: 'Highlighted event', match: '', title: '', excludeFromUpcoming: false };
  const pinnedEvent = useMemo(() => {
    if (!pinned.match) return upcoming[0] ?? null;
    const match = normTitle(pinned.match);
    return upcoming.find((e) => normTitle(e.title) === match) ?? null;
  }, [upcoming, pinned.match]);
  const visibleUpcoming = useMemo(() => {
    if (!pinned.excludeFromUpcoming) return upcoming;
    const match = normTitle(pinned.match);
    // With a title match, hide EVERY occurrence of it; otherwise just the one
    // pinned "next event".
    if (match) return upcoming.filter((event) => normTitle(event.title) !== match);
    return pinnedEvent ? upcoming.filter((event) => event.id !== pinnedEvent.id) : upcoming;
  }, [pinned.excludeFromUpcoming, pinned.match, pinnedEvent, upcoming]);
  const next5 = visibleUpcoming.slice(0, 5);
  const [showPinnedConfig, setShowPinnedConfig] = useState(false);
  const launchpad = settings.launchpad ?? [];
  const [showLaunchpad, setShowLaunchpad] = useState(false);

  const askPulse = (text) => {
    const query = (text ?? askText).trim();
    if (!query || !onAskPulse) return;
    onAskPulse(query);
    setAskText('');
  };

  return (
    <div className="flex h-full flex-col">
      <header className="relative shrink-0 pb-4 pt-5 text-center">
        <h1 className="display-type text-3xl font-extralight tracking-wide text-white/95 md:text-[2.65rem]">
          {getGreeting(now)}, <span className="cyan-name font-light">{settings.name}</span>
        </h1>
        <p className="mt-2.5 text-[0.625rem] font-medium uppercase tracking-[0.32em] text-white/36">
          A calm start · {upcoming.filter((e) => e.offset === 0).length} today
        </p>

        {onAskPulse && (
          <form
            className="group relative mx-auto mt-4 w-full max-w-xl"
            onSubmit={(event) => {
              event.preventDefault();
              askPulse();
            }}
          >
            <label htmlFor="home-ask-pulse" className="sr-only">
              Ask Pulse
            </label>
            <Sparkles
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-100/60"
              aria-hidden="true"
            />
            <input
              id="home-ask-pulse"
              type="text"
              value={askText}
              onChange={(event) => setAskText(event.target.value)}
              placeholder="Ask Pulse anything…"
              className="w-full rounded-full border border-white/12 bg-white/7 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-cyan-100/30 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(116,242,255,0.08)]"
            />
          </form>
        )}

        <SettingsButton className="absolute right-0 top-5" />
      </header>

      <div className="flex min-h-0 flex-1 items-center">
        <section
          className="grid h-[37rem] max-h-full w-full grid-cols-12 gap-4"
          style={{ gridTemplateRows: HOME_GRID_ROWS }}
        >
        <GlassCard tone="cyan" className="col-span-7 flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
                Weather · {weather?.location ?? 'London'}
              </p>
              <div className="mt-2 flex items-end gap-4">
                <p className="display-type text-5xl font-extralight leading-none text-white text-glow md:text-6xl">
                  {weather?.temperature ?? 17}°
                </p>
                <div className="pb-1.5">
                  <p className="display-type text-xl font-light text-white/90">
                    {weather?.condition ?? 'Soft rain clearing'}
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-white/52">
                    Unsettled today, then drier and brighter through midweek.
                  </p>
                </div>
              </div>
            </div>
            <span className="soft-row glow-ring grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
              <CloudRain className="h-5 w-5 text-white/90" strokeWidth={1.5} aria-hidden="true" />
            </span>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 items-stretch justify-between gap-1.5">
            {daily.map((slot, index) => {
              const Icon = dailyIcon[slot.icon] ?? Cloud;
              return (
                <div
                  key={slot.date ?? index}
                  className={[
                    'flex flex-1 flex-col items-center justify-end gap-1 rounded-2xl py-2 transition-colors',
                    index === 0 ? 'soft-row' : 'hover:bg-white/4',
                  ].join(' ')}
                >
                  <span className="clock-figures text-sm font-semibold text-white/90">{slot.hi}°</span>
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    <div className="h-full w-1.5 rounded-full bg-white/8" />
                    <div
                      className={[
                        'absolute bottom-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-t from-cyan-300/80 to-white/80',
                        index === 0 ? 'glow-dot text-cyan-200' : '',
                      ].join(' ')}
                      style={{ height: `${barHeight(slot.hi, dailyMin, dailyMax)}%` }}
                    />
                  </div>
                  <span className="clock-figures text-[0.6875rem] font-medium text-white/45">{slot.lo}°</span>
                  <Icon className="h-4 w-4 text-white/60" strokeWidth={1.7} aria-hidden="true" />
                  <span className="text-[0.625rem] font-medium uppercase tracking-[0.12em] text-white/40">
                    {index === 0 ? 'Today' : slot.day}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-4 divide-x divide-white/10 border-t border-white/10 pt-3">
            <WeatherStat label="Feels" value={`${weather?.feelsLike ?? 17}°`} />
            <WeatherStat label="Rain" value={weather?.precipitation ?? '38%'} />
            <WeatherStat label="Wind" value={weather?.wind ?? '9 mph SW'} />
            <WeatherStat label="Air" value={weather?.airQuality ?? 24} />
          </div>
        </GlassCard>

        <GlassCard delay={120} className="col-span-5 row-span-2 flex min-h-0 flex-col overflow-hidden">
          <div className="mb-1">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">Upcoming</p>
          </div>

          <div className="relative min-h-0 flex-1 pr-1">
            {next5.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-white/40">
                {calendar.loading ? 'Syncing calendars…' : 'Nothing upcoming'}
              </div>
            ) : (
              <>
                {/* Continuous timeline spine; dots sit on it per event. */}
                <div className="pointer-events-none absolute bottom-4 left-[3.95rem] top-4 w-px bg-gradient-to-b from-cyan-200/45 via-white/12 to-transparent" />
                <div className="flex h-full flex-col justify-between py-1">
                  {next5.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[2.9rem_1.15rem_1fr] items-start gap-2 rounded-xl py-1.5 pr-1 transition-colors hover:bg-white/[0.04]"
                  >
                    <div className="pt-0.5 text-right leading-tight">
                      {event.allDay ? (
                        <>
                          <p className="text-sm font-semibold text-white/85">{relDay(event.offset, event.key)}</p>
                          <p className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-white/35">all day</p>
                        </>
                      ) : (
                        <>
                          <p className="clock-figures text-sm font-semibold text-white/85">{event.time}</p>
                          <p className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-cyan-100/45">
                            {relDay(event.offset, event.key)}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex justify-center pt-[0.4rem]">
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-2 ring-white/10"
                        style={{ backgroundColor: event.color }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="display-type truncate text-[1.05rem] font-normal leading-tight text-white">
                        {event.title}
                      </p>
                      {event.meta && <p className="mt-0.5 truncate text-xs text-white/45">{event.meta}</p>}
                    </div>
                  </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="mt-3 shrink-0 border-t border-white/10 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">{pinned.label}</p>
              <button
                type="button"
                onClick={() => setShowPinnedConfig(true)}
                aria-label="Configure pinned event"
                className="text-white/35 transition hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {pinnedEvent ? (
              <div className="glow-ring relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white/[0.05] p-3 pl-4 ring-1 ring-white/10">
                <span
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: pinnedEvent.color }}
                  aria-hidden="true"
                />
                {pinned.image ? (
                  <img
                    src={pinned.image}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPinnedConfig(true)}
                    aria-label="Add an image"
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-xl ring-1 ring-white/10 transition hover:ring-white/25"
                    style={{ backgroundColor: tint(pinnedEvent.color, '26') }}
                  >
                    <CalendarDays className="h-6 w-6 text-white/55" aria-hidden="true" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="display-type min-w-0 flex-1 truncate text-[1.05rem] font-medium leading-tight text-white">
                      {pinned.title || pinnedEvent.title}
                    </p>
                    <span className="clock-figures shrink-0 text-sm font-medium text-cyan-100/85">
                      {pinnedEvent.timeLabel || 'All day'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-white/50">
                    {dateLabel(pinnedEvent.key)}
                    <span className="text-white/25"> · </span>
                    <span className="text-cyan-100/60">{startsIn(pinnedEvent.offset, pinnedEvent.time, now)}</span>
                    {pinnedEvent.meta ? <span className="text-white/40"> · {pinnedEvent.meta}</span> : null}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPinnedConfig(true)}
                className="soft-row flex w-full items-center justify-center rounded-2xl p-3 text-xs text-white/40 transition hover:text-white/70"
              >
                {pinned.match ? `No upcoming “${pinned.match}”` : 'Pick an event to track →'}
              </button>
            )}
          </div>

          {showPinnedConfig && (
            <PinnedConfig
              pinned={pinned}
              events={eventChoices}
              onSave={(next) => update({ pinned: next })}
              onClose={() => setShowPinnedConfig(false)}
            />
          )}
        </GlassCard>

        <GlassCard delay={200} className="col-span-7 flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">Launchpad</p>
            <button
              type="button"
              onClick={() => setShowLaunchpad(true)}
              aria-label="Choose launchpad apps"
              className="text-white/35 transition hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div
            className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center"
            style={{ padding: LAUNCHPAD_PADDING }}
          >
            {launchpad.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowLaunchpad(true)}
                className="mx-auto rounded-xl px-4 py-3 text-xs text-white/45 transition hover:text-white/75"
              >
                Choose apps &amp; sites to add →
              </button>
            ) : (
              <div className="grid grid-cols-5 items-start gap-x-2 gap-y-3">
                {launchpad.slice(0, 10).map((item) => {
                  const label = itemLabel(item);
                  return (
                    <button
                      key={itemKey(item)}
                      type="button"
                      onClick={() => launchItem(item)}
                      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-1 transition hover:-translate-y-1 hover:bg-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                      aria-label={`Open ${label}`}
                    >
                      <LaunchIcon item={item} />
                      <span className="w-full truncate text-center text-[0.625rem] font-medium text-white/45 transition group-hover:text-white/80">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {showLaunchpad && (
            <LaunchpadPicker selected={launchpad} onChange={(apps) => update({ launchpad: apps })} onClose={() => setShowLaunchpad(false)} />
          )}
        </GlassCard>
        </section>
      </div>
    </div>
  );
}

function WeatherStat({ label, value }) {
  return (
    <div className="px-3 first:pl-0">
      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/38">
        {label}
      </p>
      <p className="weather-metric clock-figures mt-0.5 text-base font-medium">{value}</p>
    </div>
  );
}

function PinnedConfig({ pinned, events, onSave, onClose }) {
  const [draft, setDraft] = useState({
    label: 'Highlighted event',
    match: '',
    title: '',
    image: '',
    excludeFromUpcoming: false,
    ...pinned,
  });
  const selected = events.find((event) => normTitle(event.title) === normTitle(draft.match));

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      patch({ image: await fileToDataUrl(file) });
    } catch {
      /* ignore bad image */
    }
  };
  const save = () => {
    onSave({
      label: draft.label.trim() || 'Highlighted event',
      match: draft.match.trim(),
      title: draft.title.trim(),
      image: draft.image || '',
      excludeFromUpcoming: Boolean(draft.excludeFromUpcoming),
    });
    onClose();
  };

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-[#070b18]/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-3xl p-5">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="display-type text-lg font-light text-white text-glow">Highlight event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event highlight settings"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {/* Left — the tracker config */}
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/42">
                Category
              </span>
              <input
                value={draft.label}
                onChange={(event) => patch({ label: event.target.value })}
                placeholder="My next shift"
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/42">
                Display title
              </span>
              <input
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder={selected?.title || draft.match || 'Shift at B&Q'}
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/42">
                Image
              </span>
              <div className="flex items-center gap-3">
                {draft.image ? (
                  <img src={draft.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/15" />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/8 ring-1 ring-white/10">
                    <ImagePlus className="h-5 w-5 text-white/40" aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-col items-start gap-1.5">
                  <label className="cursor-pointer rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12">
                    {draft.image ? 'Change image' : 'Upload image'}
                    <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                  </label>
                  {draft.image && (
                    <button
                      type="button"
                      onClick={() => patch({ image: '' })}
                      className="text-[0.6875rem] font-medium text-rose-300/80 transition hover:text-rose-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/42">
                Match title
              </span>
              <input
                value={draft.match}
                onChange={(event) => patch({ match: event.target.value })}
                placeholder="Select or type an event title"
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
              />
            </label>

            <button
              type="button"
              onClick={() => patch({ excludeFromUpcoming: !draft.excludeFromUpcoming })}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-left transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-pressed={draft.excludeFromUpcoming}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white/82">Hide from Upcoming</span>
                <span className="mt-0.5 block text-[0.6875rem] text-white/42">Hides every occurrence from the list.</span>
              </span>
              <span
                className={[
                  'relative h-5 w-9 shrink-0 rounded-full ring-1 transition',
                  draft.excludeFromUpcoming ? 'bg-cyan-200/25 ring-cyan-200/35' : 'bg-white/8 ring-white/14',
                ].join(' ')}
                aria-hidden="true"
              >
                <span
                  className={[
                    'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white transition',
                    draft.excludeFromUpcoming ? 'left-[1.15rem]' : 'left-1',
                  ].join(' ')}
                />
              </span>
            </button>
          </div>

          {/* Right — pick from your calendar events */}
          <div className="flex min-h-0 flex-col">
            <span className="mb-1.5 block shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/42">
              Events
            </span>
            <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <p className="rounded-2xl bg-white/[0.04] px-3 py-5 text-center text-xs text-white/40">
                  No upcoming calendar events.
                </p>
              ) : (
                events.map((event) => {
                  const active = normTitle(event.title) === normTitle(draft.match);
                  return (
                    <button
                      key={event.sourceId}
                      type="button"
                      onClick={() => patch({ match: event.title })}
                      className={[
                        'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                        active
                          ? 'bg-cyan-200/12 text-white ring-1 ring-cyan-200/25'
                          : 'bg-white/[0.04] text-white/74 hover:bg-white/[0.07] hover:text-white',
                      ].join(' ')}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{event.title}</span>
                        <span className="mt-0.5 block truncate text-[0.6875rem] text-white/45">
                          {event.time || 'all day'} · {relDay(event.offset, event.key)}
                          {event.meta ? ` · ${event.meta}` : ''}
                        </span>
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-cyan-100" aria-hidden="true" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => patch({ match: '', title: '' })}
            className="rounded-xl px-3 py-2 text-xs font-medium text-white/45 transition hover:bg-white/8 hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Track next event
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-xs font-medium text-white/45 transition hover:bg-white/8 hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-xl bg-cyan-200/15 px-3 py-2 text-xs font-semibold text-cyan-50 ring-1 ring-cyan-200/25 transition hover:bg-cyan-200/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Pick which installed apps + website shortcuts show on the launchpad.
function LaunchpadPicker({ selected, onChange, onClose }) {
  const [apps, setApps] = useState(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('apps'); // 'apps' | 'sites'
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [siteError, setSiteError] = useState('');

  useEffect(() => {
    api.launch
      .apps()
      .then((d) => setApps(d.apps ?? []))
      .catch(() => setApps([]));
  }, []);

  const sel = new Set(selected.filter((item) => !isSite(item)));
  const sites = selected.filter(isSite);
  const atLimit = selected.length >= 10;

  const toggle = (name) => {
    if (sel.has(name)) onChange(selected.filter((a) => isSite(a) || a !== name));
    else if (!atLimit) onChange([...selected, name]);
  };
  const addSite = () => {
    const url = normalizeUrl(siteUrl);
    if (!url) {
      setSiteError('Enter a valid web address, e.g. figma.com');
      return;
    }
    if (selected.some((item) => isSite(item) && item.url === url)) {
      setSiteError('That site is already on your launchpad.');
      return;
    }
    if (atLimit) {
      setSiteError('Launchpad is full — remove something first.');
      return;
    }
    onChange([...selected, { url, name: siteName.trim() || hostOf(url) }]);
    setSiteName('');
    setSiteUrl('');
    setSiteError('');
  };
  const removeSite = (url) => onChange(selected.filter((item) => !(isSite(item) && item.url === url)));
  const filtered = (apps ?? []).filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-[#070b18]/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="display-type text-lg font-light text-white text-glow">Launchpad</h2>
          <div className="flex items-center gap-3">
            <span className="text-[0.6875rem] font-medium text-white/40">{selected.length}/10</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mb-3 flex shrink-0 gap-1 rounded-xl bg-white/6 p-1 text-xs font-semibold">
          {[
            ['apps', 'Apps'],
            ['sites', 'Websites'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                'flex-1 rounded-lg px-3 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                tab === id ? 'bg-white/12 text-white ring-1 ring-white/10' : 'text-white/50 hover:text-white/80',
              ].join(' ')}
            >
              {label}
              {id === 'sites' && sites.length ? ` · ${sites.length}` : ''}
            </button>
          ))}
        </div>

        {tab === 'apps' ? (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="mb-3 w-full shrink-0 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
            />

            <div className="glass-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {apps === null ? (
                <p className="py-10 text-center text-xs text-white/40">Reading your applications…</p>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-xs text-white/40">No apps found.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {filtered.map((a) => {
                    const on = sel.has(a.name);
                    return (
                      <button
                        key={a.name}
                        type="button"
                        onClick={() => toggle(a.name)}
                        className={[
                          'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                          on ? 'bg-cyan-200/12 ring-1 ring-cyan-200/25' : 'hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <AppIcon app={a.name} className="h-8 w-8" />
                        <span className={`min-w-0 flex-1 truncate text-xs ${on ? 'text-white' : 'text-white/70'}`}>
                          {a.name}
                        </span>
                        {on && <Check className="h-4 w-4 shrink-0 text-cyan-100" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="mt-3 shrink-0 text-[0.625rem] text-white/38">
              Pick up to 10 items. Icons come straight from each app; tap a launchpad tile to open it.
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 shrink-0 space-y-2">
              <div className="flex gap-2">
                <input
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="Name (optional)"
                  className="w-1/3 shrink-0 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
                />
                <input
                  value={siteUrl}
                  onChange={(e) => {
                    setSiteUrl(e.target.value);
                    setSiteError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSite();
                    }
                  }}
                  placeholder="figma.com"
                  className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
                />
                <button
                  type="button"
                  onClick={addSite}
                  disabled={atLimit || !siteUrl.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-cyan-200/15 px-3 py-2 text-xs font-semibold text-cyan-50 ring-1 ring-cyan-200/25 transition hover:bg-cyan-200/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add
                </button>
              </div>
              {siteError && <p className="text-[0.6875rem] font-medium text-rose-300/80">{siteError}</p>}
            </div>

            <div className="glass-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {sites.length === 0 ? (
                <p className="py-10 text-center text-xs text-white/40">
                  No websites yet — add one above to pin it to your launchpad.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {sites.map((site) => (
                    <div
                      key={site.url}
                      className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2"
                    >
                      <SiteIcon url={site.url} className="h-8 w-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-white">
                          {site.name || hostOf(site.url)}
                        </span>
                        <span className="block truncate text-[0.6875rem] text-white/40">{hostOf(site.url)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSite(site.url)}
                        aria-label={`Remove ${site.name || hostOf(site.url)}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/35 transition hover:bg-white/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-3 shrink-0 text-[0.625rem] text-white/38">
              Pick up to 10 items total. Websites open in your default browser.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
