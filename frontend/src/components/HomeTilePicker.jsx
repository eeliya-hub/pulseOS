import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import LaunchIcon, { BrowserBadge } from './LaunchIcon.jsx';
import { itemKey, itemLabel } from '../services/launchpad/items.js';

const SLOTS = 12;

/**
 * Which of the launchpad the Home screen shows.
 *
 * One question, so one screen: the launchpad as tiles, and you tap the ones you
 * want. Everything else about a tile — its icon, which browser opens it,
 * whether it wears a corner mark — belongs to the launchpad itself and is set
 * there, in the Launchpad tab, where the whole shelf is in view. This used to
 * be all of that at once reached from Home, which meant the simplest question
 * in the app was asked in the most complicated place.
 */
export default function HomeTilePicker({ launchpad, homeKeys, onChange, onClose }) {
  // Null means Home is still following the launchpad's first twelve, which is
  // what it did before the two could differ.
  const following = !Array.isArray(homeKeys);
  const chosen = following ? launchpad.slice(0, SLOTS).map(itemKey) : homeKeys;
  const on = new Set(chosen);
  const full = chosen.length >= SLOTS;

  const toggle = (item) => {
    const k = itemKey(item);
    if (on.has(k)) onChange(chosen.filter((x) => x !== k));
    else if (!full) onChange([...chosen, k]);
  };

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/76 backdrop-blur-md" aria-hidden="true" />

      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem]">
        <div className="flex shrink-0 items-start justify-between px-7 pb-4 pt-6">
          <div>
            <p className="t-label text-accent/80">On Home</p>
            <p className="display-type mt-1 text-2xl font-light leading-tight text-moon">
              {chosen.length} of {SLOTS}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/8 text-moon/60 transition hover:text-moon focus:outline-none"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          {launchpad.length === 0 ? (
            <p className="px-6 py-14 text-center text-xs leading-relaxed text-moon/40">
              Nothing on the launchpad yet. Add some apps and links in the Launchpad tab, then choose which of them Home
              shows.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1">
              {launchpad.map((item) => {
                const lit = on.has(itemKey(item));
                return (
                  <button
                    key={itemKey(item)}
                    type="button"
                    onClick={() => toggle(item)}
                    aria-pressed={lit}
                    disabled={!lit && full}
                    className={[
                      'group flex flex-col items-center gap-2 rounded-2xl px-1 py-3 transition focus:outline-none',
                      lit ? 'bg-white/10 ring-1 ring-accent/40' : 'hover:bg-white/[0.05] disabled:hover:bg-transparent',
                    ].join(' ')}
                  >
                    {/* Not chosen reads as not lit, rather than as a checkbox
                        somewhere off to the side of the thing it refers to. */}
                    <span
                      className={`relative block h-[3.25rem] w-[3.25rem] transition duration-300 ${
                        lit ? '' : 'opacity-35 grayscale group-hover:opacity-70 group-hover:grayscale-0'
                      } ${!lit && full ? 'group-hover:opacity-35 group-hover:grayscale' : ''}`}
                    >
                      <LaunchIcon item={item} className="h-full w-full" />
                      <BrowserBadge item={item} />
                    </span>
                    <span
                      className={`w-full truncate text-center text-[0.75rem] transition ${lit ? 'text-moon' : 'text-moon/35'}`}
                    >
                      {itemLabel(item)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-7 py-3">
          <p className="min-w-0 flex-1 text-[0.75rem] text-moon/38">
            {following
              ? 'Following the launchpad — tap anything to choose for yourself.'
              : 'Home draws these, in the order you picked them.'}
          </p>
          {!following ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="shrink-0 rounded-lg px-2.5 py-1 text-[0.75rem] font-semibold text-moon/55 transition hover:bg-white/10 hover:text-moon focus:outline-none"
            >
              Follow the launchpad
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
