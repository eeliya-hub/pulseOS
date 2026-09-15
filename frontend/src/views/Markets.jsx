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
import { useCallback, useEffect, useMemo, useState } from 'react';
import GlassCard from '../components/GlassCard.jsx';
import LiveNewsPlayer from '../components/LiveNewsPlayer.jsx';
import SettingsButton from '../components/SettingsButton.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
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
    <div className="theme-card ticker-mask relative mt-3 shrink-0 overflow-hidden rounded-2xl py-2.5">
      <div className="ticker-track gap-8 pl-8">
        {lane.map((asset, index) => {
          const up = asset.change >= 0;
          return (
            <span
              key={`${asset.symbol}-${index}`}
              className="flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <span className="display-type font-medium text-white/90">{asset.symbol}</span>
              <span className="clock-figures text-white/70">
                {formatCurrencyDetailed(asset.price, { currency: 'USD' })}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                  up ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {up ? (
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                )}
                {formatPercent(asset.change)}
              </span>
              <span className="ml-2 h-1 w-1 rounded-full bg-white/20" aria-hidden="true" />
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
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-white/12 to-cyan-100/8 ring-1 ring-white/10">
        <Newspaper className="h-4 w-4 text-white/45" strokeWidth={1.6} aria-hidden="true" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
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
    <div className="glass-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        {notConfigured ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-white/45">
            Add <span className="text-cyan-100/80">GNEWS_API_KEY</span> to <code>backend/.env</code> and restart to load live news.
          </p>
        ) : error ? (
          <p className="px-2 py-6 text-center text-xs text-white/45">Couldn&rsquo;t load news right now.</p>
        ) : loading ? (
          <div className="space-y-3 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-white/6" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-white/45">No stories found.</p>
        ) : (
          articles.map((article) => (
            <a
              key={article.url}
              href={article.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex gap-3 rounded-lg border-b border-white/8 px-1 py-3 transition last:border-0 hover:bg-white/[0.04]"
            >
              <ArticleThumb src={article.image} />
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white/88 group-hover:text-white">
                  {article.title}
                </h3>
                <p className="mt-1.5 flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-white/40">
                  <span className="truncate text-cyan-100/70">{article.source}</span>
                  <span aria-hidden="true">·</span>
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
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-white/45">
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
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-white/45">
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
                  <Trophy className="h-5 w-5 text-white/50" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                  {data.league || data.sport}
                </p>
                <p className="display-type truncate text-lg font-light leading-tight text-white">{data.name}</p>
              </div>
            </div>
            {fixture ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-white/88">{fixture.name}</p>
                {fixture.venue ? <p className="mt-0.5 truncate text-xs text-white/48">{fixture.venue}</p> : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="soft-row flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-white/80">
                    <CalendarDays className="h-3.5 w-3.5 text-white/55" aria-hidden="true" />
                    {fmtDate(fixture.date)}
                  </span>
                  {fmtTime(fixture.time) ? (
                    <span className="soft-row clock-figures flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-white">
                      <Clock className="h-3.5 w-3.5 text-white/55" aria-hidden="true" />
                      {fmtTime(fixture.time)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/45">No upcoming fixture scheduled.</p>
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
              'rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] transition',
              c === conference ? 'bg-cyan-200/15 text-cyan-50 ring-1 ring-cyan-200/25' : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {c}
          </button>
        ))}
      </div>

      <div className={`grid ${cols} gap-1 px-2 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-white/38`}>
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
                    ? 'bg-cyan-200/12 text-white ring-1 ring-cyan-200/25'
                    : inPlayIn
                      ? 'bg-white/[0.03] text-white/60'
                      : 'bg-white/[0.03] text-white/70',
                ].join(' ')}
              >
                <span className={`clock-figures ${r.me ? 'text-cyan-100' : 'text-white/45'}`}>{r.seed ?? '–'}</span>
                <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                  {r.crest ? (
                    <img src={r.crest} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white/6 object-contain" />
                  ) : null}
                  <span className="truncate">{r.team}</span>
                </span>
                <span className="clock-figures text-right text-white/70">{r.won}</span>
                <span className="clock-figures text-right text-white/55">{r.lost}</span>
                {ties ? <span className="clock-figures text-right text-white/45">{r.drawn}</span> : null}
                <span className="clock-figures text-right font-semibold text-white">{pct(r)}</span>
                <span
                  className={[
                    'clock-figures text-right text-[0.6875rem] font-medium',
                    r.streak?.startsWith('W') ? 'text-emerald-200/80' : r.streak?.startsWith('L') ? 'text-rose-200/70' : 'text-white/40',
                  ].join(' ')}
                >
                  {r.streak ?? '–'}
                </span>
              </div>
              {cut || playIn ? (
                <p className="px-2 pt-1 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-white/25">
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
        className={`grid ${STANDINGS_COLS} gap-1 px-2 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-white/38`}
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
                r.me ? 'bg-cyan-200/12 text-white ring-1 ring-cyan-200/25' : 'bg-white/[0.03] text-white/70',
              ].join(' ')}
            >
              <span className="text-white/45">{r.rank}</span>
              <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                {r.crest ? (
                  <img src={r.crest} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white/6 object-contain" />
                ) : null}
                <span className="truncate">{r.team}</span>
              </span>
              <span className="clock-figures text-right text-white/55">{a}</span>
              <span className="clock-figures text-right text-white/55">{b}</span>
              <span className="clock-figures text-right font-semibold text-white">{c}</span>
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
              'rounded-full px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.1em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              tab === key ? 'bg-cyan-200/15 text-cyan-50 ring-1 ring-cyan-200/25' : 'text-white/40 hover:text-white/70',
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
                r.me ? 'bg-cyan-200/12 text-white ring-1 ring-cyan-200/25' : 'bg-white/[0.03] text-white/70',
              ].join(' ')}
            >
              <span className="text-white/45">{r.position}</span>
              <span className="flex min-w-0 items-center gap-3.5">
                <ConstructorLogo src={crest} scale={logo?.scale} className="h-5 w-8" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{isDrivers ? r.driverName : r.constructor}</span>
                  {isDrivers && r.team ? (
                    <span className="block truncate text-[0.625rem] text-white/40">{r.team}</span>
                  ) : null}
                </span>
              </span>
              <span className="clock-figures text-right font-semibold text-white">{r.points}</span>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-white/40">Standings unavailable.</div>
      )}
    </div>
  );
}

function SportsResults({ results }) {
  if (!results?.length) {
    return <div className="flex flex-1 items-center justify-center text-xs text-white/40">No recent results.</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1.5 px-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/38">Recent results</p>
      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-right text-white/75">{r.homeTeam}</span>
            <span className="clock-figures shrink-0 rounded-md bg-white/8 px-2 py-0.5 font-semibold text-white">
              {`${r.homeScore ?? '–'} – ${r.awayScore ?? '–'}`}
            </span>
            <span className="min-w-0 flex-1 truncate text-white/75">{r.awayTeam}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SportsRaces({ races }) {
  if (!races?.length) {
    return <div className="flex flex-1 items-center justify-center text-xs text-white/40">No recent races.</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1.5 px-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-white/38">Recent races</p>
      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {races.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-white/78">{r.name}</span>
            <span className="clock-figures shrink-0 text-[0.625rem] text-white/45">{fmtDate(r.date)}</span>
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

  return (
    <GlassCard delay={100} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        {/* Icon tabs */}
        <div className="flex items-center gap-1">
          {[
            { id: 'news', Icon: Newspaper, label: 'News' },
            { id: 'sports', Icon: Trophy, label: 'Sports' },
            { id: 'stocks', Icon: LineChart, label: 'Stocks' },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-label={label}
              title={label}
              className={[
                'grid h-8 w-8 place-items-center rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                tab === id
                  ? 'bg-cyan-200/15 text-cyan-100 ring-1 ring-cyan-200/25'
                  : 'text-white/40 hover:bg-white/[0.06] hover:text-white/75',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            </button>
          ))}
        </div>

        {/* Centered local hint */}
        <div className="flex min-w-0 flex-1 justify-center">
          {tab === 'news' && scope === 'local' ? (
            <p className="flex min-w-0 items-center gap-1 text-[0.625rem] text-white/45">
              <MapPin className="h-3 w-3 shrink-0 text-cyan-100/60" aria-hidden="true" />
              <span className="truncate">{place ?? settings.location}</span>
            </p>
          ) : null}
        </div>

        {/* Right cluster: category dropdown · settings (news only) */}
        <div className="flex shrink-0 items-center gap-2">
          {tab === 'news' ? (
            <div className="relative shrink-0">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                aria-label="News category"
                className="appearance-none rounded-full bg-white/8 py-1 pl-3 pr-7 text-[0.6875rem] font-medium text-white/85 ring-1 ring-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/40"
              >
                {NEWS_SCOPES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#1a2138] text-white">
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/45"
                aria-hidden="true"
              />
            </div>
          ) : tab === 'sports' && follows.length ? (
            <div className="relative shrink-0">
              <select
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                aria-label="Followed team"
                className="appearance-none rounded-full bg-white/8 py-1 pl-3 pr-7 text-[0.6875rem] font-medium text-white/85 ring-1 ring-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/40"
              >
                {follows.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#1a2138] text-white">
                    {f.team}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/45"
                aria-hidden="true"
              />
            </div>
          ) : null}
          <SettingsButton
            className="mr-0.5"
            title={tab === 'news' ? 'Local news' : tab === 'sports' ? 'Sports & teams' : 'Stocks'}
            fields={tab === 'news' ? ['location'] : tab === 'sports' ? ['sports'] : ['stocks']}
          />
        </div>
      </div>

      {tab === 'news' ? (
        <NewsPanel scope={scope} onPlace={setPlace} />
      ) : tab === 'sports' ? (
        <SportsPanel activeId={activeId} setActiveId={setActiveId} />
      ) : (
        <StocksPanel />
      )}
    </GlassCard>
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
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-white/45">
        Add tickers in Settings to track stocks.
      </div>
    );
  }

  const gainers = rows.filter((r) => (r.changePercent ?? 0) >= 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="soft-row flex shrink-0 items-center justify-between rounded-2xl px-3.5 py-2.5">
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Watchlist</p>
          <p className="display-type text-lg font-light leading-tight text-white">{rows.length} instruments</p>
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
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {r.symbol}
                  {r.name ? <span className="truncate text-[0.6875rem] font-normal text-white/40">{r.name}</span> : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="clock-figures text-sm font-medium text-white">{fmtPrice(r.price)}</p>
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
      <p className="shrink-0 text-center text-[0.625rem] text-white/30">
        {isSample ? 'Sample data · add a Finnhub key for live quotes' : 'Live · Finnhub'}
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
function WeatherCard() {
  const { weather, loading } = useWeather();
  const [hourIndex, setHourIndex] = useState(0);
  const hours = weather?.hourly?.slice(0, 12) ?? [];

  const goBack = useCallback(
    () => setHourIndex((i) => Math.max(0, i - 1)),
    [],
  );
  const goForward = useCallback(
    () => setHourIndex((i) => Math.min(hours.length - 1, i + 1)),
    [hours.length],
  );

  if (loading || !weather) {
    return <div className="min-h-0 flex-1 animate-pulse rounded-2xl bg-white/6" />;
  }

  const Condition = conditionIcon(weather.condition);
  const hour = hours[hourIndex];
  const HourIcon = hourlyIcon[hour?.icon] ?? Cloud;

  return (
    <div className="flex min-h-0 flex-1 items-center gap-5">
      {/* Current conditions */}
      <div className="flex shrink-0 items-center gap-3">
        <Condition className="h-9 w-9 text-cyan-100/85" aria-hidden="true" />
        <span className="display-type text-4xl font-light leading-none text-white text-glow">
          {weather.temperature}&deg;
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-white/85">{weather.location}</span>
          <span className="text-xs text-white/55">{weather.condition}</span>
          <span className="clock-figures mt-0.5 text-[0.6875rem] text-white/45">
            H {weather.high}&deg; · L {weather.low}&deg; · Feels {weather.feelsLike}&deg;
          </span>
        </div>
      </div>

      {/* Hour-by-hour — pill vertically centred; the dots live inside the pill, underlining the content */}
      <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
        <button
          type="button"
          onClick={goBack}
          disabled={hourIndex === 0}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-38 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Previous hour"
        >
          <span className="text-xl font-light leading-none">‹</span>
        </button>

        <div key={hourIndex} className="fade-in flex items-center gap-5 px-2">
          <span className="display-type clock-figures text-2xl font-light leading-none text-white/70">
            {hour.time}
          </span>
          <HourIcon className="h-7 w-7 shrink-0 text-cyan-100/85" strokeWidth={1.5} aria-hidden="true" />
          <span className="display-type clock-figures text-2xl font-light leading-none text-white text-glow">
            {hour.temp}&deg;
          </span>
        </div>

        <button
          type="button"
          onClick={goForward}
          disabled={hourIndex === hours.length - 1}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-38 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label="Next hour"
        >
          <span className="text-xl font-light leading-none">›</span>
        </button>
      </div>
    </div>
  );
}

export default function Markets() {
  const { market, loading } = useMarketData();

  if (loading || !market) {
    return <div className="h-full animate-pulse rounded-3xl bg-white/6" />;
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader lead="Markets" accent="& News" subtitle="A calm read on the day's moves" />
      <Ticker fallback={market.watchlist} />

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-12 gap-4">
        <div className="col-span-8 flex min-h-0 flex-col gap-4">
          <GlassCard
            tone="cyan"
            noPadding
            className="relative aspect-video w-full shrink-0 overflow-hidden"
          >
            <LiveNewsPlayer />
          </GlassCard>

          <GlassCard tone="purple" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WeatherCard />
          </GlassCard>
        </div>

        <NewsSportsCard />
      </div>
    </div>
  );
}
