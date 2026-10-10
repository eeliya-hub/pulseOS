import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { NEWS_SCOPE_KEY, NEWS_SCOPES } from '../../data/newsScopes.js';
import { SPORTS_CATALOG, leagueKeyOf } from '../../data/sportsCatalog.js';
import { useSettings } from '../../hooks/useSettings.js';
import { peek } from '../../services/warmCache.js';
import { Empty, Group, Page, Preview, Row, Segmented } from './controls.jsx';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Seconds for one pass of the preview's tape, at each speed the real one runs.
const PREVIEW_PASS = { slow: 46, steady: 28, quick: 17 };

/** The tape across the top of Markets, small, running at the speed you've set. */
export function MarketsPreview() {
  const { settings } = useSettings();
  const symbols = settings.ticker ?? [];
  // Prices if the launch already fetched them; the symbols alone otherwise.
  const live = peek(`stocks:ticker:${symbols.join(',')}`)?.ticker ?? [];
  const priced = (sym) => live.find((a) => a.symbol === sym);
  const items = symbols.length ? symbols : ['AAPL'];
  const run = (
    <span className="ticker-copy items-center">
      {items.map((sym) => {
        const a = priced(sym);
        const up = (a?.change ?? 0) >= 0;
        return (
          <span key={sym} className="flex items-baseline gap-1.5 whitespace-nowrap pr-6">
            <span className="text-[0.8125rem] font-semibold text-moon">{sym}</span>
            {a?.price != null ? <span className="clock-figures text-[0.75rem] text-moon/70">{Number(a.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> : null}
            {a?.change != null ? (
              <span className={`clock-figures text-[0.6875rem] ${up ? 'text-rise' : 'text-fall'}`}>
                {up ? '+' : ''}
                {(a.change * 100).toFixed(1)}%
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">Watching</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">{plural((settings.stocks ?? []).length, 'stock')}</p>
      <p className="t-micro absolute left-5 top-[4.6rem]">{plural((settings.follows ?? []).length, 'team')} followed</p>
      <div className="ticker-mask absolute inset-x-0 bottom-6 overflow-hidden border-y border-white/[0.08] py-2">
        <div
          className="ticker-track"
          style={{ '--ticker-shift': '50%', '--ticker-duration': `${PREVIEW_PASS[settings.tickerSpeed] ?? PREVIEW_PASS.steady}s` }}
        >
          {run}
          {run}
        </div>
      </div>
    </Preview>
  );
}

export function MarketsPane() {
  const { settings, update } = useSettings();
  const [scope, setScope] = useState(() => {
    try {
      return localStorage.getItem(NEWS_SCOPE_KEY) || 'top';
    } catch {
      return 'top';
    }
  });
  const pickScope = (next) => {
    setScope(next);
    try {
      localStorage.setItem(NEWS_SCOPE_KEY, next);
    } catch {
      /* the choice just won't stick */
    }
  };

  return (
    <Page>
      <Group title="Watchlist" note="What you hold, priced live in the Markets column. Needs a Finnhub key on the backend.">
        <SymbolEditor setting="stocks" placeholder="Add a symbol — e.g. AAPL" />
      </Group>

      <Group title="Ticker tape" note="What runs across the top of Markets. Stocks or coins — BTC, ETH and SOL all work.">
        <SymbolEditor setting="ticker" placeholder="Add a symbol — e.g. BTC" />
        <Row label="Speed" hint="Steady is slow enough to read at a glance.">
          <Segmented
            label="Tape speed"
            value={settings.tickerSpeed ?? 'steady'}
            onChange={(tickerSpeed) => update({ tickerSpeed })}
            options={[
              { id: 'slow', label: 'Slow' },
              { id: 'steady', label: 'Steady' },
              { id: 'quick', label: 'Quick' },
            ]}
          />
        </Row>
      </Group>

      <Group title="News">
        <Row label="Opens on" hint="Local news follows where you are, set under You.">
          <Segmented wrap options={NEWS_SCOPES} value={scope} onChange={pickScope} label="News opens on" />
        </Row>
      </Group>

      <Group title="Teams you follow" note="Their fixtures, results and tables on the Sport card.">
        <TeamsEditor />
      </Group>
    </Page>
  );
}

/**
 * A list of symbols as chips, each with a way off it, and a field for the
 * next. Used for the watchlist and the tape, which are separate on purpose —
 * the one is what you hold, the other what you glance at.
 */
export function SymbolEditor({ setting, placeholder }) {
  const { settings, update } = useSettings();
  const symbols = settings[setting] ?? [];
  const [draft, setDraft] = useState('');

  const add = (e) => {
    e.preventDefault();
    const sym = draft.trim().toUpperCase().replace(/\s+/g, '');
    setDraft('');
    if (!sym) return;
    update((s) => ((s[setting] ?? []).includes(sym) ? {} : { [setting]: [...(s[setting] ?? []), sym] }));
  };

  return (
    <>
      {symbols.length ? (
        <ul className="flex flex-wrap gap-1.5 px-5 py-4">
          {symbols.map((sym) => (
            <li key={sym}>
              <span className="pill h-9 gap-1 pl-3.5 pr-1">
                <span className="clock-figures text-[0.875rem] font-semibold tracking-[0.02em]">{sym}</span>
                <button
                  type="button"
                  onClick={() => update((s) => ({ [setting]: (s[setting] ?? []).filter((x) => x !== sym) }))}
                  aria-label={`Remove ${sym}`}
                  className="grid h-7 w-7 place-items-center rounded-full text-moon/45 transition hover:bg-white/10 hover:text-fall focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing yet.</Empty>
      )}
      <form onSubmit={add} className="settings-row">
        <Plus className="h-4 w-4 shrink-0 text-moon/45" strokeWidth={1.7} aria-hidden="true" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={12}
          className="min-w-0 flex-1 bg-transparent text-[0.9688rem] text-moon outline-none placeholder:normal-case placeholder:text-moon/35"
        />
        <button type="submit" disabled={!draft.trim()} className="pill h-9 px-4 disabled:opacity-40">
          Add
        </button>
      </form>
    </>
  );
}

/**
 * The teams on the Sport card: the ones you follow, each with a way off it,
 * then every league as a pill and its teams as pills to tap on or off.
 */
export function TeamsEditor() {
  const { settings, update } = useSettings();
  const follows = settings.follows ?? [];
  const leagues = SPORTS_CATALOG.flatMap((s) => s.leagues.map((l) => ({ ...l, sport: s.sport, key: leagueKeyOf(s.sport, l) })));
  const [open, setOpen] = useState(leagues[0]?.key);
  const league = leagues.find((l) => l.key === open) ?? leagues[0];

  const idOf = (l, team) => `${l.id ?? l.label}:${team}`;
  const followed = (id) => follows.some((f) => f.id === id);
  const toggle = (l, team) => {
    const id = idOf(l, team);
    update((s) => {
      const list = s.follows ?? [];
      return list.some((f) => f.id === id)
        ? { follows: list.filter((f) => f.id !== id) }
        : { follows: [...list, { id, sport: l.sport, leagueId: l.id, leagueLabel: l.label, team }] };
    });
  };

  return (
    <>
      {follows.length === 0 ? (
        <Empty>No teams yet — pick some below.</Empty>
      ) : (
        follows.map((f) => (
          <Row key={f.id} label={f.team} hint={f.leagueLabel}>
            <button
              type="button"
              onClick={() => update((s) => ({ follows: (s.follows ?? []).filter((x) => x.id !== f.id) }))}
              aria-label={`Stop following ${f.team}`}
              className="pill h-8 w-8 px-0 text-moon/55 hover:text-fall"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Row>
        ))
      )}
      <div className="px-5 py-4">
        <p className="settings-row-label">Add a team</p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Leagues">
          {leagues.map((l) => (
            <button key={l.key} type="button" role="tab" aria-selected={l.key === league.key} onClick={() => setOpen(l.key)} className="pill h-8 px-3.5">
              {l.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
          {league.teams.map((team) => {
            const on = followed(idOf(league, team));
            return (
              <button
                key={team}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(league, team)}
                className={`pill h-8 px-3.5 ${on ? '' : 'text-moon/75'}`}
              >
                {on ? <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" /> : null}
                {team}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
