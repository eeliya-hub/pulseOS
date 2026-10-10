import { useMinute } from '../../hooks/useMinute.js';
import { useSettings } from '../../hooks/useSettings.js';
import { useWeather } from '../../hooks/useWeather.js';
import { formatClock, formatLongDate, greetingFor, meridiem } from '../../utils/dateTime.js';
import { Group, Page, Preview, Row, Segmented, ToggleRow } from './controls.jsx';

const AFTER = [
  { id: 20, label: '20 s' },
  { id: 60, label: '1 min' },
  { id: 300, label: '5 min' },
  { id: 0, label: 'Never' },
];

const SHOWS = { greeting: true, date: true, weather: false, next: false };

/** The resting clock, small, saying what you've asked it to. */
export function RestingPreview() {
  const { settings } = useSettings();
  const shows = { ...SHOWS, ...settings.restShows };
  const { weather } = useWeather();
  const now = useMinute();
  return (
    <Preview>
      <div className="sky-stars" />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {shows.greeting ? (
          <p className="t-eyebrow text-[0.6875rem]">
            {greetingFor(now)}, <span className="text-moon/80">{settings.name}</span>
          </p>
        ) : null}
        <p className="display-figures mt-1.5 text-[3.25rem] leading-none tracking-[-0.04em] text-moon">
          {formatClock(now).replace(' : ', ':')}
          {meridiem(now) ? <span className="ml-1 text-[0.85rem] tracking-normal text-moon/55">{meridiem(now)}</span> : null}
        </p>
        {shows.date ? <p className="display-type mt-2 text-[0.8125rem] text-moon/70">{formatLongDate(now)}</p> : null}
        {shows.weather || shows.next ? (
          <p className="mt-2.5 flex items-center gap-3 text-[0.6875rem] text-moon/65">
            {shows.weather && weather ? <span>{weather.temperature}° {weather.condition}</span> : null}
            {shows.weather && shows.next ? <span className="h-2.5 w-px bg-white/25" /> : null}
            {shows.next ? <span>What’s next</span> : null}
          </p>
        ) : null}
      </div>
      {settings.idleAfter === 0 ? (
        <p className="t-micro absolute inset-x-0 bottom-3 text-center">Home never rests</p>
      ) : null}
    </Preview>
  );
}

export function RestingPane() {
  const { settings, update } = useSettings();
  const shows = { ...SHOWS, ...settings.restShows };
  const show = (key) => (on) => update((s) => ({ restShows: { ...SHOWS, ...s.restShows, [key]: on } }));

  return (
    <Page>
      <Group title="When Home rests" note="Only Home rests, and only when nothing’s been touched. Every other view stays where you left it.">
        <Row label="Go to the clock after">
          <Segmented
            label="Go to the clock after"
            options={AFTER}
            value={settings.idleAfter ?? 20}
            onChange={(idleAfter) => update({ idleAfter })}
          />
        </Row>
      </Group>

      <Group title="On the clock" note="The time is always there. Choose what keeps it company.">
        <ToggleRow label="The greeting" hint="Good evening, and your name, above the time." checked={shows.greeting} onChange={show('greeting')} />
        <ToggleRow label="The date" hint="Written out in full, under the time." checked={shows.date} onChange={show('date')} />
        <ToggleRow label="The weather" hint="What it’s doing outside where you are." checked={shows.weather} onChange={show('weather')} />
        <ToggleRow label="What’s next" hint="The next thing on any of your calendars." checked={shows.next} onChange={show('next')} />
      </Group>

      <Group title="With music on">
        <ToggleRow
          label="The immersive player takes over"
          hint="Instead of the clock: the words, the record and the light in the room, with the time in the corner."
          checked={settings.afkImmersive !== false}
          onChange={(afkImmersive) => update({ afkImmersive })}
        />
      </Group>
    </Page>
  );
}
