import { Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../hooks/useSettings.js';
import { Field, Hint } from '../views/settings/controls.jsx';
import { SymbolEditor, TeamsEditor } from '../views/settings/Markets.jsx';

/**
 * The few settings a view owns, a gear away inside that view — the watchlist
 * while you're reading prices, the teams while you're reading scores. The
 * same editors as the Settings page, so the two can never disagree; the whole
 * of Settings is its own page, reached from Home.
 *
 * `fields`: any of 'location', 'sports', 'stocks', 'ticker'.
 */
export default function SettingsButton({ className = '', title = 'Settings', fields = ['location'] }) {
  const [open, setOpen] = useState(false);
  const { settings, update } = useSettings();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-settings=""
        onClick={() => setOpen(true)}
        aria-label={title}
        className={`pill h-11 w-11 px-0 text-moon/70 ${className}`}
      >
        <Settings className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              data-settings=""
              className="fixed inset-0 z-[80] flex items-center justify-center p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
              role="presentation"
            >
              <div className="fade-in absolute inset-0 bg-ink/70 backdrop-blur-md" aria-hidden="true" />
              <div
                role="dialog"
                aria-label={title}
                className="theme-popover launcher-rise relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-[1.75rem]"
              >
                <div className="flex shrink-0 items-center justify-between px-7 pb-2 pt-6">
                  <h2 className="display-type text-[1.75rem] leading-none text-moon">{title}</h2>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="pill h-8 w-8 px-0 text-moon/70">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="glass-scroll min-h-0 flex-1 space-y-8 overflow-y-auto px-7 pb-7 pt-4">
                  {fields.includes('location') ? (
                    <div>
                      <p className="t-label mb-2.5">Where you are</p>
                      <Field
                        value={settings.location}
                        delay={800}
                        onCommit={(location) => update({ location: location.trim() })}
                        placeholder="A town or county"
                        aria-label="Where you are"
                        className="w-full"
                      />
                      <Hint>Your local news and the weather on Home both follow it.</Hint>
                    </div>
                  ) : null}
                  {fields.includes('stocks') ? (
                    <div>
                      <p className="t-label mb-2.5">Watchlist</p>
                      <div className="settings-well !mt-0">
                        <SymbolEditor setting="stocks" placeholder="Add a symbol — e.g. AAPL" />
                      </div>
                    </div>
                  ) : null}
                  {fields.includes('ticker') ? (
                    <div>
                      <p className="t-label mb-2.5">Ticker tape</p>
                      <div className="settings-well !mt-0">
                        <SymbolEditor setting="ticker" placeholder="Add a symbol — e.g. BTC" />
                      </div>
                    </div>
                  ) : null}
                  {fields.includes('sports') ? (
                    <div>
                      <p className="t-label mb-2.5">Teams you follow</p>
                      <div className="settings-well !mt-0">
                        <TeamsEditor />
                      </div>
                    </div>
                  ) : null}
                  <p className="t-micro">Everything else is in Settings, from the gear on Home.</p>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
