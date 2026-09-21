import {
  BedDouble,
  Brain,
  Calendar,
  CalendarPlus,
  Check,
  CircleCheck,
  Cloud,
  CloudRain,
  CloudSnow,
  Copy,
  ExternalLink,
  ListChecks,
  ListTodo,
  Luggage,
  MapPin,
  Music,
  Newspaper,
  PencilLine,
  Plane,
  Radio,
  Repeat,
  Sun,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Utensils,
} from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

/**
 * The card voice mode shows while Pulse talks — the events it found, the
 * forecast, the headlines, the trip, what's playing — with whatever it is
 * talking about right now lit up.
 *
 * Rows sit dark and recessive by default: the whole answer stays readable, but
 * only the parts being spoken about come up to full brightness. `spotlight` is a
 * Set of row ids, not one id, because a single sentence routinely covers several
 * ("Thursday and Friday you're at work") and lighting only one of them would be
 * a lie about what was just said.
 *
 * Rows carry their own colour where the data has one — a calendar's colour, an
 * itinerary category's — so the card matches what the rest of the dashboard uses
 * for the same thing.
 */

/**
 * Whether this card lights individual rows as they are spoken about.
 *
 * Only the headlines do. Everywhere else the card is there to be read, and
 * dimming most of it to spotlight one row made the rest harder to take in for no
 * gain — worse when the match was wrong, which on a calendar full of similar
 * entries it often was. Those cards render every row plainly instead.
 */
const HighlightContext = createContext(false);

const TONES = {
  lit: 'bg-white/[0.10] opacity-100 ring-white/20',
  dim: 'bg-white/[0.02] opacity-40 ring-white/[0.04]',
  plain: 'bg-white/[0.035] opacity-100 ring-white/10',
};

/**
 * `tone(isLit)` → how this row should render.
 *
 * Nothing is dimmed until there is something to stand out against: while the
 * voice is between subjects the whole card reads normally, and only once it is
 * on one row do the others drop back. Dimming a card nobody is talking about
 * just made it harder to read for no reason.
 */
function useTone() {
  const { highlighting, anyLit } = useContext(HighlightContext);
  if (!highlighting || !anyLit) return () => 'plain';
  return (lit) => (lit ? 'lit' : 'dim');
}

const WEATHER_ICONS = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow };
const TRAVEL_ICONS = { flight: Plane, stay: BedDouble, food: Utensils, sight: MapPin, plan: Calendar };

/**
 * Scroll the first lit row into view, so a long list follows the voice instead
 * of lighting something off-screen.
 */
function useFollowSpotlight(key) {
  const ref = useRef(null);
  useEffect(() => {
    if (key) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [key]);
  return ref;
}

/** The first lit row — the one worth scrolling to when several are lit. */
function useFirstLit(items, spotlight) {
  return useMemo(() => items.find((i) => spotlight.has(i.id))?.id ?? null, [items, spotlight]);
}

/**
 * Shared row chrome.
 *
 * Lighting is carried by opacity rather than by swapping colours, so the
 * transition stays smooth and a row never changes size as it lights.
 */
function Row({ lit, accent, litRef, children, onClick, title }) {
  const color = accent || '#74f2ff';
  const tone = useTone()(lit);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      ref={litRef}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={[
        // shrink-0: rows keep their own height and the list scrolls instead of
        // squashing every row until the detail line is clipped.
        'group relative flex w-full shrink-0 items-start gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-left',
        'ring-1 transition-all duration-500 ease-out',
        onClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50' : '',
        TONES[tone],
        tone === 'dim' ? 'hover:opacity-75' : '',
      ].join(' ')}
      style={tone === 'lit' ? { boxShadow: `0 0 0 1px ${color}55, 0 6px 28px -10px ${color}aa` } : undefined}
    >
      {/* Colour rail — the row's identity, dark until it is the one being said */}
      <span
        aria-hidden="true"
        className="absolute inset-y-[3px] left-0 w-[3px] rounded-r-full transition-all duration-500"
        style={{ backgroundColor: color, opacity: tone === 'dim' ? 0.3 : 1 }}
      />
      {children}
    </Tag>
  );
}

