import { Check, ChevronDown, Globe, House, ImageUp, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api/backendClient.js';
import LaunchIcon, { AppIcon, BrowserBadge, SiteIcon } from './LaunchIcon.jsx';
import {
  DEFAULT_ICON,
  hostOf,
  isSite,
  itemKey,
  itemLabel,
  normalizeUrl,
  toIconDataUrl,
} from '../services/launchpad/items.js';

const LIMIT = 10;

/**
 * Everything the launchpad is, in one panel.
 *
 * It used to be three: a tab of apps to tick, a tab of websites with their own
 * add row, a tab listing the same things again to choose what Home shows, and
 * then a whole second modal on top of that to set a site up. Four places to go
 * for one list, and the same names written out in three of them.
 *
 * So there is one list now — what is on your launchpad — and everything is done
 * against a row of it. One field adds: type to find an application, paste a
 * link to add a site. Home membership is a toggle on the row rather than a
 * separate inventory of the same items. A site's settings open underneath the
 * row that owns them, which is also the row showing the tile they change.
 */
export default function LaunchpadPanel({ selected, homeKeys, onChange, onHomeChange, onClose }) {
  const [apps, setApps] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null); // itemKey of the site being set up
  const [error, setError] = useState('');

  useEffect(() => {
    api.launch
      .apps()
      .then((d) => setApps(d.apps ?? []))
      .catch(() => setApps([]));
  }, []);

  const full = selected.length >= LIMIT;
  const onPad = new Set(selected.map(itemKey));
  // A selection of null means Home is still following the launchpad's first
  // twelve, which is what it did before the two could differ.
  const homeList = Array.isArray(homeKeys) ? homeKeys : selected.slice(0, 12).map(itemKey);
  const onHome = new Set(homeList);

  const add = (item) => {
    if (full || onPad.has(itemKey(item))) return;
    onChange([...selected, item]);
    setError('');
  };
  const remove = (item) => {
    const k = itemKey(item);
    onChange(selected.filter((i) => itemKey(i) !== k));
    onHomeChange(homeList.filter((x) => x !== k));
  };
  const toggleHome = (item) => {
    const k = itemKey(item);
    onHomeChange(onHome.has(k) ? homeList.filter((x) => x !== k) : [...homeList, k]);
  };
  const patch = (item, next) => {
    const k = itemKey(item);
    onChange(selected.map((i) => (itemKey(i) === k ? next : i)));
  };

  // One field, two jobs. Something with a dot in it that isn't an installed
  // app's name is a link; anything else is a search.
  const typed = query.trim();
  const looksLikeLink = /\./.test(typed) && !/\s/.test(typed);
  const matches = useMemo(() => {
    if (!typed || looksLikeLink) return [];
    const q = typed.toLowerCase();
    return (apps ?? []).filter((a) => a.name.toLowerCase().includes(q) && !onPad.has(`app:${a.name}`)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPad is derived from `selected`
  }, [apps, typed, looksLikeLink, selected]);

  const addLink = () => {
    const url = normalizeUrl(typed);
    if (!url) {
      setError('That does not look like a web address.');
      return;
    }
    if (selected.some((i) => isSite(i) && i.url === url)) {
      setError('That is already on your launchpad.');
      return;
    }
    if (full) {
      setError(`Room for ${LIMIT}. Remove something first.`);
      return;
    }
    const site = { url, name: hostOf(url) };
    onChange([...selected, site]);
    setOpen(itemKey(site)); // straight into its settings, where you already are
    setQuery('');
    setError('');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md" aria-hidden="true" />

      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl">
        <div className="shrink-0 px-6 pb-3 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="t-label text-accent/80">Launchpad</p>
              {/* A count, not a score. It used to read "15 of 10", which looks
                  like something is wrong when the limit is only advisory. */}
              <p className="display-type mt-1 text-2xl font-light leading-tight text-moon">
                {selected.length} {selected.length === 1 ? 'thing' : 'things'}
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

          <div className="mt-3 flex items-center gap-2">
            <span className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moon/30" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && looksLikeLink) {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="Find an app, or paste a link"
                aria-label="Find an app or add a link"
                className="w-full rounded-xl border border-white/12 bg-white/8 py-2 pl-9 pr-3 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus-visible:outline-none"
              />
            </span>
            {looksLikeLink ? (
              <button
                type="button"
                onClick={addLink}
                disabled={full}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 disabled:opacity-40 focus:outline-none"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add link
              </button>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-[0.8125rem] text-rose-300">{error}</p> : null}
        </div>

        <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          {/* Anything the search turned up, offered above the list it joins */}
          {matches.map((a) => (
            <button
              key={a.name}
              type="button"
              onClick={() => add(a.name)}
              disabled={full}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.06] disabled:opacity-40 focus:outline-none"
            >
              <AppIcon app={a.name} className="h-8 w-8" />
              <span className="min-w-0 flex-1 truncate text-sm text-moon/85">{a.name}</span>
              <Plus className="h-4 w-4 shrink-0 text-moon/40" aria-hidden="true" />
            </button>
          ))}
          {typed && !looksLikeLink && !matches.length ? (
            <p className="px-2.5 py-6 text-center text-xs text-moon/40">
              No app called &ldquo;{typed}&rdquo;. A web address adds a link instead.
            </p>
          ) : null}

          {matches.length ? <div className="my-2 h-px bg-white/10" aria-hidden="true" /> : null}

          {selected.length === 0 ? (
            <p className="px-2.5 py-10 text-center text-xs leading-relaxed text-moon/40">
              Nothing yet. Search for an application, or paste a web address.
            </p>
          ) : (
            selected.map((item) => {
              const k = itemKey(item);
              const site = isSite(item);
              const expanded = open === k;
              return (
                <div key={k} className={`rounded-xl transition ${expanded ? 'bg-white/[0.06]' : ''}`}>
                  <div className="flex items-center gap-3 px-2.5 py-2">
                    <span className="relative block h-8 w-8 shrink-0">
                      <LaunchIcon item={item} className="h-full w-full" />
                      <BrowserBadge item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-moon/90">{itemLabel(item)}</span>
                      <span className="block truncate text-[0.75rem] text-moon/35">
                        {site ? (item.browser ? `${hostOf(item.url)} · ${item.browser}` : hostOf(item.url)) : 'Application'}
                      </span>
                    </span>

                    {/* Home membership, where the item is, not in a list of its own */}
                    <button
                      type="button"
                      onClick={() => toggleHome(item)}
                      aria-pressed={onHome.has(k)}
                      title={onHome.has(k) ? 'Showing on Home' : 'Not on Home'}
                      className={[
                        'grid h-7 w-7 shrink-0 place-items-center rounded-lg transition focus:outline-none',
                        onHome.has(k) ? 'bg-accent/18 text-accent ring-1 ring-accent/30' : 'text-moon/30 hover:bg-white/10 hover:text-moon/70',
                      ].join(' ')}
                    >
                      <House className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    {site ? (
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : k)}
                        aria-expanded={expanded}
                        aria-label={`Set up ${itemLabel(item)}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-moon/35 transition hover:bg-white/10 hover:text-moon focus:outline-none"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => remove(item)}
                      aria-label={`Remove ${itemLabel(item)}`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-moon/30 transition hover:bg-white/10 hover:text-rose-300 focus:outline-none"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  {expanded ? <SiteSettings site={item} onChange={(next) => patch(item, next)} /> : null}
                </div>
              );
            })
          )}
        </div>

        <p className="shrink-0 border-t border-white/10 px-6 py-3 text-[0.75rem] text-moon/38">
          The house marks what Home shows.{' '}
          {Array.isArray(homeKeys) ? (
            <button
              type="button"
              onClick={() => onHomeChange(null)}
              className="font-semibold text-moon/60 transition hover:text-moon"
            >
              Follow the launchpad instead
            </button>
          ) : (
            'Right now it follows this list.'
          )}
        </p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A site's own settings, under the row that owns them.
 *
 * Inline rather than in a modal of its own: the thing being changed is the tile
 * three inches above, and covering it up to change it was the worst part of
 * the old arrangement.
 */
function SiteSettings({ site, onChange }) {
  const [browsers, setBrowsers] = useState([]);
  const [choices, setChoices] = useState([]);
  const [broken, setBroken] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const icon = { ...DEFAULT_ICON, ...(site.icon ?? {}) };

  useEffect(() => {
    api.launch
      .browsers()
      .then((d) => setBrowsers(d.browsers ?? []))
      .catch(() => setBrowsers([]));
  }, []);

  useEffect(() => {
    let alive = true;
    api.launch
      .siteIcon(site.url)
      .then((d) => alive && setChoices((d.icons ?? []).map((i) => api.launch.siteIconUrl(i.url))))
      .catch(() => alive && setChoices([]));
    return () => {
      alive = false;
    };
  }, [site.url]);

  const setIcon = (patch) => onChange({ ...site, icon: { ...icon, ...patch } });

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
    <div className="space-y-4 border-t border-white/10 px-3 pb-4 pt-3">
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
          {!live.length ? <p className="text-[0.75rem] text-moon/35">Looking for what {hostOf(site.url)} publishes…</p> : null}
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
    </div>
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

export { SiteIcon };
