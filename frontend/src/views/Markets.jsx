import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  Clock,
  Cloud,
  CloudRain,
  ExternalLink,
  LineChart,
  MapPin,
  Newspaper,
  Sun,
  Trophy,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import LiveNewsPlayer from '../components/LiveNewsPlayer.jsx';
import SettingsButton from '../components/SettingsButton.jsx';
import { ColumnHead, Ground, SkyZone } from '../components/Stage.jsx';
import { localConstructorLogo } from '../data/f1Logos.js';
import { useMarketData } from '../hooks/useMarketData.js';
import { useNews } from '../hooks/useNews.js';
import { useSettings } from '../hooks/useSettings.js';
import { useWeather } from '../hooks/useWeather.js';
import { api } from '../services/api/backendClient.js';
import { peek, put } from '../services/warmCache.js';
import { formatCurrencyDetailed, formatPercent } from '../utils/formatters.js';

function Ticker({ fallback }) {
  // Warmed on the launch screen, so the tape opens on live prices rather than
  // showing the static fallback for a beat and then swapping under the eye.
  const [assets, setAssets] = useState(() => peek('stocks:ticker')?.ticker?.length ? peek('stocks:ticker').ticker : fallback);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.stocks
        .ticker()
        .then((d) => {
          if (!alive) return;
          put('stocks:ticker', d);
          if (d.ticker?.length) setAssets(d.ticker);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 60_000); // refresh live prices each minute
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const lane = [...assets, ...assets];
  return (
    // The tape: no box, just a band ruled above and below that the prices run
    // along. Symbols in weight, prices in tabular figures, the move as a small
    // pill in the colour of its direction.
    <div className="ticker-mask relative z-10 mx-[calc(50%-50vw)] shrink-0 overflow-hidden py-3">
      <div className="ticker-track gap-10 pl-10">
        {lane.map((asset, index) => {
          const up = asset.change >= 0;
          return (
            <span
              key={`${asset.symbol}-${index}`}
              className="flex items-center gap-2.5 whitespace-nowrap text-[0.9375rem]"
            >
              <span className="font-semibold tracking-tight text-moon">{asset.symbol}</span>
              <span className="clock-figures text-moon/65">
                {formatCurrencyDetailed(asset.price, { currency: 'USD' })}
              </span>
              <span
                className={`clock-figures inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${
                  up ? 'bg-rise/[0.12] text-rise' : 'bg-fall/[0.12] text-fall'
                }`}
              >
                {up ? (
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                )}
                {formatPercent(asset.change)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Scopes: worldwide topics + "Local" (national news for the chosen country).
const NEWS_SCOPES = [
  { id: 'top', label: 'Top' },
  { id: 'local', label: 'Local' },
  { id: 'world', label: 'World' },
  { id: 'business', label: 'Business' },
  { id: 'technology', label: 'Tech' },
  { id: 'sports', label: 'Sport' },
];

function relTime(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// A consistent thumbnail — the article image, or a delicate placeholder when
// there's no image (or it fails to load).
function ArticleThumb({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[0.8rem] bg-white/[0.06]">
        <Newspaper className="h-4 w-4 text-moon/45" strokeWidth={1.6} aria-hidden="true" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-[0.8rem] object-cover"
    />
  );
}

function NewsPanel({ scope, onPlace }) {
  const { settings } = useSettings();
  const { articles, place, loading, error, notConfigured } = useNews({ scope, location: settings.location });
  useEffect(() => {
    onPlace?.(place);
  }, [place, onPlace]);

  return (
    <div className="glass-scroll cascade min-h-0 flex-1 overflow-y-auto pr-1">
        {notConfigured ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-moon/45">
            Add <span className="text-accent/80">GNEWS_API_KEY</span> to <code>backend/.env</code> and restart to load live news.
          </p>
        ) : error ? (
          <p className="px-2 py-6 text-center text-xs text-moon/45">Couldn&rsquo;t load news right now.</p>
        ) : loading ? (
          <div className="space-y-3 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-white/6" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-moon/45">No stories found.</p>
        ) : (
          articles.map((article) => (
            <a
              key={article.url}
              href={article.url}
              target="_blank"
              rel="noreferrer noopener"
              className="ground-row group flex gap-3.5 px-2 py-3"
            >
              <ArticleThumb src={article.image} />
              <div className="min-w-0 flex-1">
                <h3 className="t-title line-clamp-2 group-hover:text-moon">
                  {article.title}
                </h3>
                <p className="t-micro mt-1.5 flex items-center gap-2">
                  <span className="truncate text-accent/80">{article.source}</span>
                  <span className="shrink-0">{relTime(article.publishedAt)}</span>
                  <ExternalLink
                    className="ml-auto h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-70"
                    aria-hidden="true"
                  />
                </p>
              </div>
            </a>
          ))
        )}
    </div>
  );
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}
const fmtTime = (t) => (t ? t.slice(0, 5) : '');

const STANDINGS_COLS = 'grid-cols-[1.4rem_1fr_1.9rem_2.1rem_2.3rem]';

function SportsPanel({ activeId, setActiveId }) {
  const { settings } = useSettings();
  const follows = useMemo(() => settings.follows ?? [], [settings.follows]);
  const active = follows.find((f) => f.id === activeId) ?? follows[0] ?? null;
  // Every followed team is fetched on the launch screen, so switching between
  // them paints immediately and the refresh below happens under the content.
  const [data, setData] = useState(() => (active ? (peek(`sports:${active.id}`) ?? null) : null));
  const [loading, setLoading] = useState(false);

  const activeTeam = active?.team;
  const activeSport = active?.sport;
  const activeFollowId = active?.id;

  useEffect(() => {
    if (follows.length && !follows.some((f) => f.id === activeId)) setActiveId(follows[0].id);
  }, [follows, activeId, setActiveId]);

  useEffect(() => {
    if (!activeTeam) {
      setData(null);
      return undefined;
    }
    let alive = true;
    const warmed = peek(`sports:${activeFollowId}`);
    if (warmed) setData(warmed);
    setLoading(!warmed);
    api.sports
      .team(activeTeam, activeSport, active?.leagueId, active?.leagueLabel)
      .then((d) => {
        if (!alive) return;
        put(`sports:${activeFollowId}`, d);
        setData(d);
      })
      .catch(() => alive && !warmed && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeTeam, activeSport, activeFollowId, active?.leagueId, active?.leagueLabel]);

  if (!follows.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-moon/45">
        Add teams in Settings to see fixtures and standings.
      </div>
    );
  }

  const fixture = data?.fixture;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {loading ? (
        <div className="flex-1 animate-pulse rounded-2xl bg-white/6" />
      ) : !data?.found ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-moon/45">
          Couldn&rsquo;t find &ldquo;{active?.team}&rdquo;. Try the club&rsquo;s full name.
        </div>
      ) : (
        <>
          <div className="soft-row shrink-0 rounded-2xl p-3.5">
            <div className="flex items-center gap-3">
              {(data.kind === 'f1' ? '/logos/f1/trimmed/f1.png' : data.badge) ? (
                <img
                  src={data.kind === 'f1' ? '/logos/f1/trimmed/f1.png' : data.badge}
                  alt=""
                  className={[
                    'h-11 w-11 shrink-0 rounded-xl object-contain p-1.5',
                    data.kind === 'f1' ? '' : 'bg-white/6',
                  ].join(' ')}
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/6">
                  <Trophy className="h-5 w-5 text-moon/50" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[0.75rem] font-semibold text-accent/70">
                  {data.league || data.sport}
                </p>
                <p className="display-type truncate text-lg font-light leading-tight text-moon">{data.name}</p>
              </div>
            </div>
            {fixture ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-moon/88">{fixture.name}</p>
                {fixture.venue ? <p className="mt-0.5 truncate text-xs text-moon/48">{fixture.venue}</p> : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="soft-row flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-moon/80">
                    <CalendarDays className="h-3.5 w-3.5 text-moon/55" aria-hidden="true" />
                    {fmtDate(fixture.date)}
                  </span>
                  {fmtTime(fixture.time) ? (
                    <span className="soft-row clock-figures flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-moon">
                      <Clock className="h-3.5 w-3.5 text-moon/55" aria-hidden="true" />
                      {fmtTime(fixture.time)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-moon/45">No upcoming fixture scheduled.</p>
            )}
          </div>

          {data.kind === 'f1' ? (
            <SportsF1Standings drivers={data.driverStandings} constructors={data.constructorStandings} />
          ) : data.conferences?.length ? (
            <BallStandings
              rows={data.standings}
              conferences={data.conferences}
              playoffs={data.playoffs}
              ties={data.ties}
            />
          ) : data.standings.length ? (
            <SportsStandings rows={data.standings} variant={data.statSport === 'football' ? 'football' : 'wl'} />
          ) : data.kind === 'race' ? (
            <SportsRaces races={data.results} />
          ) : (
            <SportsResults results={data.results} />
          )}
        </>
      )}
    </div>
  );
}

function winPct(r) {
  if (!r.played) return '–';
  return (r.won / r.played).toFixed(3).replace(/^0(?=\.)/, '');
}

const BALL_COLS = 'grid-cols-[1.5rem_1fr_1.7rem_1.7rem_2.4rem_2.1rem]';
const BALL_COLS_TIES = 'grid-cols-[1.5rem_1fr_1.5rem_1.5rem_1.5rem_2.4rem_2.1rem]';

/**
 * NBA and NFL standings, by conference.
 *
 * Neither sport is followed as a single 1–30 ladder — the conference race is
 * what decides the playoffs, so the table is split East/West or AFC/NFC and
 * seeded within each. The line under the last playoff place is the thing the
 * table exists to show, so it is drawn.
 */
function BallStandings({ rows, conferences, playoffs, ties }) {
  // Open on the conference of the team being followed.
  const mine = rows.find((r) => r.me)?.conference;
  const [conference, setConference] = useState(mine ?? conferences[0]);
  useEffect(() => {
    if (mine) setConference(mine);
  }, [mine]);

  const table = rows
    .filter((r) => r.conference === conference)
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
  const cols = ties ? BALL_COLS_TIES : BALL_COLS;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 gap-1">
        {conferences.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setConference(c)}
            className={[
              'rounded-full px-2.5 py-1 text-[0.75rem] font-semibold transition',
              c === conference ? 'bg-accent/15 text-accent ring-1 ring-accent/25' : 'text-moon/40 hover:text-moon/70',
            ].join(' ')}
          >
            {c}
          </button>
        ))}
      </div>

      <div className={`grid ${cols} gap-1 px-2 pb-1.5 text-[0.75rem] font-semibold text-moon/38`}>
        <span>#</span>
        <span>Team</span>
        <span className="text-right">W</span>
        <span className="text-right">L</span>
        {ties ? <span className="text-right">T</span> : null}
        <span className="text-right">Pct</span>
        <span className="text-right">Strk</span>
      </div>

      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {table.map((r) => {
          // The playoff cut, and for the NBA the play-in band above it.
          const cut = playoffs?.line && r.seed === playoffs.line;
          const playIn = playoffs?.playIn && r.seed === playoffs.playIn;
          const inPlayIn = playoffs?.playIn && r.seed > playoffs.line && r.seed <= playoffs.playIn;
          return (
            <div key={r.team} className={cut || playIn ? 'border-b border-dashed border-white/12 pb-1' : ''}>
              <div
                className={[
                  `grid ${cols} items-center gap-1 rounded-xl px-2 py-2 text-xs`,
                  r.me
                    ? 'bg-accent/12 text-moon ring-1 ring-accent/25'
                    : inPlayIn
                      ? 'bg-white/[0.03] text-moon/60'
                      : 'bg-white/[0.03] text-moon/70',
                ].join(' ')}
              >
                <span className={`clock-figures ${r.me ? 'text-accent' : 'text-moon/45'}`}>{r.seed ?? '–'}</span>
                <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                  {r.crest ? (
                    <img src={r.crest} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white/6 object-contain" />
                  ) : null}
                  <span className="truncate">{r.team}</span>
                </span>
                <span className="clock-figures text-right text-moon/70">{r.won}</span>
                <span className="clock-figures text-right text-moon/55">{r.lost}</span>
                {ties ? <span className="clock-figures text-right text-moon/45">{r.drawn}</span> : null}
                <span className="clock-figures text-right font-semibold text-moon">{pct(r)}</span>
                <span
                  className={[
                    'clock-figures text-right text-[0.8125rem] font-medium',
                    r.streak?.startsWith('W') ? 'text-emerald-200/80' : r.streak?.startsWith('L') ? 'text-rose-200/70' : 'text-moon/40',
                  ].join(' ')}
                >
                  {r.streak ?? '–'}
                </span>
              </div>
              {cut || playIn ? (
                <p className="px-2 pt-1 text-[0.75rem] font-semibold text-moon/25">
                  {playIn ? 'Play-in line' : 'Playoff line'}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Win percentage, shown the way these sports show it: .625 rather than 62.5%. */
function pct(r) {
  const value = r.winPct ?? (r.played ? (r.won + (r.drawn ?? 0) * 0.5) / r.played : null);
  return value == null ? '–' : value.toFixed(3).replace(/^0(?=\.)/, '');
}

function SportsStandings({ rows, variant = 'football' }) {
  const football = variant === 'football';
  const headers = football ? ['P', 'GD', 'Pts'] : ['W', 'L', 'Pct'];
  const cells = (r) =>
    football ? [r.played, r.goalDiff ?? '–', r.points] : [r.won ?? '–', r.lost ?? '–', winPct(r)];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`grid ${STANDINGS_COLS} gap-1 px-2 pb-1.5 text-[0.75rem] font-semibold text-moon/38`}
      >
        <span>#</span>
        <span>Team</span>
        {headers.map((h) => (
          <span key={h} className="text-right">
            {h}
          </span>
        ))}
      </div>
      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {rows.map((r) => {
          const [a, b, c] = cells(r);
          return (
            <div
              key={`${r.rank}-${r.team}`}
              className={[
                `grid ${STANDINGS_COLS} items-center gap-1 rounded-xl px-2 py-2 text-xs`,
                r.me ? 'bg-accent/12 text-moon ring-1 ring-accent/25' : 'bg-white/[0.03] text-moon/70',
              ].join(' ')}
            >
              <span className="text-moon/45">{r.rank}</span>
              <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                {r.crest ? (
                  <img src={r.crest} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white/6 object-contain" />
                ) : null}
                <span className="truncate">{r.team}</span>
              </span>
              <span className="clock-figures text-right text-moon/55">{a}</span>
              <span className="clock-figures text-right text-moon/55">{b}</span>
              <span className="clock-figures text-right font-semibold text-moon">{c}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// F1 constructor logo in its original colours (no background plate). Logos are
// pre-trimmed so object-contain sizes them consistently; `scale` nudges the very
// wide marks up so they don't read smaller than the compact emblems.
function ConstructorLogo({ src, scale = 1, className = '' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-visible ${className}`}>
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
          style={{ transform: `scale(${scale})` }}
        />
      ) : null}
    </span>
  );
}

function SportsF1Standings({ drivers = [], constructors = [] }) {
  const [tab, setTab] = useState('drivers');
  const isDrivers = tab === 'drivers';
  const rows = isDrivers ? drivers : constructors;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex gap-1.5 px-1">
        {[
          ['drivers', 'Drivers'],
          ['constructors', 'Constructors'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={[
              'rounded-full px-2.5 py-1 text-[0.75rem] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              tab === key ? 'bg-accent/15 text-accent ring-1 ring-accent/25' : 'text-moon/40 hover:text-moon/70',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {rows.map((r) => {
            const logo = localConstructorLogo(isDrivers ? r.team : r.constructor);
            const crest = logo?.src ?? r.crest;
            return (
            <div
              key={r.position + (isDrivers ? r.driverName : r.constructor)}
              className={[
                'grid grid-cols-[1.4rem_1fr_2.6rem] items-center gap-1 rounded-xl px-2 py-2 text-xs',
                r.me ? 'bg-accent/12 text-moon ring-1 ring-accent/25' : 'bg-white/[0.03] text-moon/70',
              ].join(' ')}
            >
              <span className="text-moon/45">{r.position}</span>
              <span className="flex min-w-0 items-center gap-3.5">
                <ConstructorLogo src={crest} scale={logo?.scale} className="h-5 w-8" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{isDrivers ? r.driverName : r.constructor}</span>
                  {isDrivers && r.team ? (
                    <span className="block truncate text-[0.75rem] text-moon/40">{r.team}</span>
                  ) : null}
                </span>
              </span>
              <span className="clock-figures text-right font-semibold text-moon">{r.points}</span>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-moon/40">Standings unavailable.</div>
      )}
    </div>
  );
}

function SportsResults({ results }) {
  if (!results?.length) {
    return <div className="flex flex-1 items-center justify-center text-xs text-moon/40">No recent results.</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1.5 px-1 text-[0.75rem] font-semibold text-moon/38">Recent results</p>
      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-right text-moon/75">{r.homeTeam}</span>
            <span className="clock-figures shrink-0 rounded-md bg-white/8 px-2 py-0.5 font-semibold text-moon">
              {`${r.homeScore ?? '–'} – ${r.awayScore ?? '–'}`}
            </span>
            <span className="min-w-0 flex-1 truncate text-moon/75">{r.awayTeam}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SportsRaces({ races }) {
  if (!races?.length) {
    return <div className="flex flex-1 items-center justify-center text-xs text-moon/40">No recent races.</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1.5 px-1 text-[0.75rem] font-semibold text-moon/38">Recent races</p>
      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {races.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-moon/78">{r.name}</span>
            <span className="clock-figures shrink-0 text-[0.75rem] text-moon/45">{fmtDate(r.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsSportsCard() {
  const [tab, setTab] = useState('news');
  const [scope, setScope] = useState(() => localStorage.getItem('pulse.news.scope') || 'top');
  const [place, setPlace] = useState(null);
  const { settings } = useSettings();
  const follows = useMemo(() => settings.follows ?? [], [settings.follows]);
  const [activeId, setActiveId] = useState(follows[0]?.id ?? '');
  useEffect(() => localStorage.setItem('pulse.news.scope', scope), [scope]);
  useEffect(() => {
    if (follows.length && !follows.some((f) => f.id === activeId)) setActiveId(follows[0].id);
  }, [follows, activeId, setActiveId]);

  const selectClass =
    'h-8 appearance-none rounded-full bg-white/[0.07] pl-3.5 pr-8 text-[0.8125rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

  return (
    <div className="ground-rule flex min-h-0 min-w-0 flex-col pl-8 pt-7">
      <div className="col-head justify-start gap-2">
        <div className="pill-group" role="tablist">
          {[
            { id: 'news', Icon: Newspaper, label: 'News' },
            { id: 'sports', Icon: Trophy, label: 'Sport' },
            { id: 'stocks', Icon: LineChart, label: 'Markets' },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="pill h-8 px-3.5 text-[0.8125rem]"
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {tab === 'news' ? (
            <div className="relative shrink-0">
              <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="News category" className={selectClass}>
                {NEWS_SCOPES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-ink text-moon">
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moon/50" aria-hidden="true" />
            </div>
          ) : tab === 'sports' && follows.length ? (
            <div className="relative shrink-0">
              <select value={activeId} onChange={(e) => setActiveId(e.target.value)} aria-label="Followed team" className={selectClass}>
                {follows.map((f) => (
                  <option key={f.id} value={f.id} className="bg-ink text-moon">
                    {f.team}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moon/50" aria-hidden="true" />
            </div>
          ) : null}
          <SettingsButton
            className="!h-8 !w-8"
            title={tab === 'news' ? 'Local news' : tab === 'sports' ? 'Sports & teams' : 'Stocks'}
            fields={tab === 'news' ? ['location'] : tab === 'sports' ? ['sports'] : ['stocks']}
          />
        </div>
      </div>

      {tab === 'news' && scope === 'local' ? (
        <p className="mt-3 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-dim">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-accent/70" aria-hidden="true" />
          <span className="truncate">{place ?? settings.location}</span>
        </p>
      ) : null}

      <div className="mt-3 flex min-h-0 flex-1 flex-col pb-4">
        {tab === 'news' ? (
          <NewsPanel scope={scope} onPlace={setPlace} />
        ) : tab === 'sports' ? (
          <SportsPanel activeId={activeId} setActiveId={setActiveId} />
        ) : (
          <StocksPanel />
        )}
      </div>
    </div>
  );
}

// Compact stocks breakdown. Sample data for now (via useMarketData); swap in a
// real quotes API later without touching this component.
const SAMPLE_STOCKS = [
  { symbol: 'AAPL', name: 'Apple', price: 214.82, changePercent: 1.8 },
  { symbol: 'NVDA', name: 'NVIDIA', price: 141.2, changePercent: 3.1 },
  { symbol: 'TSLA', name: 'Tesla', price: 196.44, changePercent: -1.2 },
  { symbol: 'MSFT', name: 'Microsoft', price: 441.6, changePercent: 0.6 },
  { symbol: 'AMZN', name: 'Amazon', price: 201.3, changePercent: 0.9 },
  { symbol: 'GOOGL', name: 'Alphabet', price: 178.4, changePercent: -0.4 },
];

const fmtPrice = (p) => (p == null ? '–' : p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.toFixed(2));

function StocksPanel() {
  const { settings } = useSettings();
  const symbols = useMemo(() => settings.stocks ?? [], [settings.stocks]);
  const warmKey = `stocks:${symbols.join(',')}`;
  const warmedRows = peek(warmKey)?.quotes;
  const [rows, setRows] = useState(() => (warmedRows?.length ? warmedRows : null));
  const [loading, setLoading] = useState(() => !warmedRows?.length);
  const [isSample, setIsSample] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(!peek(warmKey)?.quotes?.length);
    if (!symbols.length) {
      setRows([]);
      setLoading(false);
      return undefined;
    }
    api.stocks
      .quotes(symbols)
      .then((d) => {
        if (!alive) return;
        put(warmKey, d);
        const qs = d.quotes ?? [];
        if (qs.length) {
          setRows(qs);
          setIsSample(false);
        } else {
          setRows(SAMPLE_STOCKS);
          setIsSample(true);
        }
      })
      .catch(() => {
        if (!alive) return;
        setRows(SAMPLE_STOCKS);
        setIsSample(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbols, warmKey]);

  if (loading) {
    return <div className="min-h-0 flex-1 animate-pulse rounded-2xl bg-white/6" />;
  }
  if (!rows?.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-moon/45">
        Add tickers in Settings to track stocks.
      </div>
    );
  }

  const gainers = rows.filter((r) => (r.changePercent ?? 0) >= 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="soft-row flex shrink-0 items-center justify-between rounded-2xl px-3.5 py-2.5">
        <div>
          <p className="text-[0.75rem] font-semibold text-accent/70">Watchlist</p>
          <p className="display-type text-lg font-light leading-tight text-moon">{rows.length} instruments</p>
        </div>
        <div className="text-right">
          <p className="clock-figures text-sm font-medium text-emerald-300/90">{gainers} up</p>
          <p className="clock-figures text-xs text-rose-300/80">{rows.length - gainers} down</p>
        </div>
      </div>

      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {rows.map((r) => {
          const up = (r.changePercent ?? 0) >= 0;
          return (
            <div key={r.symbol} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-moon">
                  {r.symbol}
                  {r.name ? <span className="truncate text-[0.8125rem] font-normal text-moon/40">{r.name}</span> : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="clock-figures text-sm font-medium text-moon">{fmtPrice(r.price)}</p>
                <p
                  className={[
                    'clock-figures flex items-center justify-end gap-0.5 text-xs font-medium',
                    up ? 'text-emerald-300/90' : 'text-rose-300/85',
                  ].join(' ')}
                >
                  {up ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
                  {Math.abs(r.changePercent ?? 0).toFixed(2)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="shrink-0 text-center text-[0.75rem] text-moon/30">
        {isSample ? 'Sample data. Add a Finnhub key for live quotes' : 'Live from Finnhub'}
      </p>
    </div>
  );
}

// Map the mock's hourly icon keys and condition text to lucide glyphs.
const hourlyIcon = { rain: CloudRain, cloud: Cloud, sun: Sun };
const conditionIcon = (condition = '') => {
  const c = condition.toLowerCase();
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return CloudRain;
  if (c.includes('sun') || c.includes('clear')) return Sun;
  return Cloud;
};

// Hour-by-hour carousel: shows one hour at a time with < > to navigate 12 hours ahead.
// Simple dot progress indicator below.
/** The weather now, set in the sky beside the title. */
function WeatherNow() {
  const { weather } = useWeather();
  if (!weather) return null;
  const Condition = conditionIcon(weather.condition);
  return (
    <div className="flex shrink-0 items-center gap-4 pb-1 text-right">
      <div className="leading-tight">
        <p className="t-body">
          {weather.condition} in {weather.location}
        </p>
        <p className="t-meta clock-figures mt-1">
          High {weather.high}&deg;&ensp;Low {weather.low}&deg;&ensp;Feels {weather.feelsLike}&deg;
        </p>
      </div>
      <p className="display-figures text-[3.5rem] leading-none text-moon">{weather.temperature}&deg;</p>
      <Condition className="h-8 w-8 shrink-0 text-moon/80" strokeWidth={1.3} aria-hidden="true" />
    </div>
  );
}

export default function Markets() {
  const { market, loading } = useMarketData();

  if (loading || !market) {
    return <div className="h-full" />;
  }

  return (
    <div className="markets-view flex h-full flex-col">
      {/* ── Sky: the desk's name and the weather outside ──────────────────── */}
      <SkyZone tape className="flex items-end justify-between gap-10">
        <h1 className="t-hero truncate">Markets & News</h1>
        <WeatherNow />
      </SkyZone>

      {/* The tape runs along the horizon, like the crawl under a broadcast. */}
      <Ticker fallback={market.watchlist} />

      {/* ── Ground: the live channel and the desk ─────────────────────────── */}
      <Ground className="markets-ground">
        <div className="flex min-h-0 min-w-0 flex-col pb-3 pr-8 pt-7">
          <ColumnHead label="Live channel" />
          <div className="lift relative mt-2 aspect-video max-h-full w-full overflow-hidden rounded-[1.5rem] bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,0.95)] ring-1 ring-white/10">
            <LiveNewsPlayer />
          </div>
        </div>

        <NewsSportsCard />
      </Ground>
    </div>
  );
}
