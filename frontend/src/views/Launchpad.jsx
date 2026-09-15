import { Check, Globe, Pin, Plus, Search, Settings2, Star, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GlassCard from '../components/GlassCard.jsx';
import LaunchIcon, { AppIcon, SiteIcon } from '../components/LaunchIcon.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
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

const ago = (at) => {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

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
          'relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] px-2 py-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          'group-data-[dragging]:border-white/30 group-data-[dragging]:bg-white/[0.11] group-data-[dragging]:shadow-[0_26px_50px_-12px_rgba(3,5,16,0.75)]',
          // Room at the bottom for the folder chip, so it isn't sat on the name.
          editing ? 'pb-9' : '',
        ].join(' ')}
        style={{ boxShadow: `0 12px 34px -18px ${rgba(accent, launching ? 0.95 : 0.45)}` }}
      >
        {/* The app's colour, pooled under its icon. Faint at rest so the grid
            reads as a spectrum; full on hover so the target is unmistakable. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(120% 78% at 50% 8%, ${rgba(accent, 0.34)} 0%, ${rgba(accent, 0.09)} 45%, transparent 72%)`,
            opacity: launching ? 1 : undefined,
          }}
        />
        <LaunchIcon
          item={item}
          className="relative h-[2.85rem] w-[2.85rem] transition-transform duration-300 group-hover:scale-[1.08]"
        />
        <span className="relative w-full truncate px-1 text-center text-[0.6875rem] font-medium text-white/55 transition-colors group-hover:text-white/95">
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
            className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-rose-300/25 text-rose-100 ring-1 ring-rose-200/40 backdrop-blur transition hover:bg-rose-300/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onPin}
            data-no-drag=""
            aria-label={pinned ? `Stop highlighting ${label}` : `Highlight ${label}`}
            className={`absolute left-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full ring-1 backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              pinned
                ? 'bg-cyan-200/35 text-cyan-50 ring-cyan-200/50'
                : 'bg-black/45 text-white/50 ring-white/15 hover:text-white'
            }`}
          >
            <Pin className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCycleFolder}
            data-no-drag=""
            aria-label={`Move ${label} to another folder`}
            className="absolute inset-x-2 bottom-1.5 z-10 truncate rounded-full bg-black/50 px-2 py-0.5 text-[0.5rem] font-semibold uppercase tracking-[0.14em] text-white/70 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
      <Search className="h-3.5 w-3.5 text-cyan-100/70" aria-hidden="true" />
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
          <h2 className="display-type text-lg font-light text-white/90">Add to your launchpad</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
                tab === id ? 'bg-white/12 text-white/95' : 'text-white/45 hover:text-white/75'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {tab === 'apps' ? (
          <>
            <label className="mt-3 flex shrink-0 items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-white/25">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search installed apps"
                aria-label="Search installed apps"
                className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
              />
            </label>
            <div className="glass-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {installed.length === 0 ? (
                <p className="py-8 text-center text-xs text-white/40">Reading your Applications folders…</p>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-xs text-white/40">No apps match “{query}”.</p>
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
                          on ? 'bg-cyan-200/12 ring-1 ring-cyan-200/25' : 'hover:bg-white/6'
                        }`}
                      >
                        <AppIcon app={name} className="h-7 w-7" />
                        <span className="min-w-0 flex-1 truncate text-xs text-white/80">{name}</span>
                        {on ? <Check className="h-3.5 w-3.5 shrink-0 text-cyan-100" aria-hidden="true" /> : null}
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
                className="w-1/3 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/90 ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-white/25"
              />
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSite()}
                placeholder="figma.com"
                aria-label="Web address"
                className="min-w-0 flex-1 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/90 ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-white/25"
              />
              <button
                type="button"
                onClick={addSite}
                className="shrink-0 rounded-xl bg-cyan-200/15 px-3.5 py-2 text-xs font-semibold text-cyan-50 ring-1 ring-cyan-200/25 transition hover:bg-cyan-200/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Add
              </button>
            </div>
            {error ? <p className="mt-2 text-[0.6875rem] text-rose-200/85">{error}</p> : null}

            <div className="mt-3 space-y-1.5">
              {sites.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">
                  No sites yet — add one above and it gets a tile like any app.
                </p>
              ) : (
                sites.map((site) => (
                  <div key={site.url} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2">
                    <Globe className="h-4 w-4 shrink-0 text-cyan-100/60" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/80">{site.name}</span>
                    <span className="hidden truncate text-[0.625rem] text-white/35 sm:block">{hostOf(site.url)}</span>
                    <button
                      type="button"
                      onClick={() => onChange(selected.filter((i) => !(isSite(i) && i.url === site.url)))}
                      aria-label={`Remove ${site.name}`}
                      className="rounded-lg p-1 text-white/35 transition hover:bg-white/10 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
function HighlightCard({ item, count, onOpen, onChoose }) {
  const accent = useAccent(item);
  return (
    <GlassCard delay={60} noPadding className="group relative overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(90% 120% at 12% 50%, ${rgba(accent, 0.32)} 0%, transparent 72%)` }}
      />
      <button
        type="button"
        onClick={onChoose}
        aria-label="Choose a different app to highlight"
        className="absolute right-2 top-2 z-10 rounded-lg px-2 py-1 text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-white/0 transition hover:bg-white/10 hover:text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 group-hover:text-white/45"
      >
        Change
      </button>
      <div className="relative flex h-full items-center gap-4 px-4 py-4">
        <LaunchIcon item={item} className="h-[3.75rem] w-[3.75rem] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[0.5rem] font-semibold uppercase tracking-[0.24em] text-white/40">Highlighted</p>
          <p className="truncate text-base font-medium text-white/95">{itemLabel(item)}</p>
          <button
            type="button"
            onClick={onOpen}
            className="self-start rounded-lg px-3 py-1.5 text-[0.6875rem] font-semibold text-white/90 ring-1 transition hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{ background: rgba(accent, 0.2), '--tw-ring-color': rgba(accent, 0.4) }}
          >
            {count ? `Open · ${count}\u00d7` : 'Open'}
          </button>
        </div>
      </div>
    </GlassCard>
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
          <h2 className="display-type text-lg font-light text-white/90">Highlight an app</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
                    on ? 'bg-cyan-200/12 ring-1 ring-cyan-200/25' : 'hover:bg-white/6'
                  }`}
                >
                  <LaunchIcon item={item} className="h-8 w-8" />
                  <span className="w-full truncate text-center text-[0.625rem] text-white/70">{itemLabel(item)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {current ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mt-3 shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-white/45 transition hover:bg-white/8 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
    <GlassCard delay={100} className="flex min-h-0 flex-col overflow-hidden">
      <p className="shrink-0 text-[0.5rem] font-semibold uppercase tracking-[0.24em] text-white/40">Saved websites</p>
      <div
        ref={sort.setScroller}
        className="glass-scroll mt-2 flex min-h-0 flex-1 items-center gap-2 overflow-x-auto"
      >
        {sites.map((site, i) => (
          <div
            key={site.url}
            {...sort.itemProps(i)}
            className="group relative shrink-0 cursor-pointer select-none active:cursor-grabbing data-[dragging]:cursor-grabbing"
          >
            <button
              type="button"
              onClick={() => onOpen(site)}
              aria-label={`Open ${itemLabel(site)}`}
              className="flex w-[5.5rem] flex-col items-center gap-1.5 rounded-xl px-1.5 py-2 transition hover:-translate-y-0.5 hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 group-data-[dragging]:bg-white/12 group-data-[dragging]:shadow-[0_20px_40px_-12px_rgba(3,5,16,0.75)] group-data-[dragging]:ring-1 group-data-[dragging]:ring-white/25"
            >
              <SiteIcon url={site.url} className="h-9 w-9" />
              <span className="w-full truncate text-center text-[0.625rem] text-white/55 transition group-hover:text-white/90">
                {launching === itemKey(site) ? 'Opening…' : itemLabel(site)}
              </span>
            </button>
            {editing ? (
              <button
                type="button"
                onClick={() => onRemove(site)}
                data-no-drag=""
                aria-label={`Remove ${itemLabel(site)}`}
                className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-full bg-rose-300/25 text-rose-100 ring-1 ring-rose-200/40 backdrop-blur transition hover:bg-rose-300/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          aria-label="Save a website"
          className="flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/12 px-1.5 py-2 text-white/30 transition hover:border-white/25 hover:bg-white/5 hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <span className="grid h-9 w-9 place-items-center">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[0.625rem] font-medium">Add site</span>
        </button>
      </div>
    </GlassCard>
  );
}

/** Bottom-left: the last things you opened, newest first. */
function RecentCard({ recents, usage, onOpen }) {
  return (
    <GlassCard delay={140} className="flex min-h-0 flex-col overflow-hidden">
      <p className="shrink-0 text-[0.5rem] font-semibold uppercase tracking-[0.24em] text-white/40">Recently opened</p>
      <div className="glass-scroll mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {recents.length === 0 ? (
          <p className="pt-6 text-center text-[0.6875rem] leading-relaxed text-white/35">
            Open something and it lands here.
          </p>
        ) : (
          recents.map((item) => (
            <button
              key={itemKey(item)}
              type="button"
              onClick={() => onOpen(item)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <LaunchIcon item={item} className="h-7 w-7" />
              <span className="min-w-0 flex-1 truncate text-xs text-white/75">{itemLabel(item)}</span>
              <span className="shrink-0 text-[0.5625rem] text-white/30">{ago(usage[itemKey(item)].lastAt)}</span>
            </button>
          ))
        )}
      </div>
    </GlassCard>
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

  const recents = useMemo(
    () =>
      [...items]
        .filter((i) => meta.usage[itemKey(i)]?.lastAt)
        .sort((a, b) => meta.usage[itemKey(b)].lastAt - meta.usage[itemKey(a)].lastAt)
        .slice(0, 8),
    [items, meta.usage],
  );

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
    <div className="relative flex h-full flex-col gap-3">
      <ViewHeader
        lead="Launch"
        accent="pad"
        subtitle={`${apps.length} apps · ${sites.length} sites`}
        action={
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? 'Done arranging' : 'Arrange launchpad'}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
              editing
                ? 'bg-cyan-200/15 text-cyan-50 ring-1 ring-cyan-200/25'
                : 'text-white/40 hover:bg-white/8 hover:text-white/80'
            }`}
          >
            {editing ? 'Done' : <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        }
      />

      {/* ── Search: apps anywhere on the machine, your saved sites, a typed
             address, or Google. ── */}
      <div className="relative z-20 shrink-0">
        <label className="theme-card flex items-center gap-2.5 rounded-2xl px-4 py-2.5 focus-within:border-white/25">
          <Search className="h-4 w-4 shrink-0 text-white/35" aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search your Mac, open a site, or search the web…"
            aria-label="Search apps, websites and the web"
            className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/30 focus:outline-none"
          />
          {query ? (
            <span className="hidden shrink-0 items-center gap-1.5 text-[0.625rem] text-white/40 md:flex">
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-white/60">↑↓</kbd>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-white/60">↵</kbd>
            </span>
          ) : null}
        </label>

        {query.trim() ? (
          <div className="theme-popover glass-scroll fade-in absolute inset-x-0 top-full z-30 mt-1.5 max-h-[24rem] overflow-y-auto rounded-2xl p-1.5">
            {results.map((result, i) => (
              <div key={result.id} className="group/row flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openResult(result)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition focus:outline-none ${
                    i === cursor ? 'bg-white/12' : 'hover:bg-white/6'
                  }`}
                >
                  <ResultIcon result={result} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white/90">{result.label}</span>
                    <span className="block truncate text-[0.625rem] text-white/40">{result.sub}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-white/45">
                    {KIND_LABEL[result.kind]}
                  </span>
                  <span className="flex-1" aria-hidden="true" />
                </button>
                {result.kind === 'app' || result.kind === 'url' ? (
                  <button
                    type="button"
                    onClick={() => addFromSearch(result)}
                    aria-label={`Add ${result.label} to launchpad`}
                    title="Add to launchpad"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/25 opacity-0 transition hover:bg-white/10 hover:text-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 group-hover/row:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── The bento ── */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_2.6fr] grid-rows-[1fr_2.5fr] gap-3">
        {highlight ? (
          <HighlightCard
            item={highlight}
            count={meta.usage[itemKey(highlight)]?.count ?? 0}
            onOpen={() => open(highlight)}
            onChoose={() => setChoosing(true)}
          />
        ) : (
          <GlassCard delay={60} className="grid place-items-center">
            <button
              type="button"
              onClick={() => items.length && setChoosing(true)}
              disabled={items.length === 0}
              className="rounded-xl px-4 py-3 text-center text-xs text-white/40 transition enabled:hover:bg-white/6 enabled:hover:text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {items.length ? (
                <>
                  <Star className="mx-auto mb-1.5 h-4 w-4" aria-hidden="true" />
                  Highlight an app →
                </>
              ) : (
                'Nothing on the launchpad yet.'
              )}
            </button>
          </GlassCard>
        )}

        <SitesCard
          sites={sites}
          sort={siteSort}
          launching={launching}
          editing={editing}
          onOpen={open}
          onRemove={remove}
          onAdd={() => setAdding('sites')}
        />

        <RecentCard recents={recents} usage={meta.usage} onOpen={open} />

        {/* Apps, filed into the folders the user made. */}
        <GlassCard delay={180} className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {[[ALL, 'All'], ...meta.folders.map((f) => [f, f])].map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFolder(id)}
                className={`rounded-full px-3 py-1 text-[0.6875rem] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                  folder === id
                    ? 'bg-white/14 text-white/95 ring-1 ring-white/20'
                    : 'text-white/40 hover:bg-white/6 hover:text-white/75'
                }`}
              >
                {name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const name = window.prompt('Name the folder');
                if (name) meta.addFolder(name);
              }}
              className="rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold text-cyan-100/55 transition hover:bg-white/6 hover:text-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              + Folder
            </button>
            {editing && meta.folders.includes(folder) ? (
              <button
                type="button"
                onClick={() => {
                  meta.removeFolder(folder);
                  setFolder(ALL);
                }}
                className="rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold text-rose-200/60 transition hover:text-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Delete folder
              </button>
            ) : null}
          </div>

          {/* Symmetric breathing room: padding on the scroller rather than a top
              margin, so the gap under the tabs matches the gap at the bottom. */}
          <div ref={appSort.setScroller} className="glass-scroll min-h-0 flex-1 overflow-y-auto py-2.5 pr-1">
            {visibleApps.length === 0 ? (
              <div className="grid h-full place-items-center">
                <button
                  type="button"
                  onClick={() => setAdding('apps')}
                  className="rounded-xl px-4 py-3 text-xs text-white/40 transition hover:bg-white/6 hover:text-white/80"
                >
                  {folder === ALL
                    ? 'No apps yet — add some →'
                    : `Nothing in “${folder}” yet — arrange, then tap a tile's folder chip.`}
                </button>
              </div>
            ) : (
              // Centred in the space under the tabs, so a part-full last row
              // leaves the same gap below the grid as there is above it.
              // `min-h-full` on a flex column is the safe way to do that inside a
              // scroller: once the grid is taller than the card the wrapper grows
              // to fit, so justify-center stops applying rather than clipping the
              // first row out of reach.
              <div className="flex min-h-full flex-col justify-center">
              <div className="grid grid-cols-4 gap-2.5 md:grid-cols-5 xl:grid-cols-6">
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
                  className="flex min-h-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/12 text-white/30 transition hover:border-white/25 hover:bg-white/5 hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  <span className="text-[0.625rem] font-medium">Add</span>
                </button>
              </div>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

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
