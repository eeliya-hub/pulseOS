import { Check, ChevronLeft, ChevronRight, ImageOff, MapPin, Plus, Star, Ticket, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_COLORS, categoryOf } from '../hooks/useTravelStore.js';
import { placePhotoUrl } from '../utils/places.js';
import PhotoPicker from './PhotoPicker.jsx';
import PlaceSearch from './PlaceSearch.jsx';

/**
 * The full view of one itinerary item: its pictures large across the top, then
 * the detail behind it — what kind of thing it is, when it runs, the real place
 * it happens at, what it costs, whether it's booked.
 *
 * Edits apply straight to the store as they're made — the same always-live
 * editing the rest of the dashboard uses — so this closes rather than saves.
 */
const PLACE_KIND = { food: 'food', sight: 'sight', stay: 'hotel', plan: 'any', transport: 'any', flight: 'any' };

export default function ItineraryItemEditor({
  item,
  categories,
  currency = '',
  near = null,
  onPatch,
  onRemove,
  onClose,
  onAddCategory,
}) {
  const [searching, setSearching] = useState(!item.place);
  const place = item.place;
  const photos = item.photos ?? [];
  const category = categoryOf(categories, item.type);

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
      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl">
        <Gallery photos={photos} accent={category.color} onClose={onClose} />

        {/* Title block, lifted onto the foot of the gallery */}
        <div className="relative z-10 -mt-9 shrink-0 px-5">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[0.5625rem] font-semibold uppercase tracking-[0.14em]"
            style={{
              backgroundColor: `${category.color}26`,
              color: category.color,
              boxShadow: `0 0 0 1px ${category.color}55`,
            }}
          >
            {category.label}
          </span>
          <input
            value={item.title}
            onChange={(event) => onPatch({ title: event.target.value })}
            aria-label="Plan title"
            placeholder="What's the plan?"
            className="display-type mt-1.5 w-full bg-transparent text-2xl font-light text-white outline-none placeholder:text-white/30"
          />
          {place?.name ? (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[0.6875rem] text-white/45">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{place.address || place.name}</span>
            </p>
          ) : null}
        </div>

        <div className="glass-scroll mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-1">
          <CategoryChips
            categories={categories}
            value={item.type}
            onChange={(type) => onPatch({ type })}
            onAdd={onAddCategory}
          />

          {/* When */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input
                type="time"
                value={item.time ?? ''}
                onChange={(event) => onPatch({ time: event.target.value })}
                aria-label="Start time"
                className="editable-date clock-figures w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none focus:border-cyan-100/40"
              />
            </Field>
            <Field label="Ends">
              <input
                type="time"
                value={item.endTime ?? ''}
                onChange={(event) => onPatch({ endTime: event.target.value })}
                aria-label="End time"
                className="editable-date clock-figures w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none focus:border-cyan-100/40"
              />
            </Field>
          </div>

          {/* Where */}
          <Field label="Place">
            {place && !searching ? (
              <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2.5 ring-1 ring-white/10">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/8">
                  <MapPin className="h-4 w-4 text-cyan-100/70" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{place.name}</p>
                  <p className="truncate text-[0.6875rem] text-white/45">{place.address}</p>
                </div>
                {place.rating ? (
                  <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-amber-200/90">
                    <Star className="h-3 w-3 fill-amber-200/90" aria-hidden="true" />
                    {place.rating.toFixed(1)}
                  </span>
                ) : null}
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setSearching(true)}
                    className="soft-button rounded-lg px-2.5 py-1 text-[0.6875rem] font-semibold text-white/75 focus:outline-none"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => onPatch({ place: null })}
                    className="rounded-lg px-2.5 py-1 text-[0.6875rem] font-medium text-white/35 transition hover:text-rose-300 focus:outline-none"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <PlaceSearch
                kind={PLACE_KIND[item.type] ?? 'any'}
                near={near}
                className="max-h-52"
                onPick={(picked) => {
                  onPatch({
                    photos: photos.length ? photos : (picked.photos ?? []).slice(0, 3),
                    place: {
                      id: picked.id,
                      name: picked.name,
                      address: picked.address,
                      lat: picked.lat,
                      lon: picked.lon,
                      rating: picked.rating,
                      ratingCount: picked.ratingCount,
                      photos: picked.photos ?? [],
                      mapsUrl: picked.mapsUrl,
                    },
                    title: item.title === 'New plan' ? picked.name : item.title,
                  });
                  setSearching(false);
                }}
              />
            )}
          </Field>

          <Field label="Photos">
            <PhotoPicker
              photos={photos}
              onChange={(next) => onPatch({ photos: next })}
              query={place?.name || item.title}
              placeId={place?.id ?? null}
              near={near}
              autoAdopt={Boolean(place)}
            />
          </Field>

          {/* Cost + booking */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Cost${currency ? ` (${currency})` : ''}`}>
              <input
                value={item.cost ?? ''}
                onChange={(event) => onPatch({ cost: event.target.value.replace(/[^\d.]/g, '') })}
                inputMode="decimal"
                placeholder="0"
                aria-label="Cost"
                className="clock-figures w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-100/40"
              />
            </Field>
            <Field label="Booking">
              <button
                type="button"
                onClick={() => onPatch({ booked: !item.booked })}
                aria-pressed={item.booked}
                className={[
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                  item.booked
                    ? 'border-emerald-300/35 bg-emerald-300/12 text-emerald-100'
                    : 'border-white/12 bg-white/8 text-white/55 hover:bg-white/12',
                ].join(' ')}
              >
                <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
                {item.booked ? 'Booked' : 'Not booked'}
              </button>
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={item.note ?? ''}
              onChange={(event) => onPatch({ note: event.target.value })}
              rows={3}
              placeholder="Confirmation numbers, who's coming, what to bring…"
              className="glass-scroll w-full resize-none rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-[0.8125rem] leading-6 text-white/85 outline-none placeholder:text-white/25 focus:border-cyan-100/40"
            />
          </Field>
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              onRemove();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-white/40 transition hover:bg-rose-400/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPatch({ done: !item.done })}
              className={[
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                item.done ? 'bg-cyan-200/15 text-cyan-50 ring-1 ring-cyan-200/25' : 'soft-button text-white/70',
              ].join(' ')}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {item.done ? 'Done' : 'Mark done'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/16 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The photos, large, with the card's own gradient carrying them into the title
 * below. Arrows and dots only appear once there's more than one.
 */
function Gallery({ photos, accent, onClose }) {
  const [index, setIndex] = useState(0);
  const count = photos.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const go = (delta) => setIndex((current) => (current + delta + count) % count);
  const current = photos[index];

  return (
    <div className="relative h-52 shrink-0 overflow-hidden">
      {current ? (
        <img src={placePhotoUrl(current, 1200)} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className="grid h-full w-full place-items-center"
          style={{ background: `linear-gradient(160deg, ${accent}22, rgba(12,17,36,0.9))` }}
        >
          <span className="flex flex-col items-center gap-1.5 text-white/30">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <span className="text-[0.625rem] font-medium uppercase tracking-[0.16em]">No photos yet</span>
          </span>
        </div>
      )}

      {/* Scrim, so the title below always reads whatever the photo is */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141a33] via-[#141a33]/35 to-transparent"
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-[#0b1024]/70 text-white/75 backdrop-blur-md transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[#0b1024]/60 text-white/80 backdrop-blur-md transition hover:bg-[#0b1024]/85 focus:outline-none"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-[#0b1024]/60 text-white/80 backdrop-blur-md transition hover:bg-[#0b1024]/85 focus:outline-none"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((photo, i) => (
              <button
                key={photo.ref ?? photo.url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-white/90' : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Category chips, with an inline "new category" form on the end. */
function CategoryChips({ categories, value, onChange, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[6]);

  const create = () => {
    const created = onAdd?.(label, color);
    if (created) onChange(created.id);
    setLabel('');
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((category) => {
          const active = value === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(category.id)}
              className={[
                'rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                active ? 'text-white' : 'soft-button text-white/55',
              ].join(' ')}
              style={
                active
                  ? {
                      backgroundColor: `${category.color}2e`,
                      boxShadow: `0 0 0 1px ${category.color}, 0 0 14px ${category.color}33`,
                    }
                  : undefined
              }
            >
              {category.label}
            </button>
          );
        })}
        {onAdd && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="New category"
            className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-white/25 text-white/40 transition hover:border-cyan-100/55 hover:text-cyan-100/70 focus:outline-none"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                create();
              }
              if (event.key === 'Escape') setAdding(false);
            }}
            autoFocus
            placeholder="Category name"
            aria-label="New category name"
            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-white/8 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-cyan-100/40"
          />
          <div className="flex items-center gap-1">
            {CATEGORY_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                aria-label={`Colour ${swatch}`}
                className={`h-4 w-4 rounded-full transition ${
                  color === swatch ? 'ring-2 ring-white/80' : 'ring-1 ring-white/20'
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={create}
            disabled={!label.trim()}
            className="rounded-lg bg-cyan-200/15 px-3 py-1.5 text-[0.6875rem] font-semibold text-cyan-50 ring-1 ring-cyan-200/25 transition hover:bg-cyan-200/22 focus:outline-none disabled:opacity-40"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-lg px-2 py-1.5 text-[0.6875rem] font-medium text-white/45 transition hover:text-white/80 focus:outline-none"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-white/42">
        {label}
      </span>
      {children}
    </label>
  );
}
