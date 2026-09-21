import { Globe2, Loader2, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api/backendClient.js';
import { toDestination } from '../utils/destination.js';

/**
 * Create or edit a trip.
 *
 * The destination field does the heavy lifting: one lookup resolves a typed city
 * into coordinates, its IANA time zone, the local currency, a photo and the
 * country's travel facts (sockets, voltage, driving side, emergency number) —
 * everything the rest of the view needs, so nothing else has to be typed twice.
 */
export default function TripEditor({ trip, onSave, onDelete, onClose, canDelete = false }) {
  const [draft, setDraft] = useState(() => ({ ...trip }));
  const [query, setQuery] = useState(trip.destination?.city ?? '');
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const destination = draft.destination;

  const lookup = async () => {
    const q = query.trim();
    if (!q) return;
    setStatus('loading');
    try {
      const found = await api.travel.destination(q);
      patch({
        destination: toDestination(found),
        // A trip still called "New trip" takes the destination's name.
        name: draft.name && draft.name !== 'New trip' ? draft.name : `${found.city} trip`,
      });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-3xl p-5">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="display-type text-lg font-light text-moon text-glow">
            {canDelete ? 'Trip settings' : 'New trip'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-moon/50 transition hover:bg-white/10 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <label className="block">
            <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
              Trip name
            </span>
            <input
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Tokyo escape"
              className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
              Destination
            </span>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moon/35"
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      lookup();
                    }
                  }}
                  placeholder="Kyoto, Japan"
                  aria-label="Destination"
                  className="w-full rounded-xl border border-white/12 bg-white/8 py-2 pl-9 pr-3 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
                />
              </div>
              <button
                type="button"
                onClick={lookup}
                disabled={status === 'loading' || !query.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
              >
                {status === 'loading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Look up
              </button>
            </div>

            {status === 'error' && (
              <p className="mt-1.5 text-[0.8125rem] font-medium text-rose-300/80">
                Couldn’t find that place. Try adding the country.
              </p>
            )}

            {destination && (
              <div className="mt-2.5 flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10">
                {destination.photo?.url ? (
                  <img
                    src={destination.photo.url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/8 text-2xl">
                    {destination.flag || '🌍'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-moon">
                    {destination.flag} {destination.city}
                    {destination.country ? <span className="text-moon/45">, {destination.country}</span> : null}
                  </p>
                  <p className="mt-0.5 truncate text-[0.8125rem] text-moon/45">
                    {[
                      destination.timeZone,
                      destination.currency?.code,
                      destination.voltage ? `${destination.voltage}V · type ${destination.sockets}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
                Start
              </span>
              <input
                type="date"
                value={draft.start ?? ''}
                onChange={(event) => patch({ start: event.target.value })}
                className="editable-date w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none focus:border-accent/40"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
                End
              </span>
              <input
                type="date"
                value={draft.end ?? ''}
                onChange={(event) => patch({ end: event.target.value })}
                className="editable-date w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none focus:border-accent/40"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[0.75rem] font-semibold text-moon/42">
              Your home currency
            </span>
            <input
              value={draft.homeCurrency ?? ''}
              onChange={(event) => patch({ homeCurrency: event.target.value.toUpperCase().slice(0, 3) })}
              placeholder="GBP"
              className="clock-figures w-28 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
            />
            <span className="ml-2 text-[0.8125rem] text-moon/38">
              Rates convert from here into {destination?.currency?.code ?? 'the local currency'}.
            </span>
          </label>
        </div>

        <div className="mt-5 flex shrink-0 items-center justify-between gap-2 border-t border-white/10 pt-4">
          {canDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-moon/40 transition hover:bg-rose-400/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete trip
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-xs font-medium text-moon/45 transition hover:bg-white/8 hover:text-moon/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className="rounded-xl bg-accent/15 px-4 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Save trip
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
