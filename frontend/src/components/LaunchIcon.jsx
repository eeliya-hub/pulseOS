import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { appIdOf, faviconUrl, hasCustomIcon, iconOf, isSite, resolveSiteIcon } from '../services/launchpad/items.js';

/**
 * An app's own macOS icon, served by the backend, with a lettered fallback for
 * the ones whose icon can't be read.
 */
export function AppIcon({ app, className = 'h-11 w-11', style }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`grid ${className} shrink-0 place-items-center rounded-[0.85rem] bg-white/10 font-semibold text-moon/70 shadow-lg`}
      >
        {app.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={api.launch.iconUrl(app)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      style={style}
      className={`${className} shrink-0 object-contain drop-shadow-lg`}
    />
  );
}

/**
 * The icon URL a site should use: the one that was chosen, or the best one the
 * site itself publishes, or the favicon as a last resort.
 *
 * Resolution is remembered for the session so a grid of twenty tiles asks about
 * each host once rather than once per render.
 */
const resolved = new Map(); // host → url | null
function useSiteIcon(item) {
  const chosen = item?.icon?.src || null;
  const url = item?.url ?? '';
  const [best, setBest] = useState(() => (chosen ? null : (resolved.get(url) ?? null)));

  useEffect(() => {
    if (chosen || !url) return undefined;
    if (resolved.has(url)) {
      setBest(resolved.get(url));
      return undefined;
    }
    let alive = true;
    resolveSiteIcon(url).then((found) => {
      resolved.set(url, found);
      if (alive) setBest(found);
    });
    return () => {
      alive = false;
    };
  }, [chosen, url]);

  return chosen ?? best ?? (url ? faviconUrl(url, 128) : null);
}

/**
 * A website shortcut's tile.
 *
 * Two ways for it to look, and which one is a choice rather than a consequence
 * of where the artwork came from:
 *
 * - Left alone, it is plainly a link: a small mark centred on a soft tile.
 * - Given an icon of its own, it fills the tile edge to edge like an
 *   application does, with no ring around it — the ring was the white line that
 *   made an uploaded logo look pasted on rather than cut to shape.
 *
 * `zoom` crops into the artwork, because logos are published with wildly
 * different amounts of air around them and the only person who can say how much
 * is too much is the one looking at it.
 */
export function SiteIcon({ item, url, className = 'h-11 w-11' }) {
  const site = item ?? (url ? { url } : null);
  const [failed, setFailed] = useState(null); // the src that didn't load, if any
  const src = useSiteIcon(site);
  const { zoom, x, y, bg } = iconOf(site);
  const custom = hasCustomIcon(site);

  // Keyed on the address rather than a bare flag: the icon starts as the
  // favicon and is replaced once the site's own is resolved, and a failure of
  // the first must not condemn the second.
  if (!src || failed === src) {
    return (
      <span
        className={`grid ${className} shrink-0 place-items-center rounded-[0.85rem] bg-white/10 shadow-lg ring-1 ring-white/10`}
      >
        <Globe className="h-1/2 w-1/2 text-accent/70" strokeWidth={1.6} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={[
        `grid ${className} shrink-0 place-items-center overflow-hidden rounded-[0.85rem] shadow-lg`,
        // A chosen background replaces the default plate; without either, a
        // custom icon sits bare and an automatic one keeps the soft tile.
        custom || bg ? '' : 'bg-white/10 ring-1 ring-white/10',
      ].join(' ')}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(src)}
        className={custom ? 'h-full w-full object-contain' : 'h-[58%] w-[58%] rounded object-contain'}
        style={
          zoom !== 1 || x || y
            ? { transform: `translate(${x}%, ${y}%) scale(${zoom})`, transformOrigin: 'center' }
            : undefined
        }
      />
    </span>
  );
}

/**
 * The mark in the corner that says a tile is a link and which browser it opens.
 *
 * Off by default for a site given its own icon, because someone who has gone to
 * the trouble of choosing artwork usually wants the thing to sit in the grid as
 * an app, not as a bookmark wearing a badge.
 */
export function BrowserBadge({ item, className = '' }) {
  if (!isSite(item) || item.badge === 'none') return null;
  const browser = item.browser;
  return (
    <span
      className={`pointer-events-none absolute -bottom-0.5 -right-0.5 grid h-[42%] w-[42%] place-items-center overflow-hidden rounded-[0.4rem] bg-[#0b1024] ring-1 ring-white/15 ${className}`}
      title={browser ? `Opens in ${browser}` : 'Opens in your browser'}
    >
      {browser ? (
        <AppIcon app={browser} className="h-full w-full" />
      ) : (
        <Globe className="h-[62%] w-[62%] text-moon/65" strokeWidth={1.8} aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * An application's tile.
 *
 * Its own macOS icon unless one has been chosen for it, which is the honest
 * default: an application already has an icon, and the point of being able to
 * change it is that a handful of them are ugly, not that any of them are
 * missing. Zoom applies either way, because a native icon can have too much air
 * around it too.
 */
export function AppTile({ item, className = 'h-11 w-11' }) {
  const { zoom, x, y, bg } = iconOf(item);
  const custom = hasCustomIcon(item);
  const framed = zoom !== 1 || x || y;

  if (!custom && !bg) {
    return framed ? (
      <span className={`grid ${className} shrink-0 place-items-center overflow-hidden rounded-[0.85rem]`}>
        <AppIcon app={appIdOf(item)} className="h-full w-full" style={{ transform: `translate(${x}%, ${y}%) scale(${zoom})` }} />
      </span>
    ) : (
      <AppIcon app={appIdOf(item)} className={className} />
    );
  }

  const style = framed ? { transform: `translate(${x}%, ${y}%) scale(${zoom})` } : undefined;
  return (
    <span
      className={`grid ${className} shrink-0 place-items-center overflow-hidden rounded-[0.85rem] drop-shadow-lg`}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {custom ? (
        <img src={item.icon.src} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" style={style} />
      ) : (
        <AppIcon app={appIdOf(item)} className="h-full w-full" style={style} />
      )}
    </span>
  );
}

/** Either of the two, chosen by the item's shape. */
export default function LaunchIcon({ item, className }) {
  return isSite(item) ? <SiteIcon item={item} className={className} /> : <AppTile item={item} className={className} />;
}
