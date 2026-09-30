import { Check, FolderPlus, Globe, ImageUp, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api/backendClient.js';
import LaunchIcon, { AppIcon, BrowserBadge } from './LaunchIcon.jsx';
import { DEFAULT_ICON, hostOf, isSite, itemKey, itemLabel, normalizeUrl, toIconDataUrl } from '../services/launchpad/items.js';

/**
 * The launchpad, edited as the launchpad.
 *
 * It was a list: a long thin column of rows, each one a small icon and two
 * lines of text, which is the shape of a settings screen and not the shape of
 * the thing being set up. A launchpad is a grid of tiles, so this is a grid of
 * tiles — the same size they are on the real one — and you change one by
 * picking it up. What you are editing is the thing you are looking at.
 *
 * The width goes to a second column rather than to longer rows: the shelf on
 * the left, whatever is in your hand on the right.
 */
export default function LaunchpadSettings({ selected, installed, meta, onChange, onClose }) {
  // Opens on the add slot, because that is what the button that opens it says,
  // and because the list of what is installed is worth landing on: it is the
  // only place to see everything the machine actually has.
  const [picked, setPicked] = useState('add'); // itemKey, or 'add'
  const current = selected.find((i) => itemKey(i) === picked) ?? null;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = (item) => {
    if (selected.some((i) => itemKey(i) === itemKey(item))) return;
    onChange([...selected, item]);
    setPicked(itemKey(item));
  };
  const remove = (item) => {
    onChange(selected.filter((i) => itemKey(i) !== itemKey(item)));
    setPicked(null);
  };
  const patch = (next) => onChange(selected.map((i) => (itemKey(i) === picked ? next : i)));

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

      <div className="theme-card fade-in relative z-10 flex h-[min(46rem,calc(100dvh-2.5rem))] w-full max-w-4xl overflow-hidden rounded-[1.75rem]">
        {/* ── The shelf ──────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-white/10">
          <div className="flex shrink-0 items-start justify-between px-6 pb-4 pt-5">
            <div>
              <p className="t-label text-accent/80">Launchpad</p>
              <p className="display-type mt-1 text-2xl font-light leading-tight text-moon">
                {selected.length} {selected.length === 1 ? 'thing' : 'things'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/8 text-moon/60 transition hover:text-moon focus:outline-none lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="glass-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1">
              {selected.map((item) => {
                const k = itemKey(item);
                const on = picked === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPicked(on ? null : k)}
                    className={[
                      'group flex flex-col items-center gap-2 rounded-2xl px-1 py-3 transition focus:outline-none',
                      on ? 'bg-white/10 ring-1 ring-accent/40' : 'hover:bg-white/[0.05]',
                    ].join(' ')}
                  >
                    <span className="relative block h-[3.25rem] w-[3.25rem] transition-transform duration-300 group-hover:-translate-y-0.5">
                      <LaunchIcon item={item} className="h-full w-full" />
                      <BrowserBadge item={item} />
                    </span>
                    <span
                      className={`w-full truncate text-center text-[0.75rem] transition ${on ? 'text-moon' : 'text-haze group-hover:text-moon'}`}
                    >
                      {itemLabel(item)}
                    </span>
                  </button>
                );
              })}

              {/* The empty slot at the end, which is how you add to a shelf */}
              <button
                type="button"
                onClick={() => setPicked('add')}
                className={[
                  'group flex flex-col items-center gap-2 rounded-2xl px-1 py-3 transition focus:outline-none',
                  picked === 'add' ? 'bg-white/10 ring-1 ring-accent/40' : 'hover:bg-white/[0.05]',
                ].join(' ')}
              >
                <span className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-[0.85rem] border border-dashed border-white/20 text-moon/40 transition group-hover:border-white/40 group-hover:text-moon/70">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="w-full truncate text-center text-[0.75rem] text-haze">Add</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Whatever is in your hand ───────────────────────────────── */}
        <div className="flex w-[21rem] shrink-0 flex-col">
          <div className="flex shrink-0 justify-end px-5 pt-5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full bg-white/8 text-moon/60 transition hover:text-moon focus:outline-none"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {picked === 'add' ? (
            <AddSomething installed={installed} selected={selected} onAdd={add} />
          ) : current ? (
            <Inspector item={current} meta={meta} onChange={patch} onRemove={() => remove(current)} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6 text-moon/30">
                <Globe className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-xs leading-relaxed text-moon/40">
                Pick a tile to change its icon, choose which browser opens it, or take it off.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The add slot: find an application, or paste a link. */
function AddSomething({ installed, selected, onAdd }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const typed = query.trim();
  // Something with a dot in it and no spaces is an address, not a search.
  const isLink = /\./.test(typed) && !/\s/.test(typed);
  const onPad = useMemo(() => new Set(selected.map(itemKey)), [selected]);

  // Everything installed when nothing is typed, because the list is worth
  // reading: it is the only place to see what is actually on the machine, and
  // half of what ends up on a launchpad is something you had forgotten you had.
  // Things already on it stay in the list, marked, rather than vanishing — a
  // catalogue with holes in it is hard to trust.
  const matches = useMemo(() => {
    if (isLink) return [];
    const q = typed.toLowerCase();
    return q
      ? installed.filter((a) => `${a.name} ${a.via ?? ''}`.toLowerCase().includes(q))
      : installed;
  }, [installed, typed, isLink]);

  const addLink = () => {
    const url = normalizeUrl(typed);
    if (!url) return setError('That does not look like a web address.');
    if (selected.some((i) => isSite(i) && i.url === url)) return setError('That is already here.');
    onAdd({ url, name: hostOf(url) });
    setQuery('');
    return setError('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
      <p className="t-label shrink-0 text-moon/45">
        Add{!typed && !isLink && installed.length ? ` · ${installed.length} installed` : ''}
      </p>
      <div className="mt-2 flex shrink-0 items-center gap-2">
        <span className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon/30" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isLink) {
                e.preventDefault();
                addLink();
              }
            }}
            placeholder="An app, or a link"
            aria-label="Find an app or add a link"
            className="w-full rounded-xl border border-white/12 bg-white/8 py-2 pl-9 pr-3 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus-visible:outline-none"
          />
        </span>
        {isLink ? (
          <button
            type="button"
            onClick={addLink}
            aria-label="Add link"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25 transition hover:bg-accent/25 focus:outline-none"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 shrink-0 text-[0.8125rem] text-rose-300">{error}</p> : null}

      <div className="glass-scroll mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {isLink ? (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-moon/40">
            Press enter to add <span className="text-moon/70">{hostOf(typed)}</span>, then pick its icon.
          </p>
        ) : matches.length ? (
          matches.map((a) => {
            const already = onPad.has(`app:${a.name}`);
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => !already && onAdd(a.name)}
                disabled={already}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.07] disabled:hover:bg-transparent focus:outline-none"
              >
                <AppIcon app={a.name} className={`h-7 w-7 shrink-0 ${already ? 'opacity-30' : ''}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[0.8125rem] ${already ? 'text-moon/30' : 'text-moon/85'}`}>
                    {a.name}
                  </span>
                  {/* Which browser a web app came from. An Instagram installed
                      from Edge and one from the App Store are different things,
                      and only the list can say which is which. */}
                  {a.via ? (
                    <span className={`block truncate text-[0.6875rem] ${already ? 'text-moon/20' : 'text-moon/35'}`}>
                      {a.via} app
                    </span>
                  ) : null}
                </span>
                {already ? <Check className="h-3.5 w-3.5 shrink-0 text-moon/25" aria-hidden="true" /> : null}
              </button>
            );
          })
        ) : (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-moon/40">
            {typed ? `Nothing installed called “${typed}”.` : 'Looking for your applications…'}
          </p>
        )}
      </div>
    </div>
  );
}

