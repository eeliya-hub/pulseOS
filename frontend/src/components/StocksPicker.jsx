import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useSettings } from '../hooks/useSettings.js';

// Add / remove the ticker symbols shown on the Stocks card.
export default function StocksPicker() {
  const { settings, update } = useSettings();
  const symbols = settings.stocks ?? [];
  const [draft, setDraft] = useState('');

  const add = () => {
    const sym = draft.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) {
      setDraft('');
      return;
    }
    update({ stocks: [...symbols, sym] });
    setDraft('');
  };

  const remove = (sym) => update({ stocks: symbols.filter((s) => s !== sym) });

  return (
    <div>
      <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
        Stocks &amp; tickers
      </span>

      {symbols.length ? (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {symbols.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/8 py-1 pl-2.5 pr-1 text-[0.8125rem] font-medium text-moon/85 ring-1 ring-white/12"
            >
              {s}
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Remove ${s}`}
                className="grid h-4 w-4 place-items-center rounded-full text-moon/40 transition hover:bg-white/10 hover:text-rose-300 focus:outline-none"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-[0.8125rem] text-moon/40">No tickers yet — add one below.</p>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. AAPL"
          aria-label="Add ticker symbol"
          className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/8 px-2.5 py-1.5 text-xs text-moon outline-none transition placeholder:normal-case placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add ticker"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25 transition hover:bg-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <span className="mt-1.5 block text-[0.75rem] text-moon/38">Ticker symbols (e.g. AAPL, MSFT). Needs a Finnhub key.</span>
    </div>
  );
}
