import { Check, Globe, MoreVertical, Pin, Plus, Search, Settings2, Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LaunchIcon, { AppIcon, SiteIcon } from '../components/LaunchIcon.jsx';
import { ColumnHead, Ground, SkyZone } from '../components/Stage.jsx';
import { useDragSort } from '../hooks/useDragSort.js';
import { useLaunchpadMeta } from '../hooks/useLaunchpadMeta.js';
import { useSettings } from '../hooks/useSettings.js';
import { api } from '../services/api/backendClient.js';
import { hashAccent, iconAccent } from '../services/launchpad/iconAccent.js';
import {
  faviconUrl,
  hostOf,
  isSite,
  itemKey,
  itemLabel,
  launchItem,
  reorderWithin,
  normalizeUrl,
} from '../services/launchpad/items.js';
import { searchResults } from '../services/launchpad/search.js';

const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
const ALL = '__all__';

/**
 * Each tile is lit by its own app's colour, read out of the icon. Resolving that
 * is async and cached, so a tile opens on a colour derived from its name and
 * settles onto the real one a frame or two later — no flash of grey.
 */
function useAccent(item) {
  const label = itemLabel(item);
  const key = itemKey(item);
  const [rgb, setRgb] = useState(() => hashAccent(label));
  useEffect(() => {
    let alive = true;
    const src = isSite(item) ? faviconUrl(item.url) : api.launch.iconUrl(item);
    iconAccent(src, label).then((c) => alive && setRgb(c));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rgb;
}

/* ── Tiles ───────────────────────────────────────────────────────────────── */

function Tile({ item, accent, editing, launching, folder, pinned, drag, onOpen, onRemove, onCycleFolder, onPin }) {
  const label = itemLabel(item);

  return (
    <div
      {...drag}
      className="group relative cursor-pointer select-none active:cursor-grabbing data-[dragging]:cursor-grabbing"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${label}`}
        className={[
          'relative flex w-full flex-col items-center gap-2.5 rounded-[1.25rem] px-2 pb-3 pt-4 transition-colors duration-300 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          'group-data-[dragging]:bg-white/[0.1] group-data-[dragging]:shadow-[0_26px_50px_-12px_rgba(3,5,16,0.75)]',
          // Room at the bottom for the folder chip, so it isn't sat on the name.
          editing ? 'pb-10' : '',
        ].join(' ')}
      >
        {/* The app's own colour, pooled behind its icon — only when you reach it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-3 h-20 w-20 -translate-x-1/2 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: rgba(accent, 0.6), opacity: launching ? 1 : undefined }}
        />
        <LaunchIcon
          item={item}
          className="relative h-[3.75rem] w-[3.75rem] transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-[1.05]"
        />
        <span className="relative w-full truncate px-1 text-center text-[0.8125rem] text-haze transition-colors group-hover:text-moon">
          {launching ? 'Opening…' : label}
        </span>
      </button>

      {editing ? (
        <>
          <button
            type="button"
            onClick={onRemove}
            data-no-drag=""
            aria-label={`Remove ${label}`}
            className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-ink/85 text-moon/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] transition hover:text-fall focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onPin}
            data-no-drag=""
            aria-label={pinned ? `Stop highlighting ${label}` : `Highlight ${label}`}
            className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
              pinned ? 'bg-moon text-ink' : 'bg-ink/85 text-moon/60 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:text-moon'
            }`}
          >
            <Pin className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCycleFolder}
            data-no-drag=""
            aria-label={`Move ${label} to another folder`}
            className="pill absolute inset-x-2 bottom-2 z-10 h-6 truncate px-2 text-[0.8125rem] text-moon/75"
          >
            {folder || 'Loose'}
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Hooks can't be called in a loop, so each tile resolves its own colour. */
function TileWithAccent({ item, ...rest }) {
  const accent = useAccent(item);
  return <Tile item={item} accent={accent} {...rest} />;
}

/* ── Search ──────────────────────────────────────────────────────────────── */

const KIND_LABEL = { app: 'App', site: 'Saved site', url: 'Website', web: 'Web search' };

function ResultIcon({ result }) {
  if (result.kind === 'app') return <AppIcon app={result.item} className="h-8 w-8" />;
  if (result.kind === 'site') return <SiteIcon url={result.item.url} className="h-8 w-8" />;
  if (result.kind === 'url') return <SiteIcon url={result.url} className="h-8 w-8" />;
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[0.6rem] bg-white/10 ring-1 ring-white/10">
      <Search className="h-3.5 w-3.5 text-accent/70" aria-hidden="true" />
    </span>
  );
}

/* ── Add panel ───────────────────────────────────────────────────────────── */

function AddPanel({ selected, installed, initialTab, onChange, onClose }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chosen = new Set(selected.filter((i) => !isSite(i)));
  const sites = selected.filter(isSite);

  const toggleApp = (name) =>
    onChange(chosen.has(name) ? selected.filter((i) => isSite(i) || i !== name) : [...selected, name]);

  const addSite = () => {
    const url = normalizeUrl(siteUrl);
    if (!url) return setError('Enter a valid web address, e.g. figma.com');
    if (selected.some((i) => isSite(i) && i.url === url)) return setError('That site is already saved.');
    onChange([...selected, { url, name: siteName.trim() || hostOf(url) }]);
    setSiteName('');
    setSiteUrl('');
    return setError('');
  };

  const filtered = installed.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="theme-card fade-in flex max-h-[80vh] w-full max-w-[38rem] flex-col overflow-hidden rounded-3xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add to launchpad"
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="display-type text-lg font-light text-moon/90">Add to your launchpad</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-moon/45 transition hover:bg-white/10 hover:text-moon/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex shrink-0 gap-1.5 rounded-xl bg-white/5 p-1">
          {[
            ['apps', 'Applications'],
            ['sites', 'Websites'],
          ].map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                tab === id ? 'bg-white/12 text-moon/95' : 'text-moon/45 hover:text-moon/75'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {tab === 'apps' ? (
          <>
            <label className="mt-3 flex shrink-0 items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-white/25">
              <Search className="h-3.5 w-3.5 shrink-0 text-moon/35" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search installed apps"
                aria-label="Search installed apps"
                className="w-full bg-transparent text-sm text-moon/90 placeholder:text-moon/30 focus:outline-none"
              />
            </label>
            <div className="glass-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {installed.length === 0 ? (
                <p className="py-8 text-center text-xs text-moon/40">Reading your Applications folders…</p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-xs text-moon/40">No apps match “{query}”.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {filtered.map(({ name }) => {
                    const on = chosen.has(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleApp(name)}
                        className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                          on ? 'bg-accent/12 ring-1 ring-accent/25' : 'hover:bg-white/6'
                        }`}
                      >
                        <AppIcon app={name} className="h-7 w-7" />
                        <span className="min-w-0 flex-1 truncate text-xs text-moon/80">{name}</span>
                        {on ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex gap-2">
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Name (optional)"
                aria-label="Site name"
                className="w-1/3 rounded-xl bg-white/5 px-3 py-2 text-sm text-moon/90 ring-1 ring-white/10 placeholder:text-moon/30 focus:outline-none focus:ring-white/25"
              />
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSite()}
                placeholder="figma.com"
                aria-label="Web address"
                className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm text-moon/90 ring-1 ring-white/10 placeholder:text-moon/30 focus:outline-none focus:ring-white/25"
              />
              <button
                type="button"
                onClick={addSite}
                className="shrink-0 rounded-xl bg-accent/15 px-3.5 py-2 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Add
              </button>
            </div>
            {error ? <p className="mt-2 text-[0.8125rem] text-rose-200/85">{error}</p> : null}

            <div className="mt-3 space-y-1.5">
              {sites.length === 0 ? (
                <p className="py-6 text-center text-xs text-moon/40">
                  No sites yet — add one above and it gets a tile like any app.
                </p>
              ) : (
                sites.map((site) => (
                  <div key={site.url} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2">
                    <Globe className="h-4 w-4 shrink-0 text-accent/60" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-moon/80">{site.name}</span>
                    <span className="hidden truncate text-[0.75rem] text-moon/35 sm:block">{hostOf(site.url)}</span>
                    <button
                      type="button"
                      onClick={() => onChange(selected.filter((i) => !(isSite(i) && i.url === site.url)))}
                      aria-label={`Remove ${site.name}`}
                      className="rounded-lg p-1 text-moon/35 transition hover:bg-white/10 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

/** Top-left: the one app you chose to keep front and centre. */
function HighlightCard({ item, onOpen, onChoose }) {
  const accent = useAccent(item);
  const label = itemLabel(item);
  return (
    <div className="relative flex shrink-0 items-center gap-5 pb-1">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: rgba(accent, 0.45) }}
      />

      {/* The whole block is the way in: tap it and the app opens. The menu
          beside it is a sibling, not a child — a button inside a button is
          invalid markup and swallows its own clicks. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${label}`}
        className="group relative -mx-3 -my-2 flex min-w-0 items-center gap-5 rounded-[1.5rem] px-3 py-2 text-left transition-colors duration-300 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <LaunchIcon
          item={item}
          className="h-[5.5rem] w-[5.5rem] shrink-0 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-[1.03]"
        />
        <span className="min-w-0">
          <span className="t-eyebrow block">Highlighted</span>
          <span className="t-title mt-1 block max-w-[15rem] truncate text-[2.125rem]">{label}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={onChoose}
        aria-label="Choose a different app to highlight"
        title="Choose a different app"
        className="pill relative h-8 w-8 shrink-0 px-0 text-moon/70"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Pick which app sits on the highlight card. */
function HighlightPicker({ items, current, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      data-settings=""
      className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="theme-card fade-in flex max-h-[70vh] w-full max-w-[30rem] flex-col overflow-hidden rounded-3xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose the highlighted app"
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="display-type text-lg font-light text-moon/90">Highlight an app</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-moon/45 transition hover:bg-white/10 hover:text-moon/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-4 gap-1.5">
            {items.map((item) => {
              const on = itemKey(item) === current;
              return (
                <button
                  key={itemKey(item)}
                  type="button"
                  onClick={() => onPick(item)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl px-1.5 py-2.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                    on ? 'bg-accent/12 ring-1 ring-accent/25' : 'hover:bg-white/6'
                  }`}
                >
                  <LaunchIcon item={item} className="h-8 w-8" />
                  <span className="w-full truncate text-center text-[0.75rem] text-moon/70">{itemLabel(item)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {current ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mt-3 shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-moon/45 transition hover:bg-white/8 hover:text-moon/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Clear the highlight
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Top-right: the websites you saved, as a row of favicon tiles. */
function SitesCard({ sites, launching, onOpen, onAdd, editing, onRemove, sort }) {
  return (
    <div className="flex shrink-0 flex-col">
      <ColumnHead
        label="Saved websites"
        action={
          <button type="button" onClick={onAdd} aria-label="Save a website" className="pill h-7 w-7 px-0 text-moon/75">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }
      />
      <div ref={sort.setScroller} className="cascade mt-2 grid grid-cols-3 gap-1">
        {sites.map((site, i) => (
          <div
            key={site.url}
            {...sort.itemProps(i)}
            className="group relative cursor-pointer select-none active:cursor-grabbing data-[dragging]:cursor-grabbing"
          >
            <button
              type="button"
              onClick={() => onOpen(site)}
              aria-label={`Open ${itemLabel(site)}`}
              className="flex w-full flex-col items-center gap-1.5 rounded-[1rem] px-1 py-2.5 transition hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 group-data-[dragging]:bg-white/[0.1] group-data-[dragging]:shadow-[0_20px_40px_-12px_rgba(3,5,16,0.75)]"
            >
              <SiteIcon url={site.url} className="h-10 w-10" />
              <span className="w-full truncate text-center text-[0.75rem] text-haze transition group-hover:text-moon">
                {launching === itemKey(site) ? 'Opening…' : itemLabel(site)}
              </span>
            </button>
            {editing ? (
              <button
                type="button"
                onClick={() => onRemove(site)}
                data-no-drag=""
                aria-label={`Remove ${itemLabel(site)}`}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/85 text-moon/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] transition hover:text-fall focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
        {sites.length === 0 ? <p className="col-span-3 px-1 py-2 text-[0.875rem] text-dim">Sites you save sit here.</p> : null}
      </div>
    </div>
  );
}


/* ── View ────────────────────────────────────────────────────────────────── */

export default function Launchpad() {
  const { settings, update } = useSettings();
  const meta = useLaunchpadMeta();
  const items = useMemo(() => settings.launchpad ?? [], [settings.launchpad]);

  // Every app on the machine, not just the saved ones — this is what makes the
  // search box a real launcher rather than a filter over eight tiles.
  const [installed, setInstalled] = useState([]);
  useEffect(() => {
    api.launch
      .apps()
      .then((d) => setInstalled(d.apps ?? []))
      .catch(() => setInstalled([]));
  }, []);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [folder, setFolder] = useState(ALL);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [launching, setLaunching] = useState('');
  const searchRef = useRef(null);

  // It's a launcher: land in it ready to type.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const flash = useCallback((key) => {
    setLaunching(key);
    window.setTimeout(() => setLaunching((current) => (current === key ? '' : current)), 900);
  }, []);

  const open = useCallback(
    (item) => {
      launchItem(item);
      meta.recordLaunch(item);
      flash(itemKey(item));
    },
    [meta, flash],
  );

  const apps = useMemo(() => items.filter((i) => !isSite(i)), [items]);
  const sites = useMemo(() => items.filter(isSite), [items]);

  const results = useMemo(() => searchResults(query, installed, items), [query, installed, items]);
  useEffect(() => setCursor(0), [query]);

  // Opening a search hit: saved things go through the usual path, a typed address
  // or a Google search just opens in the browser.
  const openResult = useCallback(
    (result) => {
      if (!result) return;
      if (result.kind === 'site' || result.kind === 'app') open(result.item);
      else api.launch(undefined, result.url).catch(() => {});
      setQuery('');
    },
    [open],
  );

  const addFromSearch = (result) => {
    const item = result.kind === 'app' ? result.item : { url: result.url, name: hostOf(result.url) };
    if (!items.some((i) => itemKey(i) === itemKey(item))) update({ launchpad: [...items, item] });
    setQuery('');
  };

  const remove = (item) => {
    update({ launchpad: items.filter((i) => itemKey(i) !== itemKey(item)) });
    meta.forget(item);
  };

  // Folders cycle rather than open a menu — one tap per step is quicker than a
  // dropdown when you're filing a dozen apps in a row.
  const cycleFolder = (item) => {
    const ring = ['', ...meta.folders];
    const current = meta.folderOf[itemKey(item)] ?? '';
    meta.setFolder(item, ring[(ring.indexOf(current) + 1) % ring.length]);
  };

  const visibleApps = useMemo(
    () => (folder === ALL ? apps : apps.filter((a) => (meta.folderOf[itemKey(a)] ?? '') === folder)),
    [apps, folder, meta.folderOf],
  );

  // Dropping a tile reorders it among the ones you can see, and writes those
  // back into the slots they already held in the stored list — so reordering
  // apps can't disturb the sites, and reordering inside a folder can't disturb
  // the apps outside it.
  const reorder = useCallback(
    (list) => (from, to) => {
      const keys = list.map(itemKey);
      const order = [...keys];
      order.splice(to, 0, order.splice(from, 1)[0]);
      update({ launchpad: reorderWithin(items, keys, order) });
    },
    [items, update],
  );
  const appSort = useDragSort({ count: visibleApps.length, onReorder: reorder(visibleApps) });
  const siteSort = useDragSort({ count: sites.length, onReorder: reorder(sites) });

  const highlight = items.find((i) => itemKey(i) === meta.highlighted) ?? null;


  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      openResult(results[cursor]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* ── Sky: find anything, and the app you reach for most ─────────────── */}
      <SkyZone className="z-20 flex items-end justify-between gap-10">
        <div className="min-w-0 flex-1">
          <p className="t-lede">
            {apps.length} apps, {sites.length} sites
          </p>
          <h1 className="t-hero mt-1">Launchpad</h1>

          {/* Search: apps anywhere on the machine, your saved sites, a typed
              address, or Google. */}
          <div className="relative mt-6 flex max-w-[46rem] items-center gap-2">
            <label className="relative flex h-14 flex-1 items-center gap-3 rounded-full bg-white/[0.07] px-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] backdrop-blur-xl transition focus-within:bg-white/[0.1] focus-within:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]">
              <Search className="h-5 w-5 shrink-0 text-moon/45" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search your Mac, open a site, or search the web"
                aria-label="Search apps, websites and the web"
                className="w-full bg-transparent text-[1.0625rem] text-moon placeholder:text-moon/40 focus:outline-none"
              />
              {query ? (
                <span className="hidden shrink-0 items-center gap-1.5 text-[0.75rem] text-dim md:flex">
                  <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-moon/60">↑↓</kbd>
                  <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-moon/60">↵</kbd>
                </span>
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-label={editing ? 'Done arranging' : 'Arrange launchpad'}
              className={editing ? 'pill pill-lit h-14 px-5 text-[0.9375rem]' : 'pill h-14 w-14 px-0 text-moon/75'}
            >
              {editing ? 'Done' : <Settings2 className="h-4 w-4" aria-hidden="true" />}
            </button>

            {query.trim() ? (
              <div className="theme-popover glass-scroll launcher-rise absolute inset-x-0 top-full z-30 mt-2 max-h-[24rem] overflow-y-auto rounded-[1.5rem] p-2">
                {results.map((result, i) => (
                  <div key={result.id} className="group/row flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openResult(result)}
                      onMouseEnter={() => setCursor(i)}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition focus:outline-none ${
                        i === cursor ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'
                      }`}
                    >
                      <ResultIcon result={result} />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9375rem] text-moon">{result.label}</span>
                        <span className="block truncate text-[0.75rem] text-dim">{result.sub}</span>
                      </span>
                      <span className="pill ml-auto h-6 shrink-0 px-2.5 text-[0.8125rem] text-moon/60">{KIND_LABEL[result.kind]}</span>
                    </button>
                    {result.kind === 'app' || result.kind === 'url' ? (
                      <button
                        type="button"
                        onClick={() => addFromSearch(result)}
                        aria-label={`Add ${result.label} to launchpad`}
                        title="Add to launchpad"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-moon/30 opacity-0 transition hover:bg-white/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 group-hover/row:opacity-100"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {highlight ? (
          <HighlightCard
            item={highlight}
            onOpen={() => open(highlight)}
            onChoose={() => setChoosing(true)}
          />
        ) : (
          <button
            type="button"
            onClick={() => items.length && setChoosing(true)}
            disabled={items.length === 0}
            className="pill mb-1 h-11 shrink-0 px-5 disabled:opacity-40"
          >
            <Star className="h-4 w-4" aria-hidden="true" />
            {items.length ? 'Highlight an app' : 'Nothing on the launchpad yet'}
          </button>
        )}
      </SkyZone>

      {/* ── Ground: your apps, filed into folders; saved sites and recents ─── */}
      <Ground className="grid grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-h-0 min-w-0 flex-col pr-8 pt-7">
          <div className="col-head justify-start gap-2">
            <div className="pill-group">
              {[[ALL, 'All'], ...meta.folders.map((f) => [f, f])].map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFolder(id)}
                  aria-pressed={folder === id}
                  className="pill h-8 px-3.5 text-[0.8125rem]"
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt('Name the folder');
                if (name) meta.addFolder(name);
              }}
              className="pill h-8 px-3.5 text-[0.8125rem] text-moon/70"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Folder
            </button>
            {editing && meta.folders.includes(folder) ? (
              <button
                type="button"
                onClick={() => {
                  meta.removeFolder(folder);
                  setFolder(ALL);
                }}
                className="pill h-8 px-3.5 text-[0.8125rem] text-fall"
              >
                Delete folder
              </button>
            ) : null}
          </div>

          <div ref={appSort.setScroller} className="glass-scroll mt-3 min-h-0 flex-1 overflow-y-auto pb-4 pr-1">
            {visibleApps.length === 0 ? (
              <button type="button" onClick={() => setAdding('apps')} className="pill mt-3 h-10 px-4">
                {folder === ALL
                  ? 'No apps yet. Add some'
                  : `Nothing in “${folder}” yet. Arrange, then tap a tile's folder chip.`}
              </button>
            ) : (
              <div className="cascade grid grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-1.5">
                {visibleApps.map((item, i) => (
                  <TileWithAccent
                    key={itemKey(item)}
                    item={item}
                    drag={appSort.itemProps(i)}
                    editing={editing}
                    launching={launching === itemKey(item)}
                    folder={meta.folderOf[itemKey(item)] ?? ''}
                    pinned={meta.highlighted === itemKey(item)}
                    onOpen={() => open(item)}
                    onRemove={() => remove(item)}
                    onCycleFolder={() => cycleFolder(item)}
                    onPin={() => meta.toggleHighlight(item)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setAdding('apps')}
                  aria-label="Add apps"
                  className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2.5 rounded-[1.25rem] text-moon/40 transition hover:bg-white/[0.05] hover:text-moon/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <span className="grid h-[3.75rem] w-[3.75rem] place-items-center rounded-[1rem] shadow-[inset_0_0_0_1.5px_rgba(226,230,248,0.18)]">
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-[0.8125rem]">Add</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="ground-rule flex min-h-0 flex-col gap-6 pl-8 pt-7">
          <SitesCard
            sites={sites}
            sort={siteSort}
            launching={launching}
            editing={editing}
            onOpen={open}
            onRemove={remove}
            onAdd={() => setAdding('sites')}
          />
        </div>
      </Ground>

      {choosing ? (
        <HighlightPicker
          items={items}
          current={meta.highlighted}
          onPick={(item) => {
            // Picking the one already highlighted just closes; clearing is the
            // explicit button, so a mis-click can't silently empty the card.
            if (!item) meta.toggleHighlight(null);
            else if (itemKey(item) !== meta.highlighted) meta.toggleHighlight(item);
            setChoosing(false);
          }}
          onClose={() => setChoosing(false)}
        />
      ) : null}

      {adding ? (
        <AddPanel
          selected={items}
          installed={installed}
          initialTab={adding}
          onChange={(next) => update({ launchpad: next })}
          onClose={() => setAdding('')}
        />
      ) : null}
    </div>
  );
}
