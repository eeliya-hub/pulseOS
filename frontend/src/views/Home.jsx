import {
  Check,
  Cloud,
  CloudRain,
  Droplets,
  ImagePlus,
  Leaf,
  Plus,
  Settings2,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import LaunchIcon, { AppIcon, SiteIcon } from '../components/LaunchIcon.jsx';
import { Column, Ground, SkyZone } from '../components/Stage.jsx';
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

export default function Home({ onAskPulse }) {
  const { weather } = useWeather();
  const { settings, update } = useSettings();
  const [now, setNow] = useState(() => new Date());
  const [askText, setAskText] = useState('');
  const life = useLifeData();
  const calendar = useCalendarEvents();
  const daily = weather?.daily?.length ? weather.daily : DEFAULT_DAILY;
  // One scale for every day's range bar, so the days read against each other.
  const rangeMin = Math.min(...daily.map((d) => d.lo));
  const rangeMax = Math.max(...daily.map((d) => d.hi));
  const rangeSpan = Math.max(1, rangeMax - rangeMin);
  const NowIcon = dailyIcon[daily[0]?.icon] ?? Cloud;

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

  const todayCount = upcoming.filter((e) => e.offset === 0).length;

  return (
    <div className="flex h-full flex-col">
      {/* ── Sky: the day, the weather now, and what's next ─────────────────── */}
      <SkyZone className="grid grid-cols-[minmax(0,2.35fr)_minmax(0,0.82fr)] items-end">
        {/* The right cell repeats the Ground's column fractions below
            (1.05 + 1.3 | 0.82) so the event block lines up exactly with the
            Launch column: its left edge on the rule, its right edge on the
            column's. Change one and change the other. */}
        <div className="min-w-0">
          <h1 className="t-hero truncate">
            {getGreeting(now)}, <span className="name-mark">{settings.name}</span>
          </h1>
          <p className="t-lede mt-3">
            {todayCount === 0
              ? 'Nothing else on today'
              : todayCount === 1
                ? 'One thing on today'
                : `${todayCount} things on today`}
          </p>

          <div className="mt-8 flex items-center gap-2">
            {onAskPulse && (
              <form
                className="group relative w-[30rem] max-w-full"
                onSubmit={(event) => {
                  event.preventDefault();
                  askPulse();
                }}
              >
                <label htmlFor="home-ask-pulse" className="sr-only">
                  Ask Pulse
                </label>
                <Sparkles
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-accent"
                  aria-hidden="true"
                />
                <input
                  id="home-ask-pulse"
                  type="text"
                  value={askText}
                  onChange={(event) => setAskText(event.target.value)}
                  placeholder="Ask Pulse anything"
                  className="h-11 w-full rounded-full bg-white/[0.07] pl-11 pr-4 text-[0.9375rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] outline-none backdrop-blur-md transition placeholder:text-moon/45 focus:bg-white/[0.11] focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                />
              </form>
            )}
            <SettingsButton />
          </div>
        </div>

        {/* What's next — what it is and when it starts across the top, then its
            icon beside the detail: title, when, and where over two lines. */}
        <div className="w-full min-w-0 pb-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {pinnedEvent ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: pinnedEvent.color }}
                  aria-hidden="true"
                />
              ) : null}
              <p className="t-label truncate">{pinned.label}</p>
              <button
                type="button"
                onClick={() => setShowPinnedConfig(true)}
                aria-label="Configure pinned event"
                className="pill h-7 w-7 shrink-0 px-0 text-moon/70"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {pinnedEvent ? (
              <p
                key={startsIn(pinnedEvent.offset, pinnedEvent.time, now)}
                className="display-figures figure-tick shrink-0 text-[1.125rem] italic leading-none text-accent"
              >
                {startsIn(pinnedEvent.offset, pinnedEvent.time, now)}
              </p>
            ) : null}
          </div>

          {pinnedEvent ? (
            <div className="mt-3.5 flex items-start gap-4">
              {pinned.image ? (
                <img
                  src={pinned.image}
                  alt=""
                  className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-[1.1rem] object-cover shadow-2xl ring-1 ring-white/15"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="t-title truncate text-[1.75rem] leading-[1.15]">{pinned.title || pinnedEvent.title}</p>
                <p className="t-body mt-1 truncate text-[1rem] text-moon/90">
                  {dateLabel(pinnedEvent.key)},&ensp;
                  <span className="clock-figures">{pinnedEvent.timeLabel || 'All day'}</span>
                </p>
                {pinnedEvent.meta ? <p className="t-micro mt-1 truncate italic">{pinnedEvent.meta}</p> : null}
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowPinnedConfig(true)} className="pill mt-4 h-9 px-4">
              {pinned.match ? `No upcoming “${pinned.match}”` : 'Pick an event to track'}
            </button>
          )}
        </div>
      </SkyZone>

      {/* ── Ground: what's coming, the week's weather, and your apps ───────── */}
      <Ground className="grid grid-cols-[1.05fr_1.3fr_0.82fr]">
        <Column label="Upcoming" className="pr-8 pt-7">
          {next5.length === 0 ? (
            <p className="mt-7 text-[0.9375rem] text-dim">{calendar.loading ? 'Syncing calendars…' : 'Nothing upcoming'}</p>
          ) : (
            <ol className="cascade relative mt-[1.375rem]">
              <span
                className="pointer-events-none absolute bottom-6 left-[4.85rem] top-5 w-px bg-gradient-to-b from-white/20 via-white/10 to-transparent"
                aria-hidden="true"
              />
              {next5.map((event) => (
                <li
                  key={event.id}
                  className="ground-row grid grid-cols-[3.6rem_1.5rem_minmax(0,1fr)] items-start gap-2 py-2.5 pr-2"
                >
                  <div className="text-right leading-tight">
                    <p className="text-[1rem] font-medium text-moon">{relDay(event.offset, event.key)}</p>
                    <p className="clock-figures t-micro mt-0.5">{event.allDay ? 'All day' : event.time}</p>
                  </div>
                  <span
                    className="relative z-10 mx-auto mt-[0.4rem] h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_rgba(10,13,28,0.95)]"
                    style={{ backgroundColor: event.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="t-title truncate text-[1.25rem]">{event.title}</p>
                    {event.meta ? <p className="t-meta mt-0.5 truncate">{event.meta}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Column>

        <Column label="Forecast" className="ground-rule px-8 pt-7" bodyClassName="flex min-h-0 flex-col pb-2">
          {/* What it's doing right now, at the head of the week it belongs to. */}
          <div className="mt-[1.6875rem] flex shrink-0 items-center gap-4">
            <NowIcon className="h-9 w-9 shrink-0 text-moon/85" strokeWidth={1.3} aria-hidden="true" />
            <p className="display-figures text-[3rem] leading-none text-moon">{weather?.temperature ?? 17}°</p>
            <div className="min-w-0 leading-tight">
              <p className="t-body truncate text-[1.0625rem] text-moon">
                {weather?.condition ?? 'Soft rain clearing'} in {weather?.location ?? 'London'}
              </p>
              <p className="t-meta clock-figures mt-1.5">
                High <span className="temp-hi">{weather?.high ?? daily[0]?.hi}°</span>&ensp;Low{' '}
                <span className="temp-lo">{weather?.low ?? daily[0]?.lo}°</span>
                {weather?.sunset ? (
                  <>
                    &ensp;Sunset <span className="text-moon/75">{weather.sunset}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          <div
            className="mt-6 h-px shrink-0 bg-gradient-to-r from-white/[0.2] via-white/[0.16] to-white/[0.07]"
            aria-hidden="true"
          />

          <ul className="cascade mt-6 shrink-0 space-y-[1.15rem]">
            {daily.map((slot, index) => {
              const Icon = dailyIcon[slot.icon] ?? Cloud;
              const left = ((slot.lo - rangeMin) / rangeSpan) * 100;
              const width = Math.max(4, ((slot.hi - slot.lo) / rangeSpan) * 100);
              const nowAt =
                index === 0 && weather?.temperature != null
                  ? Math.min(100, Math.max(0, ((weather.temperature - rangeMin) / rangeSpan) * 100))
                  : null;
              return (
                <li
                  key={slot.date ?? index}
                  className="grid grid-cols-[3.25rem_1.25rem_2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3"
                >
                  <span
                    className={
                      index === 0 ? 'text-[0.9375rem] font-medium text-accent' : 'text-[0.9375rem] text-moon/70'
                    }
                  >
                    {index === 0 ? 'Today' : slot.day}
                  </span>
                  <Icon className="h-4 w-4 text-moon/45" strokeWidth={1.6} aria-hidden="true" />
                  <span className="clock-figures temp-lo text-right text-[0.9375rem]">{slot.lo}°</span>
                  <span className="relative h-[5px] rounded-full bg-white/[0.045]">
                    <span
                      className="bar-grow absolute inset-y-0 rounded-full"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background:
                          'linear-gradient(90deg, color-mix(in srgb, var(--accent) 38%, transparent), color-mix(in srgb, var(--moon) 70%, transparent))',
                      }}
                    />
                    {nowAt != null ? (
                      <span
                        className="absolute top-1/2 h-[0.8rem] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-moon shadow-[0_0_6px_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        style={{ left: `${nowAt}%` }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="clock-figures temp-hi text-[0.9375rem]">{slot.hi}°</span>
                </li>
              );
            })}
          </ul>
          {/* The four readings on one line: the icon says which, so the words
              don't have to. Each keeps its name for screen readers and hover. */}
          <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.05] pt-6">
            <WeatherStat icon={Thermometer} tint="#ffb4a2" label="Feels like" value={`${weather?.feelsLike ?? 17}°`} />
            <WeatherStat icon={Droplets} tint="#8fc7ff" label="Rain" value={weather?.precipitation ?? '38%'} />
            <WeatherStat icon={Wind} tint="#c7d2f0" label="Wind" value={weather?.wind ?? '9 mph SW'} />
            <WeatherStat icon={Leaf} tint="#8fe0b8" label="Air quality" value={weather?.airQuality ?? 24} />
          </div>
        </Column>

        <Column
          label="Launch"
          action={
            <button
              type="button"
              onClick={() => setShowLaunchpad(true)}
              aria-label="Choose launchpad apps"
              className="pill h-7 w-7 px-0 text-moon/70"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          }
          className="ground-rule pl-8 pt-7"
        >
          {launchpad.length === 0 ? (
            <button type="button" onClick={() => setShowLaunchpad(true)} className="pill mt-7 h-9 px-4">
              Choose apps and sites to add
            </button>
          ) : (
            <div className="cascade mt-[0.625rem] grid grid-cols-3 gap-x-2 gap-y-2">
              {launchpad.slice(0, 12).map((item) => {
                const label = itemLabel(item);
                return (
                  <button
                    key={itemKey(item)}
                    type="button"
                    onClick={() => launchItem(item)}
                    aria-label={`Open ${label}`}
                    className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-2.5 transition hover:bg-white/[0.05] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <LaunchIcon
                      item={item}
                      className="h-12 w-12 transition-transform duration-300 group-hover:-translate-y-0.5"
                    />
                    <span className="w-full truncate text-center text-[0.75rem] text-haze transition group-hover:text-moon">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Column>
      </Ground>

      {showPinnedConfig && (
        <PinnedConfig
          pinned={pinned}
          events={eventChoices}
          onSave={(next) => update({ pinned: next })}
          onClose={() => setShowPinnedConfig(false)}
        />
      )}
      {showLaunchpad && (
        <LaunchpadPicker
          selected={launchpad}
          onChange={(apps) => update({ launchpad: apps })}
          onClose={() => setShowLaunchpad(false)}
        />
      )}
    </div>
  );
}

function WeatherStat({ icon: Icon, tint, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2" title={label}>
      <Icon
        className="h-[1.05rem] w-[1.05rem] shrink-0"
        style={{ color: tint, opacity: 0.75 }}
        strokeWidth={1.7}
        aria-hidden="true"
      />
      <p className="clock-figures truncate text-[0.9375rem] text-moon">
        <span className="sr-only">{label}: </span>
        {value}
      </p>
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
          <h2 className="display-type text-lg font-light text-moon text-glow">Highlight event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event highlight settings"
            className="grid h-8 w-8 place-items-center rounded-full text-moon/50 transition hover:bg-white/10 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {/* Left — the tracker config */}
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
                Category
              </span>
              <input
                value={draft.label}
                onChange={(event) => patch({ label: event.target.value })}
                placeholder="My next shift"
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
                Display title
              </span>
              <input
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder={selected?.title || draft.match || 'Shift at B&Q'}
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
                Image
              </span>
              <div className="flex items-center gap-3">
                {draft.image ? (
                  <img src={draft.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/15" />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/8 ring-1 ring-white/10">
                    <ImagePlus className="h-5 w-5 text-moon/40" aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-col items-start gap-1.5">
                  <label className="cursor-pointer rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-moon/80 ring-1 ring-white/12 transition hover:bg-white/12">
                    {draft.image ? 'Change image' : 'Upload image'}
                    <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                  </label>
                  {draft.image && (
                    <button
                      type="button"
                      onClick={() => patch({ image: '' })}
                      className="text-[0.8125rem] font-medium text-rose-300/80 transition hover:text-rose-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
                Match title
              </span>
              <input
                value={draft.match}
                onChange={(event) => patch({ match: event.target.value })}
                placeholder="Select or type an event title"
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
              />
            </label>

            <button
              type="button"
              onClick={() => patch({ excludeFromUpcoming: !draft.excludeFromUpcoming })}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-left transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-pressed={draft.excludeFromUpcoming}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-moon/82">Hide from Upcoming</span>
                <span className="mt-0.5 block text-[0.8125rem] text-moon/42">Hides every occurrence from the list.</span>
              </span>
              <span
                className={[
                  'relative h-5 w-9 shrink-0 rounded-full ring-1 transition',
                  draft.excludeFromUpcoming ? 'bg-accent/25 ring-accent/35' : 'bg-white/8 ring-white/14',
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
            <span className="mb-1.5 block shrink-0 text-[0.75rem] font-semibold text-moon/42">
              Events
            </span>
            <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {events.length === 0 ? (
                <p className="rounded-2xl bg-white/[0.04] px-3 py-5 text-center text-xs text-moon/40">
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
                          ? 'bg-accent/12 text-moon ring-1 ring-accent/25'
                          : 'bg-white/[0.04] text-moon/74 hover:bg-white/[0.07] hover:text-moon',
                      ].join(' ')}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{event.title}</span>
                        <span className="mt-0.5 block truncate text-[0.8125rem] text-moon/45">
                          {event.time || 'all day'} · {relDay(event.offset, event.key)}
                          {event.meta ? ` · ${event.meta}` : ''}
                        </span>
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /> : null}
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
            className="rounded-xl px-3 py-2 text-xs font-medium text-moon/45 transition hover:bg-white/8 hover:text-moon/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Track next event
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-xs font-medium text-moon/45 transition hover:bg-white/8 hover:text-moon/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
          <h2 className="display-type text-lg font-light text-moon text-glow">Launchpad</h2>
          <div className="flex items-center gap-3">
            <span className="text-[0.8125rem] font-medium text-moon/40">{selected.length}/10</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-moon/50 transition hover:bg-white/10 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
                tab === id ? 'bg-white/12 text-moon ring-1 ring-white/10' : 'text-moon/50 hover:text-moon/80',
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
              className="mb-3 w-full shrink-0 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
            />

            <div className="glass-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {apps === null ? (
                <p className="py-10 text-center text-xs text-moon/40">Reading your applications…</p>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-xs text-moon/40">No apps found.</p>
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
                          on ? 'bg-accent/12 ring-1 ring-accent/25' : 'hover:bg-white/[0.06]',
                        ].join(' ')}
                      >
                        <AppIcon app={a.name} className="h-8 w-8" />
                        <span className={`min-w-0 flex-1 truncate text-xs ${on ? 'text-moon' : 'text-moon/70'}`}>
                          {a.name}
                        </span>
                        {on && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="mt-3 shrink-0 text-[0.75rem] text-moon/38">
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
                  className="w-1/3 shrink-0 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
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
                  className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
                />
                <button
                  type="button"
                  onClick={addSite}
                  disabled={atLimit || !siteUrl.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add
                </button>
              </div>
              {siteError && <p className="text-[0.8125rem] font-medium text-rose-300/80">{siteError}</p>}
            </div>

            <div className="glass-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {sites.length === 0 ? (
                <p className="py-10 text-center text-xs text-moon/40">
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
                        <span className="block truncate text-xs font-medium text-moon">
                          {site.name || hostOf(site.url)}
                        </span>
                        <span className="block truncate text-[0.8125rem] text-moon/40">{hostOf(site.url)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSite(site.url)}
                        aria-label={`Remove ${site.name || hostOf(site.url)}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-moon/35 transition hover:bg-white/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-3 shrink-0 text-[0.75rem] text-moon/38">
              Pick up to 10 items total. Websites open in your default browser.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