function PanelFrame({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mb-3 flex shrink-0 items-baseline gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-moon/40" aria-hidden="true" /> : null}
        <h3 className="text-[0.8125rem] font-semibold text-moon/50">{title}</h3>
        {subtitle ? <span className="truncate text-[0.75rem] font-medium text-moon/30">{subtitle}</span> : null}
      </div>
      <div className="glass-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function CalendarPanel({ panel, spotlight }) {
  const firstLit = useFirstLit(panel.items, spotlight);
  const litRef = useFollowSpotlight(firstLit);
  return (
    <PanelFrame title={panel.title} subtitle={panel.subtitle} icon={Calendar}>
      {panel.items.map((item) => (
        <Row
          key={item.id}
          lit={spotlight.has(item.id)}
          accent={item.color}
          litRef={item.id === firstLit ? litRef : null}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.9375rem] font-medium text-moon/90">{item.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-moon/45">
              {item.day ? <span className="font-medium text-moon/60">{item.day}</span> : null}
              {item.time ? <span className="clock-figures">{item.time}</span> : null}
              {item.location ? <span className="truncate">· {item.location}</span> : null}
            </span>
          </span>
          {item.calendar ? (
            <span className="shrink-0 whitespace-nowrap pt-0.5 text-[0.75rem] font-semibold text-moon/28">
              {item.calendar}
            </span>
          ) : null}
        </Row>
      ))}
    </PanelFrame>
  );
}

