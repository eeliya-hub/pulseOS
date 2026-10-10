import { useEffect, useState } from 'react';
import PulseMark from '../../components/PulseMark.jsx';
import { useMinute } from '../../hooks/useMinute.js';
import { useSettings } from '../../hooks/useSettings.js';
import { useWeather } from '../../hooks/useWeather.js';
import { formatClock, greetingFor, isBirthday, meridiem } from '../../utils/dateTime.js';
import { Field, Group, Page, Preview, Row, Segmented, Select } from './controls.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Home's hero, small: the greeting you'll be met with and the weather where you are. */
export function YouPreview() {
  const { settings } = useSettings();
  const { weather } = useWeather();
  const now = useMinute();
  return (
    <Preview>
      <div className="absolute inset-x-6 top-5 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <PulseMark className="h-[0.6rem] w-[1.5rem] text-accent" />
          <span className="display-type text-[0.8125rem] leading-none text-moon">Pulse</span>
        </span>
        <span className="display-figures text-[1rem] leading-none text-moon">
          {formatClock(now).replace(' : ', ':')}
          {meridiem(now) ? <span className="ml-0.5 text-[0.6rem] text-moon/60">{meridiem(now)}</span> : null}
        </span>
      </div>
      <div className="absolute inset-x-6 bottom-5">
        <p className="display-type text-[1.875rem] leading-[1.05] text-moon">
          {greetingFor(now)},
          <br />
          <span className="name-mark">{settings.name?.trim() || 'you'}</span>
        </p>
        {weather ? (
          <p className="t-meta mt-2 truncate">
            {weather.temperature}°, {String(weather.condition).toLowerCase()} in {weather.location}
          </p>
        ) : null}
      </div>
    </Preview>
  );
}

export function YouPane() {
  const { settings, update } = useSettings();
  const { weather } = useWeather();

  return (
    <Page>
      <Group title="About you" note="Pulse greets you by name, and reads the weather and local news for where you are.">
        <Row label="Name" hint="On Home, on the clock, and how the assistant addresses you.">
          <Field value={settings.name} onCommit={(name) => update({ name: name.trim() })} placeholder="Your name" aria-label="Your name" />
        </Row>
        <Row
          label="Where you are"
          hint={
            weather?.location
              ? `A town or a county. Home is reading ${weather.temperature}°, ${String(weather.condition).toLowerCase()} in ${weather.location}.`
              : 'A town or a county.'
          }
        >
          <Field
            value={settings.location}
            delay={800}
            onCommit={(location) => update({ location: location.trim() })}
            placeholder="e.g. Ashford"
            aria-label="Where you are"
          />
        </Row>
        <Row
          label="Birthday"
          hint={
            isBirthday(new Date(), settings.birthday)
              ? 'It’s today — happy birthday.'
              : 'Pulse wishes you a happy birthday on the day, and the assistant remembers it.'
          }
        >
          <Birthday value={settings.birthday} onChange={(birthday) => update({ birthday })} />
        </Row>
      </Group>

      <Group title="Units">
        <Row label="Temperature" hint="On Home, the resting clock, in Travel, and when the assistant tells you.">
          <Segmented
            label="Temperature"
            value={settings.units === 'imperial' ? 'imperial' : 'metric'}
            onChange={(units) => update({ units })}
            options={[
              { id: 'metric', label: 'Celsius' },
              { id: 'imperial', label: 'Fahrenheit' },
            ]}
          />
        </Row>
        <Row label="Clock" hint="In the top bar, on the resting screen and in the immersive player.">
          <Segmented
            label="Clock"
            value={settings.clock24 !== false}
            onChange={(clock24) => update({ clock24 })}
            options={[
              { id: true, label: '24-hour' },
              { id: false, label: '12-hour' },
            ]}
          />
        </Row>
      </Group>
    </Page>
  );
}

/** A day and a month — no year, because it's the day that matters. */
function Birthday({ value, onChange }) {
  const [month, day] = /^\d{2}-\d{2}$/.test(value || '') ? value.split('-').map(Number) : [0, 0];
  const [draft, setDraft] = useState({ month, day });
  useEffect(() => setDraft({ month, day }), [month, day]);

  const set = (patch) => {
    const next = { ...draft, ...patch };
    if (next.month && next.day > DAYS_IN[next.month - 1]) next.day = DAYS_IN[next.month - 1];
    setDraft(next);
    if (next.month && next.day) onChange(`${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`);
    else if (!next.month && !next.day) onChange('');
  };

  const days = DAYS_IN[(draft.month || 1) - 1];
  return (
    <>
      <Select
        className="w-[7.5rem]"
        label="Birthday day"
        value={String(draft.day || '')}
        onChange={(d) => set({ day: Number(d) })}
        options={[{ id: '', label: 'Day' }, ...Array.from({ length: days }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }))]}
      />
      <Select
        className="w-[11rem]"
        label="Birthday month"
        value={String(draft.month || '')}
        onChange={(m) => set({ month: Number(m) })}
        options={[{ id: '', label: 'Month' }, ...MONTHS.map((name, i) => ({ id: String(i + 1), label: name }))]}
      />
      {value ? (
        <button type="button" onClick={() => set({ month: 0, day: 0 })} className="pill h-9 px-3.5 text-moon/70">
          Clear
        </button>
      ) : null}
    </>
  );
}
