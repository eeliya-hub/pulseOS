import { ImagePlus, Loader2, Star, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { placePhotoUrl } from '../utils/places.js';

/**
 * Pick the pictures for an itinerary item.
 *
 * Suggestions are fetched for whatever the item is about — the attached place
 * when there is one, otherwise the title — so adding a photo is one tap rather
 * than a hunt for a URL. Chosen photos sit in a strip on top: click one to make
 * it the cover, × to drop it.
 */
const sameShot = (a, b) => (a.ref && a.ref === b.ref) || (a.url && a.url === b.url);

export default function PhotoPicker({ photos = [], onChange, query, placeId = null, near = null, autoAdopt = false }) {
  const [candidates, setCandidates] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | empty | error
  const [source, setSource] = useState(null);
  const runId = useRef(0);
  const adopted = useRef(false);

  const subject = (query || '').trim();
  // Refs so the auto-adopt check reads current values without re-running the search.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const suggest = useCallback(async () => {
    if (!subject && !placeId) return;
    const id = runId.current + 1;
    runId.current = id;
    setStatus('loading');
    try {
      const data = await api.travel.photos({
        q: subject || undefined,
        placeId: placeId || undefined,
        lat: near?.lat ?? undefined,
        lon: near?.lon ?? undefined,
        limit: 8,
      });
      if (runId.current !== id) return;
      setSource(data.source);
      const results = data.results ?? [];
      setCandidates(results);
      setStatus(results.length ? 'idle' : 'empty');

      // An item that has a place but no picture yet takes the first suggestion,
      // once, so the viewer opens on an image instead of an empty frame. The
      // rest stay a tap away, and this one can be removed like any other.
      if (autoAdopt && !adopted.current && photosRef.current.length === 0 && results[0]) {
        adopted.current = true;
        onChangeRef.current([{ ref: results[0].ref ?? null, url: results[0].url ?? null }]);
      }
    } catch {
      if (runId.current !== id) return;
      setCandidates([]);
      setStatus('error');
    }
  }, [subject, placeId, near?.lat, near?.lon, autoAdopt]);

  // Offer suggestions straight away when the item has none of its own — the
  // common case right after picking a place.
  useEffect(() => {
    if (photos.length === 0) suggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the subject changes
  }, [subject, placeId]);

  const unused = candidates.filter((candidate) => !photos.some((photo) => sameShot(photo, candidate)));

  const add = (photo) => onChange([...photos, { ref: photo.ref ?? null, url: photo.url ?? null }]);
  const remove = (photo) => onChange(photos.filter((p) => !sameShot(p, photo)));
  // The cover is simply the first one, so "make cover" is a reorder.
  const makeCover = (photo) => onChange([photo, ...photos.filter((p) => !sameShot(p, photo))]);

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {photos.map((photo, index) => (
            <div key={photo.ref ?? photo.url} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => makeCover(photo)}
                title={index === 0 ? 'Cover photo' : 'Make cover photo'}
                className={[
                  'block h-16 w-24 overflow-hidden rounded-xl ring-1 transition focus:outline-none focus-visible:ring-2',
                  index === 0 ? 'ring-cyan-200/60' : 'ring-white/12 hover:ring-white/30',
                ].join(' ')}
              >
                <img src={placePhotoUrl(photo, 320)} alt="" className="h-full w-full object-cover" />
              </button>
              {index === 0 && (
                <span
                  className="pointer-events-none absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#0b1024]/80 text-cyan-100"
                  title="Cover"
                >
                  <Star className="h-2.5 w-2.5 fill-cyan-100" aria-hidden="true" />
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#0b1024]/80 text-white/70 opacity-0 transition hover:text-rose-300 focus:opacity-100 focus:outline-none group-hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {unused.length > 0 && (
        <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {unused.map((photo) => (
            <button
              key={photo.ref ?? photo.url}
              type="button"
              onClick={() => add(photo)}
              aria-label="Add this photo"
              className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl opacity-70 ring-1 ring-white/10 transition hover:opacity-100 hover:ring-cyan-200/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <img src={placePhotoUrl(photo, 240)} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-[#0b1024]/70 py-0.5 text-center text-[0.5625rem] font-semibold uppercase tracking-[0.1em] text-white/80">
                Add
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={suggest}
          disabled={status === 'loading' || (!subject && !placeId)}
          className="soft-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-semibold text-white/75 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
        >
          {status === 'loading' ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-3 w-3" aria-hidden="true" />
          )}
          {photos.length ? 'Find more photos' : 'Find photos'}
        </button>
        <span className="truncate text-[0.5625rem] uppercase tracking-[0.14em] text-white/25">
          {status === 'empty' && 'No photos found'}
          {status === 'error' && 'Photo search unavailable'}
          {status === 'idle' && source === 'google' && 'Google Places'}
          {status === 'idle' && source === 'openstreetmap' && 'Wikipedia'}
        </span>
      </div>
    </div>
  );
}
