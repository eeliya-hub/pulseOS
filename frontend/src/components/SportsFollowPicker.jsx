import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { SPORTS_CATALOG, leagueKeyOf } from '../data/sportsCatalog.js';
import { useSettings } from '../hooks/useSettings.js';

// Toggle any number of teams on/off directly from the full league rosters.
export default function SportsFollowPicker() {
  const { settings, update } = useSettings();
  const follows = settings.follows ?? [];
  const [openLeague, setOpenLeague] = useState(null);

  const isFollowed = (id) => follows.some((f) => f.id === id);

  const toggle = (sport, league, team) => {
    const id = `${league.id ?? league.label}:${team}`;
    if (isFollowed(id)) {
      update({ follows: follows.filter((f) => f.id !== id) });
    } else {
      update({
        follows: [...follows, { id, sport, leagueId: league.id, leagueLabel: league.label, team }],
      });
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
        Sports &amp; teams
      </span>

      {follows.length ? (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {follows.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/8 py-1 pl-2.5 pr-1 text-[0.8125rem] text-moon/85 ring-1 ring-white/12"
            >
              <span className="font-medium">{f.team}</span>
              <span className="text-moon/35">· {f.leagueLabel}</span>
              <button
                type="button"
                onClick={() => update({ follows: follows.filter((x) => x.id !== f.id) })}
                aria-label={`Remove ${f.team}`}
                className="grid h-4 w-4 place-items-center rounded-full text-moon/40 transition hover:bg-white/10 hover:text-rose-300 focus:outline-none"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-[0.8125rem] text-moon/40">Tap a league below, then tap teams to follow them.</p>
      )}

      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {SPORTS_CATALOG.map((s) =>
          s.leagues.map((l) => {
            const key = leagueKeyOf(s.sport, l);
            const isOpen = openLeague === key;
            return (
              <div key={key} className="rounded-xl bg-white/[0.04] ring-1 ring-white/8">
                <button
                  type="button"
                  onClick={() => setOpenLeague(isOpen ? null : key)}
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-medium text-moon/85"
                >
                  <span aria-hidden="true">{s.icon}</span>
                  <span className="flex-1">{l.label}</span>
                  <span className="text-moon/35">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen ? (
                  <div className="grid grid-cols-2 gap-1 px-2.5 pb-2.5">
                    {l.teams.map((team) => {
                      const id = `${l.id ?? l.label}:${team}`;
                      const active = isFollowed(id);
                      return (
                        <button
                          key={team}
                          type="button"
                          onClick={() => toggle(s.sport, l, team)}
                          className={[
                            'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                            active
                              ? 'bg-accent/15 text-accent ring-1 ring-accent/25'
                              : 'text-moon/60 hover:bg-white/[0.06] hover:text-moon/85',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] ring-1',
                              active ? 'bg-accent/30 ring-accent/40' : 'ring-white/25',
                            ].join(' ')}
                          >
                            {active ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                          </span>
                          <span className="truncate">{team}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }),
        )}
      </div>
      <span className="mt-1.5 block text-[0.75rem] text-moon/38">Used for the Sports card.</span>
    </div>
  );
}