/** One tile's settings, beside the tile. */
function Inspector({ item, meta, onChange, onRemove }) {
  const site = isSite(item);
  return (
    <div className="glass-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5">
      <div className="flex items-center gap-3">
        <span className="relative block h-12 w-12 shrink-0">
          <LaunchIcon item={item} className="h-full w-full" />
          <BrowserBadge item={item} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="display-type truncate text-lg font-light leading-tight text-moon">{itemLabel(item)}</p>
          <p className="truncate text-[0.75rem] text-moon/40">{site ? hostOf(item.url) : 'Application'}</p>
        </div>
      </div>

      {meta ? <Folders item={item} meta={meta} /> : null}

      {site ? <SiteControls site={item} onChange={onChange} /> : (
        <p className="text-xs leading-relaxed text-moon/40">
          An application brings its own icon and opens itself.
        </p>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="mt-auto inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10 focus:outline-none"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Take off the launchpad
      </button>
    </div>
  );
}

/**
 * Which folder this lives in.
 *
 * Filing something used to mean clicking a chip on the tile over and over to
 * cycle through every folder until the right one came round — fine with one
 * folder, tedious with four, and impossible to do deliberately. They are all
 * here at once now, and you tap the one you mean. Tapping the one it is in
 * takes it out again.
 */
function Folders({ item, meta }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const current = meta.folderOf[itemKey(item)] ?? '';

  const create = () => {
    const clean = name.trim();
    if (!clean) return setAdding(false);
    meta.addFolder(clean);
    // Straight into the folder it was made for: making one and then having to
    // find it in the row to use it is two steps where there is only one thought.
    meta.setFolder(item, clean.slice(0, 18));
    setName('');
    return setAdding(false);
  };

  return (
    <section>
      <p className="t-label text-moon/45">Folder</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill on={!current} onClick={() => meta.setFolder(item, '')}>
          Loose
        </Pill>
        {meta.folders.map((f) => (
          <Pill key={f} on={current === f} onClick={() => meta.setFolder(item, current === f ? '' : f)}>
            {f}
          </Pill>
        ))}
        {adding ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={create}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
              if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="Name it"
            aria-label="New folder name"
            maxLength={18}
            className="w-24 rounded-full border border-accent/35 bg-white/8 px-3 py-1.5 text-[0.75rem] text-moon outline-none placeholder:text-moon/30 focus-visible:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-2.5 py-1.5 text-[0.75rem] font-medium text-moon/45 transition hover:border-white/40 hover:text-moon/80 focus:outline-none"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" /> New
          </button>
        )}
      </div>
    </section>
  );
}

/** Icon, zoom, browser and corner mark — everything a link can be told. */
function SiteControls({ site, onChange }) {
  const [browsers, setBrowsers] = useState([]);
  const [choices, setChoices] = useState([]);
  const [broken, setBroken] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const icon = { ...DEFAULT_ICON, ...(site.icon ?? {}) };
  const setIcon = (patch) => onChange({ ...site, icon: { ...icon, ...patch } });

  useEffect(() => {
    api.launch
      .browsers()
      .then((d) => setBrowsers(d.browsers ?? []))
      .catch(() => setBrowsers([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setBroken(new Set());
    api.launch
      .siteIcon(site.url)
      .then((d) => alive && setChoices((d.icons ?? []).map((i) => api.launch.siteIconUrl(i.url))))
      .catch(() => alive && setChoices([]));
    return () => {
      alive = false;
    };
  }, [site.url]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      setIcon({ src: await toIconDataUrl(file) });
    } finally {
      setBusy(false);
    }
  };

  const live = choices.filter((src) => !broken.has(src));

  return (
    <>
      <section>
        <div className="flex items-center justify-between">
          <p className="t-label text-moon/45">Icon</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.75rem] font-semibold text-moon/60 transition hover:bg-white/10 hover:text-moon focus:outline-none"
            >
              <ImageUp className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Reading…' : 'Upload'}
            </button>
            {site.icon?.src ? (
              <button
                type="button"
                onClick={() => onChange({ ...site, icon: undefined })}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.75rem] font-semibold text-moon/45 transition hover:text-moon focus:outline-none"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Auto
              </button>
            ) : null}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {live.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setIcon({ src })}
              aria-label="Use this icon"
              className={[
                'grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white/8 p-1 transition focus:outline-none',
                icon.src === src ? 'ring-2 ring-accent/70' : 'ring-1 ring-white/10 hover:ring-white/30',
              ].join(' ')}
            >
              <img
                src={src}
                alt=""
                onError={() => setBroken((prev) => new Set(prev).add(src))}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
          {!live.length ? (
            <p className="text-[0.75rem] text-moon/35">Looking for what {hostOf(site.url)} publishes…</p>
          ) : null}
        </div>

        <label className="mt-3 block">
          <span className="flex items-baseline justify-between text-[0.75rem] text-moon/45">
            Zoom
            <span className="clock-figures">{icon.zoom.toFixed(2)}×</span>
          </span>
          <input
            type="range"
            min="0.6"
            max="2.4"
            step="0.02"
            value={icon.zoom}
            onChange={(e) => setIcon({ zoom: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>
      </section>

      <section>
        <p className="t-label text-moon/45">Opens in</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill on={!site.browser} onClick={() => onChange({ ...site, browser: undefined })}>
            Default
          </Pill>
          {browsers.map((b) => (
            <Pill key={b.id} on={site.browser === b.name} onClick={() => onChange({ ...site, browser: b.name })}>
              <AppIcon app={b.name} className="h-4 w-4" />
              {b.name}
            </Pill>
          ))}
        </div>
      </section>

      <section>
        <p className="t-label text-moon/45">Corner mark</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill on={site.badge !== 'none'} onClick={() => onChange({ ...site, badge: 'browser' })}>
            <Globe className="h-3.5 w-3.5" aria-hidden="true" /> Show what opens it
          </Pill>
          <Pill on={site.badge === 'none'} onClick={() => onChange({ ...site, badge: 'none' })}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Treat as an app
          </Pill>
        </div>
      </section>
    </>
  );
}

function Pill({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.75rem] font-medium transition focus:outline-none',
        on ? 'bg-accent/18 text-accent ring-1 ring-accent/35' : 'bg-white/6 text-moon/55 ring-1 ring-white/10 hover:text-moon/90',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
