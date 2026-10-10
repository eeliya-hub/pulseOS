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
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import LiveNewsPlayer from '../components/LiveNewsPlayer.jsx';
import SettingsButton from '../components/SettingsButton.jsx';
import { NEWS_SCOPE_KEY, NEWS_SCOPES } from '../data/newsScopes.js';
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
  const { settings } = useSettings();
  // Whatever the tape has been set to, as a stable string so a re-render with
  // the same symbols doesn't restart the request loop.
  const symbols = useMemo(() => settings.ticker ?? [], [settings.ticker]);
  const warmKey = `stocks:ticker:${symbols.join(',')}`;

  // Warmed on the launch screen, so the tape opens on live prices rather than
  // showing the static fallback for a beat and then swapping under the eye.
  const [assets, setAssets] = useState(() => peek(warmKey)?.ticker?.length ? peek(warmKey).ticker : fallback);

  useEffect(() => {
    let alive = true;
    const warmed = peek(warmKey)?.ticker;
    if (warmed?.length) setAssets(warmed);
    const load = () =>
      api.stocks
        .ticker(symbols)
        .then((d) => {
          if (!alive) return;
          put(warmKey, d);
          if (d.ticker?.length) setAssets(d.ticker);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 60_000); // refresh live prices each minute
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [symbols, warmKey]);

  /*
   * The tape has to be wider than the window at every moment of its loop, and
   * two copies of eight symbols are not: one copy measured 937px against a
   * 1512px window, so the last 575px of every cycle showed empty rail and the
   * tape looked like it was cut off before it snapped back.
   *
   * So the number of copies is measured: enough to cover the window, plus the
   * one that is mid-wrap. The loop then scrolls exactly one of them — not a
   * hopeful -50% — expressed as a fraction of the track rather than a pixel
   * width, because every copy is the same markup and so is exactly 1/n of it by
   * construction. No sub-pixel to drift the seam a little further each cycle.
   * Only the duration comes off the ruler, and that is a speed, where half a
   * pixel does not matter.
   */
  const maskRef = useRef(null);
  const copyRef = useRef(null);
  const [unit, setUnit] = useState(0);
  const [copies, setCopies] = useState(3);

  useEffect(() => {
    const copyEl = copyRef.current;
    const maskEl = maskRef.current;
    if (!copyEl || !maskEl) return undefined;

    const measure = () => {
      const width = copyEl.getBoundingClientRect().width;
      const window_ = maskEl.getBoundingClientRect().width;
      if (!width || !window_) return;
      setUnit(width);
      setCopies(Math.ceil(window_ / width) + 1);
    };
    measure();
    // Watched rather than measured once, because a price going from 4 digits to
    // 5, the display font landing after first paint and the window resizing all
    // change the unit's width — and a unit even a fraction out from the real
    // one drifts the seam a little further every cycle until it is visible.
    const watch = new ResizeObserver(measure);
    watch.observe(copyEl);
    watch.observe(maskEl);
    return () => watch.disconnect();
  }, [assets]);

  const copy = (ref) => (
    <span ref={ref} className="ticker-copy">
      {assets.map((asset) => {
        const up = asset.change >= 0;
        return (
          <span
            key={asset.symbol}
            /* Spacing rides on the item, never as a flex gap on the track: a gap
               adds one extra space at the seam, which is exactly the kind of few
               rem that puts the wrap mid-symbol. */
            className="flex items-center gap-2.5 whitespace-nowrap pr-10 text-[0.9375rem]"
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
    </span>
  );

  return (
    // The tape: no box, just a band ruled above and below that the prices run
    // along. Symbols in weight, prices in tabular figures, the move as a small
    // pill in the colour of its direction.
    <div ref={maskRef} className="ticker-mask relative z-10 mx-[calc(50%-50vw)] shrink-0 overflow-hidden py-3">
      <div
        className="ticker-track"
        style={{
          '--ticker-shift': `${(100 / copies).toFixed(6)}%`,
          ...(unit ? { '--ticker-duration': `${(unit / (TAPE_SPEED[settings.tickerSpeed] ?? TAPE_SPEED.steady)).toFixed(1)}s` } : null),
        }}
      >
        {copy(copyRef)}
        {Array.from({ length: copies - 1 }, (_, i) => (
          <Fragment key={`copy-${i}`}>{copy(null)}</Fragment>
        ))}
      </div>
    </div>
  );
}

/**
 * How fast the tape reads, in pixels a second, as Settings has it. Steady is
 * slow enough to read at a glance; the others are for those who'd rather it
 * drifted, or kept up.
 */
const TAPE_SPEED = { slow: 9, steady: 14.6, quick: 24 };

// Scopes: worldwide topics + "Local" (national news for the chosen country).

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

  if (loading) return <div className="min-h-0 flex-1 animate-pulse rounded-2xl bg-white/6" />;
  if (!data?.found) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-moon/45">
        Couldn&rsquo;t find &ldquo;{active?.team}&rdquo;. Try the club&rsquo;s full name.
      </div>
    );
  }
  return <SportsStage data={data} />;
}

/**
 * The Sport panel: one stage, lit by the place the next match is played.
 *
 * What was here before was a card with a small picture on it, sitting on top of
 * a league table, and it read as two unrelated widgets stacked in a column.
 * This is one thing. The ground fills the whole panel, the fixture stands in it
 * at full size, and the lists live underneath on their own plate — so the
 * section feels like somewhere rather than like a page of results.
 *
 * It has to hold four sports that agree on almost nothing: football has two
 * clubs and a table, the American sports have two franchises and a conference,
 * a grand prix has neither. So the stage asks only for what all of them have —
 * something happening, somewhere, on a date — and the three views underneath
 * (what's coming, what happened, where everyone stands) each fall back to
 * whatever that sport actually provides.
 */
function SportsStage({ data }) {
  const [view, setView] = useState('next');
  // The club's own colour where it reads against this sky, and the
  // competition's where it doesn't — Leeds play in white, which against a
  // night sky is not a colour, it is the absence of one.
  const accent = wearable(data.accent) ?? wearable(data.competitionColour) ?? null;
  const fixture = data.fixture ?? null;
  const fixtures = data.fixtures?.length ? data.fixtures : fixture ? [fixture] : [];
  const results = data.results ?? [];
  const isF1 = data.kind === 'f1';

  // The ground. Football and F1 name it outright; the American sports don't, so
  // the home team is asked for instead, which is how Google finds an arena.
  const homeName = fixture?.home?.name ?? data.name;
  const venue = fixture?.venue ?? null;
  const shot = useVenuePhoto(venue ?? (homeName ? `${homeName} stadium` : null));

  const hasTable = isF1
    ? Boolean(data.driverStandings?.length || data.constructorStandings?.length)
    : Boolean(data.standings?.length);
  const views = [
    { id: 'next', label: isF1 ? 'Calendar' : 'Fixtures', on: fixtures.length > 0 },
    { id: 'form', label: 'Results', on: results.length > 0 || Boolean(data.lastRace) },
    { id: 'table', label: 'Table', on: hasTable },
  ].filter((v) => v.on);
  // Never leave the panel showing a view that this sport has nothing for.
  const active = views.some((v) => v.id === view) ? view : views[0]?.id;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white/[0.03]">
      <Marquee data={data} fixture={fixture} results={results} shot={shot} accent={accent} circuit={data.circuitMap} />

      {/* Below the fixture, the picture stops being scenery and starts being in
          the way, so the lists stand on their own ground: a near-solid plate
          with a hairline where it meets the photograph. */}
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col border-t bg-[#0b1024]/88 backdrop-blur-md"
        style={{ borderColor: accent ? `${accent}55` : 'rgba(255,255,255,0.1)' }}
      >
        {views.length > 1 ? (
          <div className="flex shrink-0 gap-1 px-3 pb-2 pt-2.5">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={[
                  'rounded-full px-3 py-1 text-[0.75rem] font-semibold transition focus:outline-none',
                  v.id === active ? '' : 'text-moon/55 hover:bg-white/10 hover:text-moon/85',
                ].join(' ')}
                style={
                  v.id === active
                    ? { backgroundColor: accent ?? 'rgba(255,255,255,0.9)', color: readableOn(accent) }
                    : undefined
                }
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-1">
        {active === 'next' ? (
          <FixtureList fixtures={fixtures} isF1={isF1} league={data.league} />
        ) : active === 'form' ? (
          isF1 ? (
            <RaceResults race={data.lastRace} past={data.pastRaces} />
          ) : (
            <ResultList results={results} />
          )
        ) : active === 'table' ? (
          isF1 ? (
            <SportsF1Standings drivers={data.driverStandings} constructors={data.constructorStandings} />
          ) : data.conferences?.length ? (
            <BallStandings
              rows={data.standings}
              conferences={data.conferences}
              playoffs={data.playoffs}
              ties={data.ties}
            />
          ) : (
            <SportsStandings rows={data.standings} variant={data.statSport === 'football' ? 'football' : 'wl'} />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-moon/45">
            Nothing scheduled for {data.name} right now.
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

/**
 * A photograph of a place, held between visits.
 *
 * A stadium is the definition of something that does not change while you are
 * looking at it, so the first answer is kept and no second request is made.
 */
function useVenuePhoto(query) {
  const [shot, setShot] = useState(null);
  useEffect(() => {
    if (!query) {
      setShot(null);
      return undefined;
    }
    const key = `venue:${query}`;
    const warmed = peek(key);
    if (warmed) {
      setShot(warmed);
      return undefined;
    }
    setShot(null);
    let alive = true;
    api.travel
      .photos({ q: query, limit: 1 })
      .then((d) => {
        const first = (d.results ?? [])[0];
        if (!alive || !first) return;
        const url = first.url ?? (first.ref ? api.travel.photoUrl(first.ref, 900) : null);
        if (!url) return;
        put(key, url);
        setShot(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [query]);
  return shot;
}

/** The top of the stage: what is next, where, when, and how it has been going. */
function Marquee({ data, fixture, results, shot, accent, circuit }) {
  const quiet = shot ? 'text-moon/75' : 'text-moon/45';
  const quieter = shot ? 'text-moon/60' : 'text-moon/35';
  const home = fixture?.home;
  const away = fixture?.away;
  const [left, right] = fixture?.homeFirst === false ? [away, home] : [home, away];
  const isMatch = Boolean(home?.name || away?.name);
  const away_ = countdown(fixture?.date);

  return (
    // The photograph belongs to this block alone, not the whole panel. Spanning
    // the panel meant its best part sat behind the lists' plate and all that
    // showed up here was sky.
    <div className={`relative z-10 shrink-0 overflow-hidden px-3.5 pb-3 pt-3.5 ${shot ? 'on-photo' : ''}`}>
      {shot ? (
        <>
          <img src={shot} alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.6]" />
          {/* The scrim carries the team's colour rather than a neutral dark, so
              the ground is lit in the colours of whoever plays on it. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: accent
                ? `linear-gradient(to bottom, ${accent}66, #0b1024cc 56%, #0b1024e6)`
                : 'linear-gradient(to bottom, #0b102494, #0b10249e 56%, #0b1024c7)',
            }}
            aria-hidden="true"
          />
        </>
      ) : null}

      <div className="relative flex items-baseline gap-2">
        {/* The wash behind this is already the team's colour, so the label
            cannot also be it — red on red is not an accent, it is a hole. The
            colour identity lives in the wash, the rules and the tab. */}
        <p className="t-label text-moon/90">{data.league || data.sport}</p>
        {fixture?.matchday ? (
          <p className={`t-label ${quieter}`}>MD {fixture.matchday}</p>
        ) : null}
        {away_ ? <p className={`ml-auto shrink-0 t-label ${quieter}`}>{away_}</p> : null}
      </div>

      {!fixture ? (
        // Why there is no fixture is not something we know: a season can be
        // over, between rounds, or the feed can simply be having a quiet hour.
        <p className={`relative mt-3 text-sm ${quiet}`}>No fixture scheduled.</p>
      ) : (
        <>
          {circuit ? (
            /* The track itself, standing where the two teams would. Wikipedia's
               layout diagrams are dark line art on transparent, which on a night
               sky is nothing at all — flattened to a white silhouette they read
               as a drawing, and the same treatment works for every circuit
               whether its original is monochrome or colour-coded by sector. */
            <div className="relative mt-2 flex items-center gap-4">
              <img
                src={circuit}
                alt={`${fixture.venue ?? 'Circuit'} layout`}
                className="h-[5.5rem] w-auto max-w-[45%] shrink-0 object-contain opacity-90 [filter:brightness(0)_invert(1)_drop-shadow(0_1px_3px_rgba(0,0,0,0.6))]"
              />
              <p className="display-type min-w-0 flex-1 text-[1.25rem] font-light leading-tight text-moon">
                {fixture.name}
              </p>
            </div>
          ) : isMatch ? (
            <div className="relative mt-3 flex items-center justify-between gap-2">
              <Side side={left} quiet={quiet} />
              <span className="mb-4 flex flex-1 items-center gap-1.5" aria-hidden="true">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/30" />
                <span className="shrink-0 text-[0.8125rem] italic text-accent/80">v</span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/30" />
              </span>
              <Side side={right} align="right" quiet={quiet} />
            </div>
          ) : (
            <p className="display-type relative mt-2 line-clamp-2 text-[1.375rem] font-light leading-tight text-moon">
              {fixture.name}
            </p>
          )}

          <div
            className="relative mt-3 flex items-center gap-2 border-t pt-2 text-[0.75rem]"
            style={{ borderColor: accent ? `${accent}77` : 'rgba(255,255,255,0.12)' }}
          >
            {/* The competition is named at the top of the card already */}
            <span className={`min-w-0 flex-1 truncate ${quiet}`}>{fixture.venue ?? ''}</span>
            <span className={`flex shrink-0 items-center gap-1.5 ${shot ? 'text-moon/90' : 'text-moon/70'}`}>
              <CalendarDays className={`h-3.5 w-3.5 ${quieter}`} aria-hidden="true" />
              {fmtDate(fixture.date)}
            </span>
            {fmtTime(fixture.time) ? (
              <span className="clock-figures flex shrink-0 items-center gap-1.5 font-medium text-moon">
                <Clock className={`h-3.5 w-3.5 ${quieter}`} aria-hidden="true" />
                {fmtTime(fixture.time)}
              </span>
            ) : null}
          </div>
        </>
      )}

      <Form results={results} quiet={quieter} />
    </div>
  );
}

/** How the last few went, oldest on the left, so the shape of a run is visible. */
function Form({ results, quiet }) {
  const run = (results ?? []).filter((r) => r.outcome).slice(0, 5).reverse();
  if (!run.length) return null;
  const tone = { W: 'bg-rise/85 text-[#06210f]', D: 'bg-white/35 text-[#0b1024]', L: 'bg-fall/80 text-[#2a0710]' };
  return (
    <div className="relative mt-2.5 flex items-center gap-1.5">
      <span className={`t-label ${quiet}`}>Form</span>
      {run.map((r) => (
        <span
          key={r.id}
          title={`${r.home ? 'v' : 'at'} ${r.opponent} · ${r.homeScore}–${r.awayScore}`}
          className={`grid h-4 w-4 place-items-center rounded-[0.3rem] text-[0.625rem] font-bold ${tone[r.outcome]}`}
        >
          {r.outcome}
        </span>
      ))}
    </div>
  );
}

/** One team in the fixture: its crest, its three letters, and its name under. */
function Side({ side, align = 'left', quiet = 'text-moon/40' }) {
  const right = align === 'right';
  if (!side) return <div className="min-w-0" />;
  return (
    <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      {side.crest ? <img src={side.crest} alt="" className="h-8 w-8 shrink-0 object-contain" /> : null}
      <div className="min-w-0">
        <p className="clock-figures text-2xl font-light leading-none text-moon">{side.tla ?? side.short}</p>
        <p className={`mt-1 max-w-[6.5rem] truncate text-[0.75rem] ${quiet}`}>{side.short}</p>
      </div>
    </div>
  );
}

/** Everything still to come, not just the next one. */
function FixtureList({ fixtures, isF1, league }) {
  if (!fixtures.length) {
    return <Empty>Nothing on the calendar.</Empty>;
  }
  return (
    <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
      {fixtures.map((f, i) => (
        <div
          key={f.id ?? `${f.date}-${f.name ?? i}`}
          className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-2.5 py-2"
        >
          <div className="w-[3.2rem] shrink-0">
            <p className="clock-figures text-[0.8125rem] font-medium leading-none text-moon/90">{dayMonth(f.date)}</p>
            <p className="clock-figures mt-1 text-[0.6875rem] leading-none text-moon/40">{fmtTime(f.time) || '—'}</p>
          </div>
          <div className="min-w-0 flex-1">
            {f.home?.name || f.away?.name ? (
              <p className="flex min-w-0 items-center gap-1.5 truncate text-[0.8125rem] text-moon/90">
                {f.home?.crest ? <img src={f.home.crest} alt="" className="h-4 w-4 shrink-0 object-contain" /> : null}
                <span className="font-medium">{f.home?.short}</span>
                <span className="text-moon/35">{f.homeFirst === false ? 'at' : 'v'}</span>
                {f.away?.crest ? <img src={f.away.crest} alt="" className="h-4 w-4 shrink-0 object-contain" /> : null}
                <span className="truncate font-medium">{f.away?.short}</span>
              </p>
            ) : (
              <p className="truncate text-[0.8125rem] text-moon/90">{f.name}</p>
            )}
            {/* The competition, but only when it says something: a Champions
                League night among league games is worth marking, "NFL" under a
                card headed NFL is not. */}
            <p className="mt-0.5 truncate text-[0.6875rem] text-moon/40">
              {isF1 ? f.venue : f.competition && f.competition !== league ? f.competition : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** What happened, told from the followed team's side of it. */
function ResultList({ results }) {
  if (!results.length) return <Empty>No results yet this season.</Empty>;
  const tone = { W: 'bg-rise/85 text-[#06210f]', D: 'bg-white/35 text-[#0b1024]', L: 'bg-fall/80 text-[#2a0710]' };
  return (
    <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
      {results.map((r) => (
        <div key={r.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-2.5 py-2">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[0.75rem] font-bold ${
              r.outcome ? tone[r.outcome] : 'bg-white/10 text-moon/50'
            }`}
          >
            {r.outcome ?? '–'}
          </span>
          {r.opponentCrest ? (
            <img src={r.opponentCrest} alt="" className="h-5 w-5 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] text-moon/90">
              <span className="text-moon/40">{r.home ? 'v' : 'at'}</span> {r.opponent}
            </p>
            <p className="mt-0.5 truncate text-[0.6875rem] text-moon/40">
              {dayMonth(r.date)}
              {r.competition ? ` · ${r.competition}` : ''}
            </p>
          </div>
          <span className="clock-figures shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[0.8125rem] font-semibold text-moon">
            {r.homeScore ?? '–'}–{r.awayScore ?? '–'}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * How the racing has gone: the last grand prix in full, and every one before it.
 *
 * The tab used to show three names. A podium is not a result — a season is
 * decided as much by who finished fourteenth — and it carried no team, no
 * livery and no way back to the races already run.
 */
function RaceResults({ race, past }) {
  const [round, setRound] = useState('last');
  if (!race?.results?.length && !past?.length) return <Empty>No race has been run yet.</Empty>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex shrink-0 items-center gap-2 px-1">
        <p className="min-w-0 flex-1 truncate t-label text-moon/45">
          {round === 'last' ? race?.name : `${past?.length ?? 0} races this season`}
        </p>
        {past?.length ? (
          <button
            type="button"
            onClick={() => setRound(round === 'last' ? 'season' : 'last')}
            className="shrink-0 rounded-full bg-white/8 px-2.5 py-0.5 text-[0.75rem] font-semibold text-moon/70 transition hover:bg-white/14 hover:text-moon focus:outline-none"
          >
            {round === 'last' ? 'Season' : 'Last race'}
          </button>
        ) : null}
      </div>

      <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {round === 'last'
          ? (race?.results ?? []).map((r) => (
              <div key={r.position} className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-2.5 py-2">
                <span
                  className={`clock-figures w-5 shrink-0 text-right text-[0.9375rem] font-light ${PLACE[r.position - 1] ?? 'text-moon/45'}`}
                >
                  {r.position}
                </span>
                {r.badge ? <ConstructorLogo src={r.badge} className="h-4 w-7 shrink-0" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] text-moon/90">{r.driver}</p>
                  <p className="mt-0.5 truncate text-[0.6875rem] text-moon/40">{r.team}</p>
                </div>
                {r.points ? (
                  <span className="clock-figures shrink-0 text-[0.6875rem] text-moon/40">{r.points} pts</span>
                ) : null}
                <span className="clock-figures w-[4.5rem] shrink-0 truncate text-right text-[0.75rem] text-moon/60">
                  {r.time}
                </span>
              </div>
            ))
          : (past ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-2.5 py-2">
                <span className="clock-figures w-[3.2rem] shrink-0 text-[0.75rem] text-moon/45">{dayMonth(r.date)}</span>
                {r.winnerBadge ? <ConstructorLogo src={r.winnerBadge} className="h-4 w-7 shrink-0" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] text-moon/90">{r.name}</p>
                  <p className="mt-0.5 truncate text-[0.6875rem] text-moon/40">
                    {r.winner ? `${r.winner} \u00b7 ${r.winnerTeam}` : r.circuit}
                  </p>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

/** Gold, silver, bronze — and everyone else in the same grey. */
const PLACE = ['text-[#e8c76a]', 'text-moon/75', 'text-[#c98b5e]'];

const Empty = ({ children }) => (
  <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-moon/45">{children}</div>
);

/**
 * A colour only if it can be worn against this sky.
 *
 * Club colours are real and some of them are white, black or so close to either
 * that they vanish or glare: Leeds play in white, Brooklyn in black. Those carry
 * no identity here, so the competition's colour is used instead.
 */
function wearable(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 709 luma, which tracks how bright a colour actually looks.
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.82 || luma < 0.08 ? null : `#${m[1].toLowerCase()}`;
}

/** Ink that can be read on a given background. */
function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#0b1024';
  const n = parseInt(m[1], 16);
  const luma = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luma > 0.55 ? '#0b1024' : '#f6f7fb';
}

/** "Sat 10 Oct" trimmed to "10 Oct", for a list where the column is the date. */
function dayMonth(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** How long until it, in the words a person would use. */
function countdown(dateStr) {
  if (!dateStr) return null;
  const then = Date.parse(`${dateStr}T00:00:00`);
  if (Number.isNaN(then)) return null;
  const today = new Date();
  const days = Math.round((then - Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00`)) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 14) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
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
                    <img src={r.crest} alt="" className="h-4 w-4 shrink-0 object-contain" />
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
                  <img src={r.crest} alt="" className="h-4 w-4 shrink-0 object-contain" />
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

function NewsSportsCard() {
  const [tab, setTab] = useState('news');
  const [scope, setScope] = useState(() => localStorage.getItem(NEWS_SCOPE_KEY) || 'top');
  const [place, setPlace] = useState(null);
  const { settings } = useSettings();
  const follows = useMemo(() => settings.follows ?? [], [settings.follows]);
  const [activeId, setActiveId] = useState(follows[0]?.id ?? '');
  useEffect(() => localStorage.setItem(NEWS_SCOPE_KEY, scope), [scope]);
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
            fields={tab === 'news' ? ['location'] : tab === 'sports' ? ['sports'] : ['stocks', 'ticker']}
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
        {rows.map((r) => (
          <StockRow key={r.symbol} quote={r} />
        ))}
      </div>
      <p className="shrink-0 text-center text-[0.75rem] text-moon/30">
        {isSample ? 'Sample data. Add a Finnhub key for live quotes' : 'Live from Finnhub'}
      </p>
    </div>
  );
}

/**
 * One instrument on the watchlist, told as a day rather than a number.
 *
 * The row used to be a price and a percentage, which says what happened but not
 * where it leaves you: -2.7% reads the same whether the stock is sitting on its
 * low or has climbed most of the way back. Finnhub already sends the day's open,
 * high, low and previous close with every quote, and none of it was being shown.
 *
 * So the row carries a rail from the day's low to its high, with the previous
 * close ticked on it and the price lit where it actually stands. No sparkline:
 * there is no intraday series in this payload, and drawing a curve through four
 * points would be inventing a shape the data does not have.
 */
function StockRow({ quote: r }) {
  const up = (r.changePercent ?? 0) >= 0;
  // The rail spans everything it has to draw, not just the day's high and low.
  // A stock that gapped closed outside today's range — Apple closed at 338.40
  // and never traded above 337.08 — and a tick for it drawn against a low-to-high
  // rail lands off the end of its own track.
  const marks = [r.low, r.high, r.price, r.previousClose].filter((n) => Number.isFinite(n));
  const lo = Math.min(...marks);
  const hi = Math.max(...marks);
  const span = hi - lo;
  // A stock can be halted, or quoted before it has traded, and then the whole
  // day is one price and the rail has nothing to say.
  const at = (value) => (span > 0 && Number.isFinite(value) ? ((value - lo) / span) * 100 : null);
  const here = at(r.price);
  const prev = at(r.previousClose);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
      {r.logo ? (
        <img src={r.logo} alt="" className="h-7 w-7 shrink-0 rounded-md bg-white/85 object-contain p-0.5" />
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-sm font-semibold text-moon">
          {r.symbol}
          {r.name ? <span className="truncate text-[0.8125rem] font-normal text-moon/40">{r.name}</span> : null}
        </p>

        {here == null ? null : (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="clock-figures shrink-0 text-[0.6875rem] text-moon/30">{fmtPrice(lo)}</span>
            <span className="relative h-[3px] min-w-0 flex-1 rounded-full bg-white/10">
              {/* Where it closed yesterday, so today's move has a datum */}
              {prev == null ? null : (
                <span
                  className="absolute top-1/2 h-[7px] w-px -translate-y-1/2 bg-moon/30"
                  style={{ left: `${prev}%` }}
                  aria-hidden="true"
                />
              )}
              <span
                className={[
                  'absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full',
                  up ? 'bg-rise' : 'bg-fall',
                ].join(' ')}
                style={{ left: `${here}%` }}
                aria-hidden="true"
              />
            </span>
            <span className="clock-figures shrink-0 text-[0.6875rem] text-moon/30">{fmtPrice(hi)}</span>
          </div>
        )}
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
}

// Map condition text to lucide glyphs.
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
          <div className="markets-stage mt-2">
            <div className="lift relative aspect-video max-h-full w-full overflow-hidden rounded-[1.5rem] bg-black shadow-[0_40px_80px_-40px_rgba(0,0,0,0.95)] ring-1 ring-white/10">
              <LiveNewsPlayer />
            </div>
          </div>
        </div>

        <NewsSportsCard />
      </Ground>
    </div>
  );
}
