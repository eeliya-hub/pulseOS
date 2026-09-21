import { Loader2, MapPin, Search, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { placePhotoUrl } from '../utils/places.js';

/**
 * Search for a real place — a hotel, a restaurant, a sight — and hand the picked
 * one back with its coordinates, address, rating and photo.
 *
 * Results come from Google Places when a key is configured and OpenStreetMap
 * when it isn't; the shape is identical, so this component doesn't care which
 * answered. Searches are debounced and biased to the trip's coordinates.
 */
const KIND_HINTS = {
  hotel: 'Search hotels — name or area',
  food: 'Search restaurants, cafés, bars',
  sight: 'Search sights and attractions',
  any: 'Search places',
};

export default function PlaceSearch({ kind = 'any', near = null, onPick, autoFocus = false, className = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [source, setSource] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | empty | error
  const runId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus('idle');
      return undefined;
    }

    const id = runId.current + 1;
    runId.current = id;
    setStatus('loading');

    // Debounced so typing doesn't fire a request per keystroke — Nominatim in
    // particular asks for at most one call a second.
    const timer = window.setTimeout(() => {
      api.travel
        .places({
          q,
          kind: kind === 'any' ? undefined : kind,
          lat: near?.lat ?? undefined,
          lon: near?.lon ?? undefined,
          limit: 8,
        })
        .then((data) => {
          if (runId.current !== id) return; // a newer search already went out
          setSource(data.source);
          setResults(data.results ?? []);
          setStatus((data.results ?? []).length ? 'idle' : 'empty');
        })
        .catch(() => {
          if (runId.current !== id) return;
          setResults([]);
          setStatus('error');
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [query, kind, near?.lat, near?.lon]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moon/35"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus={autoFocus}
          placeholder={KIND_HINTS[kind] ?? KIND_HINTS.any}
          aria-label="Search places"
          className="w-full rounded-xl border border-white/12 bg-white/8 py-2 pl-9 pr-9 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/12"
        />
        {status === 'loading' && (
          <Loader2
            className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-accent/70"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="glass-scroll mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {status === 'error' && (
          <p className="px-3 py-6 text-center text-xs text-rose-200/70">
            Couldn’t reach the place search. Try again in a moment.
          </p>
        )}
        {status === 'empty' && (
          <p className="px-3 py-6 text-center text-xs text-moon/40">No places matched “{query.trim()}”.</p>
        )}
        {results.map((place) => {
          const photo = placePhotoUrl(place.photo, 160);
          return (
            <button
              key={place.id}
              type="button"
              onClick={() => onPick?.(place)}
              className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] p-2 text-left transition hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/8 ring-1 ring-white/10">
                  <MapPin className="h-4 w-4 text-accent/60" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-moon">{place.name}</span>
                <span className="mt-0.5 block truncate text-[0.8125rem] text-moon/45">{place.address}</span>
              </span>
              {place.rating ? (
                <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-amber-200/90">
                  <Star className="h-3 w-3 fill-amber-200/90" aria-hidden="true" />
                  {place.rating.toFixed(1)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {source ? (
        <p className="mt-2 shrink-0 text-[0.75rem] text-moon/25">
          {source === 'google' ? 'Google Places' : 'OpenStreetMap'}
        </p>
      ) : null}
    </div>
  );
}
