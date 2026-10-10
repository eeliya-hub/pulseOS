import {
  CalendarDays,
  CloudSun,
  Globe,
  Loader2,
  Mail,
  Music2,
  Newspaper,
  Plane,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useBackendStatus } from '../../hooks/useBackendStatus.js';
import { Group, Hint, Page, Preview, Row } from './controls.jsx';

// The backend names providers by lowercase id; these are the written names.
const PROVIDER = { gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude' };
const provider = (id) => PROVIDER[id] ?? id;

/**
 * The backend's report, as rows: what Pulse can reach, through what, and
 * whether it needs anything from you.
 */
function rowsOf(integrations) {
  const i = integrations ?? {};
  const search = i.search ?? {};
  const cal = i.calendar ?? {};
  const sports = i.sports ?? {};
  const ai = i.ai ?? {};
  const travel = i.travel ?? {};
  const mail = i.mail ?? {};
  const liveSports = ['football', 'nba', 'nfl', 'f1'].filter((k) => sports[k]);
  const sportName = (s) => (s === 'f1' ? 'F1' : s === 'football' ? 'football' : s.toUpperCase());
  return [
    {
      key: 'ai',
      icon: Sparkles,
      name: 'Assistant',
      live: Boolean(ai.gemini || ai.openai || ai.claude),
      note: ai.default ? `Answering with ${provider(ai.default)}` : 'Needs an AI key in backend/.env',
    },
    {
      key: 'search',
      icon: Globe,
      name: 'Web search',
      live: search.enabled !== false,
      note: search.brave ? 'Searching with Brave' : search.tavily ? 'Searching with Tavily' : 'Keyless — DuckDuckGo, Bing News and Wikipedia',
    },
    {
      key: 'calendar',
      icon: CalendarDays,
      name: 'Calendars',
      live: Boolean(cal.google || cal.ical),
      note: cal.google ? 'Google both ways, plus iCloud and .ics feeds' : 'iCloud and .ics feeds; Google needs a client ID',
    },
    {
      key: 'mail',
      icon: Mail,
      name: 'Email',
      live: Boolean(mail.google || mail.microsoft),
      note: mailNote(mail),
    },
    { key: 'weather', icon: CloudSun, name: 'Weather', live: Boolean(i.weather), note: i.weather ? 'OpenWeather, live' : 'A sample day until there’s an OpenWeather key' },
    { key: 'news', icon: Newspaper, name: 'News', live: Boolean(i.news), note: i.news ? 'Headlines and your local news' : 'Needs a GNews key' },
    {
      key: 'sports',
      icon: Trophy,
      name: 'Sport',
      live: liveSports.length > 0,
      note: liveSports.length ? `Live for ${liveSports.map(sportName).join(', ')}` : 'Needs a sports key',
    },
    { key: 'stocks', icon: TrendingUp, name: 'Markets', live: Boolean(i.stocks), note: i.stocks ? 'Finnhub, live prices' : 'Needs a Finnhub key' },
    { key: 'music', icon: Music2, name: 'Music', live: Boolean(i.music), note: i.music ? 'Spotify — connect it under Music' : 'Needs Spotify keys' },
    {
      key: 'travel',
      icon: Plane,
      name: 'Travel',
      live: travel.enabled !== false,
      note: `Flights, currency and maps, with ${travel.places === 'google' ? 'Google Places' : 'OpenStreetMap places'}`,
    },
  ];
}

/**
 * What email is set up with. Named per provider, because "live" on its own
 * doesn't say whether the account you wanted is one Pulse can reach.
 */
function mailNote(mail) {
  const ready = [mail.google && 'Gmail', mail.microsoft && 'Outlook'].filter(Boolean);
  if (!ready.length) return 'Needs Gmail or Microsoft credentials in backend/.env';
  return `${ready.join(' and ')} — connect an account under Mail`;
}

/** Everything Pulse can reach, lit or not, at a glance. */
export function ConnectionsPreview() {
  const status = useBackendStatus();
  const rows = rowsOf(status.integrations);
  const live = rows.filter((r) => r.live).length;
  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">{status.failed ? 'Backend' : 'Answering'}</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">
        {status.failed ? 'Unreachable' : status.loading && !status.integrations ? '…' : `${live} of ${rows.length}`}
      </p>
      <div className="absolute bottom-4 right-5 grid grid-cols-5 gap-2">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <span
              key={r.key}
              className={`relative grid h-9 w-9 place-items-center rounded-[0.7rem] ${r.live && !status.failed ? 'bg-white/[0.08] text-accent' : 'bg-white/[0.03] text-moon/25'}`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.6} />
              <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${r.live && !status.failed ? 'bg-rise' : 'bg-white/15'}`} />
            </span>
          );
        })}
      </div>
    </Preview>
  );
}

export function ConnectionsPane() {
  const status = useBackendStatus();
  const rows = rowsOf(status.integrations);
  const id = status.integrations?.ai?.default;
  const day = id ? status.usage?.[id]?.periods?.day : null;
  const pct = day?.requests?.limit ? Math.min(100, Math.round((day.requests.used / day.requests.limit) * 100)) : 0;

  return (
    <Page>
      <Group
        title="What Pulse can reach"
        note="Every service is optional: whatever isn’t set up shows sample data or simply stays out of the way."
        action={
          <button type="button" onClick={status.refresh} className="pill h-8 px-3.5">
            <RefreshCw className={`h-3.5 w-3.5 ${status.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Check again
          </button>
        }
      >
        {status.loading && !status.integrations ? (
          <p className="flex items-center gap-2 px-5 py-5 text-[0.9375rem] text-dim">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Asking the backend what it can reach…
          </p>
        ) : status.failed ? (
          <Row label="The backend isn’t answering" hint="Start it with npm run dev in the project folder, then check again." />
        ) : (
          rows.map((row) => {
            const Icon = row.icon;
            return (
              <Row
                key={row.key}
                label={row.name}
                hint={row.note}
                lead={
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[0.7rem] ${row.live ? 'bg-white/[0.07] text-accent' : 'bg-white/[0.03] text-moon/30'}`}>
                    <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                }
              >
                <span className={`pill h-7 px-3 text-[0.75rem] ${row.live ? '!bg-rise/[0.12] !text-rise !shadow-none' : 'text-moon/50'}`}>
                  {row.live ? 'Live' : 'Not set up'}
                </span>
              </Row>
            );
          })
        )}
      </Group>

      <Group title="Today’s AI allowance">
        {day ? (
          <div className="px-5 py-4">
            <p className="settings-row-label">
              <span className="display-figures mr-2 text-[2.25rem] leading-none text-moon">{day.requests.used}</span>
              {day.requests.limit ? `of ${day.requests.limit} requests` : 'requests'}
            </p>
            <div className="settings-meter mt-4">
              <span className={`bar-grow ${pct > 85 ? 'is-high' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="settings-row-hint mt-3">
              {day.tokens.used.toLocaleString()} tokens
              {day.tokens.limit ? ` of ${day.tokens.limit.toLocaleString()}` : ''}, through {provider(id)}. It starts again at midnight.
            </p>
          </div>
        ) : (
          <Row label={status.failed ? 'Unknown while the backend is away' : 'Nothing counted yet today'} />
        )}
      </Group>
      <Hint className="mt-6">
        Keys live in backend/.env on this machine and never reach this page. Restart the backend after changing them, then check again here.
      </Hint>
    </Page>
  );
}
