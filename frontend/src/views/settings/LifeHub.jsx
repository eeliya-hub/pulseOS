import { CloudOff, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SOURCE_META, useCalendarEvents } from '../../hooks/useCalendarEvents.js';
import { calendarColor, dateKey, occursOn, useLifeData } from '../../hooks/useLifeData.js';
import { useMinute } from '../../hooks/useMinute.js';
import { useSettings } from '../../hooks/useSettings.js';
import { since } from '../../utils/formatters.js';
import { Empty, Group, Hint, Page, Preview, Row, Switch } from './controls.jsx';

const LOGO = { google: '/logos/calendar/google.png', apple: '/logos/calendar/apple.png' };

/** The week ahead as your calendars fill it: a column a day, a mark an event. */
export function LifePreview() {
  const life = useLifeData();
  const calendar = useCalendarEvents();
  const now = useMinute();
  const days = useMemo(() => {
    const events = [...life.events, ...calendar.events];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const key = dateKey(d);
      return { key, d, events: events.filter((e) => occursOn(e, key)).slice(0, 4) };
    });
  }, [life.events, calendar.events, now]);
  const total = days.reduce((n, day) => n + day.events.length, 0);

  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">The week ahead</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">
        {total} {total === 1 ? 'thing' : 'things'}
      </p>
      <div className="absolute inset-x-5 bottom-4 grid grid-cols-7 gap-1.5">
        {days.map(({ key, d, events }, i) => (
          <div key={key} className={`rounded-[0.6rem] px-1.5 pb-1.5 pt-1 ${i === 0 ? 'bg-white/[0.08]' : 'bg-white/[0.03]'}`}>
            <p className={`text-center text-[0.5625rem] ${i === 0 ? 'text-accent' : 'text-moon/50'}`}>
              {d.toLocaleDateString('en-GB', { weekday: 'narrow' })}
            </p>
            <p className={`display-figures text-center text-[0.875rem] leading-tight ${i === 0 ? 'text-moon' : 'text-moon/75'}`}>{d.getDate()}</p>
            <div className="mt-1 h-7 space-y-[3px]">
              {events.map((e, j) => (
                <span key={`${e.id}-${j}`} className="block h-[3px] rounded-full" style={{ background: e.color || calendarColor(e.calendar) }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Preview>
  );
}

/**
 * The calendars the Life Hub reads and writes: the two accounts, the feeds you
 * subscribe to, and which of everything they bring in you actually see.
 */
export function LifePane() {
  const calendar = useCalendarEvents();
  const now = useMinute();

  return (
    <Page>
      <Group title="Accounts" note="Pulse reads these and writes to them — an event added in the Life Hub lands in the calendar it belongs to.">
        <GoogleAccount calendar={calendar} />
        <AppleAccount calendar={calendar} />
      </Group>

      <Feeds calendar={calendar} />

      <Group
        title="Calendars you see"
        note={`Last read ${since(calendar.lastFetchedAt, now.getTime())}. Pulse reads them again every couple of minutes, and straight after you change anything.`}
        action={
          <button type="button" onClick={() => calendar.refresh()} className="pill h-8 px-3.5">
            <RefreshCw className={`h-3.5 w-3.5 ${calendar.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Read them now
          </button>
        }
      >
        {calendar.calendars.length === 0 ? (
          <Empty>{calendar.loading ? 'Reading your calendars…' : 'Connect an account or add a feed and its calendars show up here.'}</Empty>
        ) : (
          calendar.calendars.map((c) => {
            const on = !calendar.hiddenCalendars.includes(c.id);
            return (
              <label key={c.id} className="settings-row settings-row--act">
                <span className="settings-swatch transition-opacity" style={{ background: c.color || '#888', opacity: on ? 1 : 0.3 }} />
                <span className="min-w-0 flex-1">
                  <span className={`settings-row-label truncate ${on ? '' : '!text-moon/45'}`}>{c.name}</span>
                  <span className="settings-row-hint flex items-center gap-1.5">
                    {LOGO[c.source] ? (
                      <img src={LOGO[c.source]} alt="" className="h-3 w-3 object-contain [filter:brightness(0)_invert(0.6)]" />
                    ) : null}
                    {SOURCE_META[c.source]?.label ?? c.source}
                  </span>
                </span>
                <Switch checked={on} onChange={() => calendar.toggleCalendar(c.id)} label={`Show ${c.name}`} />
              </label>
            );
          })
        )}
      </Group>
    </Page>
  );
}

/** An account: its mark, its name, where it stands, and what you can do about it. */
function Account({ source, name, status, tone = 'quiet', children }) {
  return (
    <div className="settings-row">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.8rem] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <img src={LOGO[source]} alt="" className="h-6 w-6 object-contain" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="settings-row-label">{name}</span>
        <span
          className={`mt-0.5 flex items-center gap-1.5 text-[0.8125rem] ${
            tone === 'live' ? 'text-rise' : tone === 'warn' ? 'text-amber-200/80' : 'text-dim'
          }`}
        >
          {tone === 'live' ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rise" /> : null}
          {status}
        </span>
      </div>
      {children}
    </div>
  );
}

function GoogleAccount({ calendar }) {
  if (calendar.googleConnected) {
    return (
      <Account source="google" name="Google Calendar" tone="live" status="Connected, reading and writing">
        <button type="button" onClick={calendar.disconnectGoogle} className="pill h-9 px-4 text-moon/75 hover:text-fall">
          Disconnect
        </button>
      </Account>
    );
  }
  if (calendar.googleConfigured) {
    return (
      <Account source="google" name="Google Calendar" status="Not connected">
        <button type="button" onClick={calendar.connectGoogle} className="pill pill-lit h-9 px-4">
          Connect
        </button>
      </Account>
    );
  }
  if (calendar.backendReachable === false) {
    return (
      <Account
        source="google"
        name="Google Calendar"
        tone="warn"
        status={
          <>
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> Can’t reach the backend — trying again
          </>
        }
      />
    );
  }
  return <Account source="google" name="Google Calendar" status="Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env" />;
}

function AppleAccount({ calendar }) {
  const [open, setOpen] = useState(false);
  const [appleId, setAppleId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (calendar.appleConnected) {
    return (
      <Account source="apple" name="iCloud Calendar" tone="live" status="Connected, reading and writing">
        <button type="button" onClick={calendar.disconnectApple} className="pill h-9 px-4 text-moon/75 hover:text-fall">
          Disconnect
        </button>
      </Account>
    );
  }

  const connect = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await calendar.connectApple(appleId.trim(), password.trim());
      setAppleId('');
      setPassword('');
      setOpen(false);
    } catch (err) {
      setError(err?.message || 'That didn’t work. Check the Apple ID and the app-specific password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Account source="apple" name="iCloud Calendar" status="Not connected">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="pill pill-lit h-9 px-4">
            Connect
          </button>
        ) : null}
      </Account>
      {open ? (
        <form onSubmit={connect} className="px-5 pb-5 pl-[4.5rem]">
          <div className="flex gap-2">
            <input
              value={appleId}
              onChange={(e) => setAppleId(e.target.value)}
              placeholder="Apple ID"
              aria-label="Apple ID"
              autoComplete="off"
              className="field"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="App-specific password"
              aria-label="App-specific password"
              autoComplete="off"
              className="field"
            />
            <button type="submit" disabled={busy || !appleId.trim() || !password.trim()} className="pill pill-lit h-[2.625rem] shrink-0 px-4 disabled:opacity-40">
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {error ? <p className="mt-2.5 text-[0.8125rem] text-fall">{error}</p> : null}
          <Hint className="mt-2.5">
            iCloud wants an app-specific password, not your usual one — make one at appleid.apple.com, under Sign-In and Security.
          </Hint>
        </form>
      ) : null}
    </div>
  );
}

function Feeds({ calendar }) {
  const { settings, update } = useSettings();
  const feeds = settings.icalFeeds ?? [];
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const valid = /^(https?|webcal):\/\/\S+/i.test(url.trim());

  const add = (e) => {
    e.preventDefault();
    if (!valid) return;
    const clean = url.trim().replace(/^webcal:\/\//i, 'https://');
    update((s) => ({
      icalFeeds: [...(s.icalFeeds ?? []), { id: Math.random().toString(36).slice(2, 9), name: name.trim() || 'Calendar', url: clean }],
    }));
    setName('');
    setUrl('');
    window.setTimeout(() => calendar.refresh(), 100);
  };

  return (
    <Group
      title="Subscribed feeds"
      note="Any public .ics address — Google’s secret address in iCal format, an Outlook or Apple share link, a timetable. Read-only."
    >
      {feeds.map((f) => (
        <Row
          key={f.id}
          label={f.name}
          hint={f.url.replace(/^https?:\/\//, '')}
          lead={<span className="settings-swatch" style={{ background: SOURCE_META.ical.color }} />}
        >
          <button
            type="button"
            onClick={() => update((s) => ({ icalFeeds: (s.icalFeeds ?? []).filter((x) => x.id !== f.id) }))}
            aria-label={`Remove ${f.name}`}
            className="pill h-8 w-8 px-0 text-moon/60 hover:text-fall"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Row>
      ))}
      <form onSubmit={add} className="settings-row">
        <Plus className="h-4 w-4 shrink-0 text-moon/45" strokeWidth={1.7} aria-hidden="true" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name it"
          aria-label="Feed name"
          className="w-[11rem] shrink-0 bg-transparent text-[0.9688rem] text-moon outline-none placeholder:text-moon/35"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/calendar.ics"
          aria-label="Feed address"
          className="min-w-0 flex-1 bg-transparent text-[0.9688rem] text-moon outline-none placeholder:text-moon/35"
        />
        <button type="submit" disabled={!valid} className="pill h-9 px-4 disabled:opacity-40">
          Add feed
        </button>
      </form>
    </Group>
  );
}