function WeatherPanel({ panel, spotlight }) {
  const firstLit = useFirstLit(panel.items, spotlight);
  const litRef = useFollowSpotlight(firstLit);
  const now = panel.items.find((i) => i.role === 'now');
  const days = panel.items.filter((i) => i.role === 'day');
  const NowIcon = WEATHER_ICONS[now?.icon] ?? Cloud;
  const tone = useTone();
  const nowTone = tone(now ? spotlight.has(now.id) : false);

  return (
    <PanelFrame title={panel.title} icon={NowIcon}>
      {now ? (
        <div
          ref={now.id === firstLit ? litRef : null}
          className={[
            'relative shrink-0 overflow-hidden rounded-2xl px-4 py-3 ring-1 transition-all duration-500',
            TONES[nowTone],
          ].join(' ')}
          style={nowTone === 'lit' ? { boxShadow: '0 0 0 1px rgba(116,242,255,0.34), 0 6px 30px -12px rgba(116,242,255,0.75)' } : undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="clock-figures text-4xl font-extralight leading-none text-moon">
                {Math.round(now.temperature)}°
              </p>
              <p className="mt-1 truncate text-[0.8125rem] text-moon/65">{now.condition}</p>
            </div>
            <NowIcon className="h-9 w-9 shrink-0 text-accent/70" aria-hidden="true" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-moon/45">
            {now.feelsLike != null ? <span>Feels {Math.round(now.feelsLike)}°</span> : null}
            {now.high != null ? <span>High {Math.round(now.high)}°</span> : null}
            {now.low != null ? <span>Low {Math.round(now.low)}°</span> : null}
            {now.precipitation ? <span>Rain {now.precipitation}</span> : null}
            {now.wind ? <span>{now.wind}</span> : null}
          </div>
        </div>
      ) : null}

      {days.length ? (
        <div className="mt-1 grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6">
          {days.map((day) => {
            const dayTone = tone(spotlight.has(day.id));
            const Icon = WEATHER_ICONS[day.icon] ?? Cloud;
            return (
              <div
                key={day.id}
                ref={day.id === firstLit ? litRef : null}
                className={[
                  'flex flex-col items-center gap-1 rounded-xl px-1 py-2 ring-1 transition-all duration-500',
                  TONES[dayTone],
                ].join(' ')}
                style={dayTone === 'lit' ? { boxShadow: '0 0 0 1px rgba(116,242,255,0.34), 0 5px 22px -10px rgba(116,242,255,0.7)' } : undefined}
              >
                <span className="text-[0.75rem] font-semibold text-moon/45">
                  {day.title}
                </span>
                <Icon className={`h-4 w-4 ${dayTone === 'lit' ? 'text-accent' : 'text-moon/60'}`} aria-hidden="true" />
                <span className="clock-figures text-[0.8125rem] text-moon/80">{Math.round(day.hi)}°</span>
                <span className="clock-figures text-[0.75rem] text-moon/35">{Math.round(day.lo)}°</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </PanelFrame>
  );
}

function NewsPanel({ panel, spotlight }) {
  const firstLit = useFirstLit(panel.items, spotlight);
  const litRef = useFollowSpotlight(firstLit);
  return (
    <PanelFrame title={panel.title} icon={Newspaper}>
      {panel.items.map((item) => (
        <Row
          key={item.id}
          lit={spotlight.has(item.id)}
          accent="#8b9cff"
          litRef={item.id === firstLit ? litRef : null}
          onClick={item.url ? () => window.open(item.url, '_blank', 'noopener,noreferrer') : undefined}
          title={item.url ? 'Open this story' : undefined}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.875rem] font-medium leading-snug text-moon/90">{item.title}</span>
            {item.source ? (
              <span className="mt-1 block truncate text-[0.75rem] text-moon/35">
                {item.source}
              </span>
            ) : null}
          </span>
          {item.url ? (
            <ExternalLink
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-moon/25 transition group-hover:text-moon/70"
              aria-hidden="true"
            />
          ) : null}
        </Row>
      ))}
    </PanelFrame>
  );
}

function TravelPanel({ panel, spotlight }) {
  const firstLit = useFirstLit(panel.items, spotlight);
  const litRef = useFollowSpotlight(firstLit);
  const isList = panel.meta?.mode === 'list';
  return (
    <PanelFrame title={panel.title} subtitle={panel.subtitle} icon={Plane}>
      {panel.meta?.countdown != null ? (
        <p className="-mt-1 mb-1 shrink-0 text-[0.8125rem] font-medium text-accent/70">
          {panel.meta.countdown === 0 ? 'Leaves today' : `In ${panel.meta.countdown} days`}
        </p>
      ) : null}
      {panel.items.map((item) => {
        const lit = spotlight.has(item.id);
        const Icon = TRAVEL_ICONS[item.role === 'plan' ? item.type : item.role] ?? MapPin;
        return (
          <Row key={item.id} lit={lit} accent={item.color} litRef={item.id === firstLit ? litRef : null}>
            <Icon
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors ${lit ? 'text-moon/80' : 'text-moon/35'}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.875rem] font-medium text-moon/90">{item.title}</span>
              <span className="mt-0.5 block truncate text-[0.8125rem] text-moon/45">
                {isList ? [item.destination, item.dates].filter(Boolean).join(' · ') : item.when}
                {item.place ? ` · ${item.place}` : ''}
              </span>
            </span>
            {isList && item.phase ? (
              <span className="shrink-0 whitespace-nowrap pt-0.5 text-[0.75rem] font-semibold text-moon/28">
                {item.phase}
              </span>
            ) : null}
          </Row>
        );
      })}
    </PanelFrame>
  );
}

/** What's on the speakers — one row, with the sleeve when Spotify gave us one. */
function MusicPanel({ panel, spotlight }) {
  const track = panel.items[0];
  const trackTone = useTone()(spotlight.has(track.id));
  return (
    <PanelFrame title={panel.title} icon={Music}>
      <div
        className={[
          'relative flex shrink-0 items-center gap-4 overflow-hidden rounded-2xl p-3 ring-1 transition-all duration-500',
          TONES[trackTone],
        ].join(' ')}
        style={trackTone === 'lit' ? { boxShadow: '0 0 0 1px rgba(52,211,153,0.34), 0 6px 30px -12px rgba(52,211,153,0.7)' } : undefined}
      >
        {track.image ? (
          <img
            src={track.image}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
            <Music className="h-6 w-6 text-moon/40" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-moon/90">{track.title}</span>
          {track.artists ? <span className="mt-0.5 block truncate text-sm text-moon/50">{track.artists}</span> : null}
          {panel.meta?.state ? (
            <span className="mt-1.5 block text-[0.75rem] font-semibold text-emerald-200/60">
              {panel.meta.state}
            </span>
          ) : null}
        </span>
      </div>
    </PanelFrame>
  );
}

/**
 * One sport: the next fixture, the table around them, and recent results. The
 * followed team's own row keeps a marker so the table reads at a glance even
 * before anything is lit.
 */
function SportsPanel({ panel, spotlight }) {
  const firstLit = useFirstLit(panel.items, spotlight);
  const litRef = useFollowSpotlight(firstLit);
  const tone = useTone();
  const fixture = panel.items.find((i) => i.role === 'fixture');
  const table = panel.items.filter((i) => i.role === 'standing');
  const results = panel.items.filter((i) => i.role === 'result');

  return (
    <PanelFrame title={panel.title} subtitle={panel.subtitle} icon={Trophy}>
      {panel.meta?.standing ? (
        <p className="-mt-1 mb-1 shrink-0 text-[0.8125rem] font-medium text-accent/70">{panel.meta.standing}</p>
      ) : null}

      {fixture ? (
        <Row
          lit={spotlight.has(fixture.id)}
          accent="#74f2ff"
          litRef={fixture.id === firstLit ? litRef : null}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.75rem] font-semibold text-moon/35">
              Next up
            </span>
            <span className="mt-0.5 block truncate text-[0.9375rem] font-medium text-moon/90">{fixture.title}</span>
            <span className="mt-0.5 block truncate text-[0.8125rem] text-moon/45">
              {[fixture.when, fixture.venue].filter(Boolean).join(' · ')}
            </span>
          </span>
        </Row>
      ) : null}

      {table.length ? (
        <div className="shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/[0.05]">
          {table.map((row) => {
            const rowTone = tone(spotlight.has(row.id));
            return (
              <div
                key={row.id}
                ref={row.id === firstLit ? litRef : null}
                className={[
                  'flex items-center gap-3 px-3 py-1.5 text-[0.8125rem] transition-all duration-500',
                  rowTone === 'lit' ? 'bg-white/[0.10] opacity-100' : '',
                  rowTone === 'dim' ? (row.me ? 'opacity-70' : 'opacity-45') : '',
                  rowTone === 'plain' ? 'opacity-100' : '',
                ].join(' ')}
                style={rowTone === 'lit' ? { background: 'linear-gradient(90deg, rgba(116,242,255,0.16), rgba(116,242,255,0.05))' } : undefined}
              >
                <span className="clock-figures w-5 shrink-0 text-right text-moon/40">{row.rank}</span>
                <span className={`min-w-0 flex-1 truncate ${row.me ? 'font-semibold text-moon' : 'text-moon/80'}`}>
                  {row.title}
                </span>
                {row.record ? (
                  <span className="hidden shrink-0 text-[0.8125rem] text-moon/35 sm:inline">{row.record}</span>
                ) : null}
                {row.played != null ? (
                  <span className="clock-figures w-6 shrink-0 text-right text-[0.8125rem] text-moon/35">
                    {row.played}
                  </span>
                ) : null}
                <span className="clock-figures w-8 shrink-0 text-right font-medium text-moon/85">{row.points}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {results.map((r) => (
        <Row key={r.id} lit={spotlight.has(r.id)} accent="#8b9cff" litRef={r.id === firstLit ? litRef : null}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] text-moon/85">{r.title}</span>
            {r.when ? <span className="mt-0.5 block truncate text-[0.75rem] text-moon/35">{r.when}</span> : null}
          </span>
        </Row>
      ))}
    </PanelFrame>
  );
}

/** The live channel on screen (or that it has just been turned off). */
function ChannelPanel({ panel, spotlight }) {
  const item = panel.items[0];
  const channelTone = useTone()(spotlight.has(item.id));
  return (
    <PanelFrame title={panel.title} icon={Radio}>
      <div
        className={[
          'relative flex shrink-0 items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 ring-1 transition-all duration-500',
          TONES[channelTone],
        ].join(' ')}
        style={channelTone === 'lit' ? { boxShadow: '0 0 0 1px rgba(244,63,94,0.32), 0 6px 30px -12px rgba(244,63,94,0.65)' } : undefined}
      >
        {item.live ? (
          <span className="glow-dot h-2 w-2 shrink-0 rounded-full bg-rose-400 text-rose-400" aria-hidden="true" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-lg font-light text-moon/90">{item.title}</span>
        {item.live ? (
          <span className="shrink-0 text-[0.75rem] font-semibold text-rose-200/70">
            Live
          </span>
        ) : null}
      </div>
    </PanelFrame>
  );
}

// How each outcome on a receipt reads. The rail and chip carry it, so a failure
// is seen at a glance rather than found by reading every line.
const OUTCOMES = {
  added: { label: 'Added', Icon: Check, tint: 'text-emerald-300', rail: '#34d399' },
  completed: { label: 'Done', Icon: CircleCheck, tint: 'text-emerald-300', rail: '#34d399' },
  updated: { label: 'Updated', Icon: PencilLine, tint: 'text-sky-300', rail: '#7dd3fc' },
  removed: { label: 'Removed', Icon: Trash2, tint: 'text-moon/55', rail: '#94a3b8' },
  noted: { label: 'Noted', Icon: Brain, tint: 'text-violet-300', rail: '#c4b5fd' },
  exists: { label: 'Already there', Icon: Copy, tint: 'text-amber-200', rail: '#fcd34d' },
  unclear: { label: 'Which one?', Icon: TriangleAlert, tint: 'text-amber-200', rail: '#fcd34d' },
  failed: { label: 'Didn’t work', Icon: TriangleAlert, tint: 'text-rose-300', rail: '#fb7185' },
};

const ACTION_ICONS = {
  event: CalendarPlus,
  task: ListTodo,
  habit: Repeat,
  stock: TrendingUp,
  memory: Brain,
  location: MapPin,
  packing: Luggage,
};

/** Everything the request changed — added, moved, removed, and anything that didn't work. */
function ActionsPanel({ panel, spotlight }) {
  const firstLit = useFirstLit(panel.items, spotlight);
  const litRef = useFollowSpotlight(firstLit);
  return (
    <PanelFrame title={panel.title} subtitle={panel.subtitle} icon={ListChecks}>
      {panel.items.map((item) => {
        const outcome = OUTCOMES[item.verb] ?? OUTCOMES.added;
        const KindIcon = ACTION_ICONS[item.kind] ?? Check;
        return (
          <Row
            key={item.id}
            lit={spotlight.has(item.id)}
            accent={outcome.rail}
            litRef={item.id === firstLit ? litRef : null}
          >
            <KindIcon className="mt-0.5 h-4 w-4 shrink-0 text-moon/40" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-medium text-moon/90">{item.title}</span>
              {item.detail ? (
                <span className="clock-figures mt-0.5 block truncate text-[0.8125rem] text-moon/45">{item.detail}</span>
              ) : null}
              {item.note ? (
                <span className={`mt-1 block text-[0.8125rem] leading-snug ${outcome.tint}`}>{item.note}</span>
              ) : null}
            </span>
            <span
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap pt-0.5 text-[0.75rem] font-semibold ${outcome.tint}`}
            >
              <outcome.Icon className="h-3 w-3" aria-hidden="true" />
              {outcome.label}
            </span>
          </Row>
        );
      })}
    </PanelFrame>
  );
}

const PANELS = {
  actions: ActionsPanel,
  calendar: CalendarPanel,
  weather: WeatherPanel,
  news: NewsPanel,
  travel: TravelPanel,
  music: MusicPanel,
  sports: SportsPanel,
  channel: ChannelPanel,
};

// Every card lights its rows as they are spoken about. Kept as one switch — see
// HighlightContext — because whether this reads well depends entirely on how
// accurate the matching is, and that is worth being able to turn off in a line.
const HIGHLIGHTS_ROWS = true;

export default function ContextPanel({ panel, spotlight }) {
  const Panel = panel ? PANELS[panel.kind] : null;
  if (!Panel) return null;
  return (
    <HighlightContext.Provider value={{ highlighting: HIGHLIGHTS_ROWS, anyLit: spotlight.size > 0 }}>
      <Panel panel={panel} spotlight={spotlight} />
    </HighlightContext.Provider>
  );
}
