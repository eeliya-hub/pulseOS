import { CalendarClock, CloudSun } from 'lucide-react';
import { useMemo } from 'react';
import { useCalendarEvents } from '../hooks/useCalendarEvents.js';
import { useLifeData } from '../hooks/useLifeData.js';
import { useSettings } from '../hooks/useSettings.js';
import { useWeather } from '../hooks/useWeather.js';
import { formatClock, formatLongDate, greetingFor, meridiem } from '../utils/dateTime.js';
import { buildUpcoming, relDay } from '../utils/upcoming.js';

/**
 * The screen at rest: the time, large enough to read from across a room, set
 * against the hour's sky. Everything else is a whisper around it — the greeting
 * above in the hour's own colour, the date below in the display face, and the
 * way back out kept to the smallest thing on the screen.
 *
 * What else it says is yours to choose in Settings: the weather outside, and
 * what's next on the calendar, each on one quiet line under the date.
 */
export default function IdleScreen({ now }) {
  const { settings } = useSettings();
  const shows = settings.restShows ?? {};
  const clock = formatClock(now).replace(' : ', ':');
  const ampm = meridiem(now);

  return (
    <section className="relative z-10 grid h-dvh place-items-center px-6 text-center">
      <div className="view-enter flex flex-col items-center">
        {shows.greeting !== false ? (
          <p className="t-eyebrow text-[1.0625rem]">
            {greetingFor(now)}, <span className="text-moon/80">{settings.name}</span>
          </p>
        ) : null}

        {/* The hour itself. Each minute resolves in rather than snapping over. */}
        <p
          key={clock}
          data-view-hero=""
          className="display-figures figure-tick mt-10 text-[clamp(7rem,17vw,14rem)] leading-[0.92] tracking-[-0.04em] text-moon"
        >
          {clock}
          {ampm ? <span className="ml-3 text-[0.22em] tracking-normal text-moon/55">{ampm}</span> : null}
        </p>

        {shows.date !== false ? (
          <p className="display-type mt-8 text-[1.625rem] leading-none text-moon/70">{formatLongDate(now)}</p>
        ) : null}

        {shows.weather || shows.next ? (
          <div className="mt-9 flex items-center gap-8 text-[1.0625rem] text-moon/75">
            {shows.weather ? <RestWeather /> : null}
            {shows.weather && shows.next ? <span className="h-5 w-px bg-white/20" aria-hidden="true" /> : null}
            {shows.next ? <RestNext now={now} /> : null}
          </div>
        ) : null}

        <p className="breathe t-micro mt-16 text-moon/45">Touch anywhere to wake</p>
      </div>
    </section>
  );
}

function RestWeather() {
  const { weather } = useWeather();
  if (!weather) return null;
  return (
    <p className="flex items-center gap-2.5">
      <CloudSun className="h-5 w-5 text-moon/60" strokeWidth={1.5} aria-hidden="true" />
      <span className="display-figures text-[1.5rem] leading-none text-moon">{weather.temperature}°</span>
      <span>{weather.condition}</span>
    </p>
  );
}

function RestNext({ now }) {
  const life = useLifeData();
  const calendar = useCalendarEvents();
  // Recomputed with the minute, so an event that has started gives way to the one after.
  const minute = Math.floor(now.getTime() / 60_000);
  const next = useMemo(
    () => buildUpcoming([...life.events, ...calendar.events], new Date(minute * 60_000))[0] ?? null,
    [life.events, calendar.events, minute],
  );
  if (!next) return <p className="text-moon/55">Nothing else coming up</p>;
  return (
    <p className="flex min-w-0 items-center gap-2.5">
      <CalendarClock className="h-5 w-5 shrink-0 text-moon/60" strokeWidth={1.5} aria-hidden="true" />
      <span className="max-w-[22rem] truncate text-moon">{next.title}</span>
      <span className="clock-figures shrink-0 text-moon/55">
        {relDay(next.offset, next.key)}
        {next.allDay ? '' : `, ${next.time}`}
      </span>
    </p>
  );
}
