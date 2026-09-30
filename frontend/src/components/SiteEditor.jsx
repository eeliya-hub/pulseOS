import { Check, Globe, ImageUp, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api/backendClient.js';
import { AppIcon } from './LaunchIcon.jsx';
import { DEFAULT_ICON, faviconUrl, hostOf, normalizeUrl, toIconDataUrl } from '../services/launchpad/items.js';

/**
 * Everything about one website shortcut that isn't its address.
 *
 * A link used to be a name and a URL, drawn as whatever favicon Google had.
 * This is where the other decisions live: which picture, how far into it, which
 * browser opens it, and whether the tile admits it is a link at all.
 */
export default function SiteEditor({ site, onSave, onClose }) {
  const [name, setName] = useState(site.name ?? '');
  const [url, setUrl] = useState(site.url ?? '');
  const [icon, setIcon] = useState({ ...DEFAULT_ICON, ...(site.icon ?? {}) });
  const [browser, setBrowser] = useState(site.browser ?? '');
  const [badge, setBadge] = useState(site.badge ?? 'browser');
  const [browsers, setBrowsers] = useState([]);
  const [choices, setChoices] = useState([]);
  // A site can declare an icon it no longer serves. Offering a broken image as
  // a choice is worse than offering one fewer, so a candidate that fails to
  // load is dropped rather than shown as a torn-paper glyph.
  const [broken, setBroken] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    api.launch
      .browsers()
      .then((d) => setBrowsers(d.browsers ?? []))
      .catch(() => setBrowsers([]));
  }, []);

  // Everything this site publishes, so choosing an icon is picking from what is
  // there rather than hoping the automatic one was the good one.
  useEffect(() => {
    const target = normalizeUrl(url);
    if (!target) return undefined;
    let alive = true;
    api.launch
      .siteIcon(target)
      .then((d) => {
        if (!alive) return;
        setBroken(new Set());
        setChoices((d.icons ?? []).map((i) => i.url));
      })
      .catch(() => alive && setChoices([]));
    return () => {
      alive = false;
    };
  }, [url]);

  const pickFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const src = await toIconDataUrl(file);
      setIcon((prev) => ({ ...prev, src }));
    } catch (e) {
      setError(e.message || 'Could not use that image.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const clean = normalizeUrl(url);
    if (!clean) {
      setError('Enter a valid web address, e.g. figma.com');
      return;
    }
    onSave({
      ...site,
      url: clean,
      name: name.trim() || hostOf(clean),
      // An untouched icon is stored as nothing, so a site that was never fiddled
      // with keeps following its own artwork when that artwork changes.
      icon: icon.src ? icon : undefined,
      browser: browser || undefined,
      badge,
    });
    onClose();
  };

  const preview = icon.src || (normalizeUrl(url) ? faviconUrl(url, 128) : null);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md" aria-hidden="true" />

      <div className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl">
        <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-5">
          <div>
            <p className="t-label text-accent/80">Website</p>
            <p className="display-type mt-1 text-2xl font-light leading-tight text-moon">
              {name || hostOf(url) || 'New link'}
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

        <div className="glass-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
          {/* The tile as it will look, at the size it will be */}
          <div className="flex items-center gap-4 border-y border-white/10 py-4">
            <span className="relative grid h-[3.75rem] w-[3.75rem] shrink-0 place-items-center overflow-hidden rounded-[0.85rem]">
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className={icon.src ? 'h-full w-full object-contain' : 'h-[58%] w-[58%] object-contain'}
                  style={{ transform: `translate(${icon.x}%, ${icon.y}%) scale(${icon.zoom})` }}
                />
              ) : (
                <Globe className="h-1/2 w-1/2 text-accent/70" aria-hidden="true" />
              )}
              {!icon.src ? (
                <span className="pointer-events-none absolute inset-0 rounded-[0.85rem] bg-white/10 ring-1 ring-white/10 mix-blend-overlay" />
              ) : null}
              {badge !== 'none' ? (
                <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid h-[42%] w-[42%] place-items-center overflow-hidden rounded-[0.4rem] bg-[#0b1024] ring-1 ring-white/15">
                  {browser ? (
                    <AppIcon app={browser} className="h-full w-full" />
                  ) : (
                    <Globe className="h-[62%] w-[62%] text-moon/65" strokeWidth={1.8} aria-hidden="true" />
                  )}
                </span>
              ) : null}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={hostOf(url) || 'Name'}
                aria-label="Name"
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-1.5 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="figma.com"
                aria-label="Web address"
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-1.5 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40"
              />
            </div>
          </div>

          {/* Icon */}
          <section>
            <div className="flex items-center justify-between">
              <p className="t-label text-moon/45">Icon</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="soft-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.75rem] font-semibold text-moon/85"
                >
                  <ImageUp className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Reading…' : 'Upload'}
                </button>
                {icon.src ? (
                  <button
                    type="button"
                    onClick={() => setIcon(DEFAULT_ICON)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.75rem] font-semibold text-moon/50 transition hover:text-moon/85"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Auto
                  </button>
                ) : null}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            {choices.some((src) => !broken.has(src)) ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {choices.filter((src) => !broken.has(src)).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setIcon((prev) => ({ ...prev, src }))}
                    aria-label="Use this icon"
                    className={[
                      'grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white/8 p-1 transition focus:outline-none',
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
              </div>
            ) : (
              <p className="mt-2 text-[0.75rem] text-moon/35">
                Looking for what {hostOf(url) || 'this site'} publishes…
              </p>
            )}

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
                onChange={(e) => setIcon((prev) => ({ ...prev, zoom: Number(e.target.value) }))}
                className="mt-1 w-full accent-[var(--accent,#8ea2ff)]"
              />
            </label>
          </section>

          {/* Which browser */}
          <section>
            <p className="t-label text-moon/45">Opens in</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Choice on={!browser} onClick={() => setBrowser('')}>
                Default
              </Choice>
              {browsers.map((b) => (
                <Choice key={b.name} on={browser === b.name} onClick={() => setBrowser(b.name)}>
                  <AppIcon app={b.name} className="h-4 w-4" />
                  {b.name}
                </Choice>
              ))}
            </div>
          </section>

          {/* Badge */}
          <section>
            <p className="t-label text-moon/45">On the tile</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Choice on={badge !== 'none'} onClick={() => setBadge('browser')}>
                Show what opens it
              </Choice>
              <Choice on={badge === 'none'} onClick={() => setBadge('none')}>
                Treat it as an app
              </Choice>
            </div>
            <p className="mt-1.5 text-[0.75rem] text-moon/35">
              A corner mark says the tile is a link and which browser it opens. Turn it off and the tile sits in the
              grid like any application.
            </p>
          </section>

          {error ? <p className="text-[0.8125rem] text-rose-300">{error}</p> : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-moon/50">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="soft-button inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-moon"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Choice({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition focus:outline-none',
        on ? 'bg-accent/18 text-accent ring-1 ring-accent/35' : 'bg-white/6 text-moon/60 ring-1 ring-white/10 hover:text-moon/90',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
