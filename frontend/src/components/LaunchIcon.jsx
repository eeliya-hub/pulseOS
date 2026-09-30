import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { appIdOf, faviconUrl, hasCustomIcon, iconOf, isSite, resolveSiteIcon } from '../services/launchpad/items.js';

/**
 * How much of a tile an icon's body fills.
 *
 * Everything on the launchpad is drawn to this one measure, because it was not:
 * a favicon sat at 58% of its tile, an uploaded image filled 100% of the same
 * tile, and the two next to each other looked like two different grids.
 *
 * 82% is not arbitrary. macOS icons are drawn on Apple's grid, where the body
 * of the icon occupies about four fifths of its canvas and the rest is
 * deliberate transparent margin — so an application's icon rendered at full
 * size already presents a body of roughly this width. Giving everything else
 * the same body is what makes them match.
 */
const BODY = '82%';

/**
 * The square an icon's artwork lives in: same size for every kind of tile,
 * centred, and carrying the background when one has been chosen.
 */
function Body({ className, bg, plated, children }) {
  return (
    <span className={`grid ${className} shrink-0 place-items-center`}>
      <span
        className={[
          'grid place-items-center overflow-hidden rounded-[22%]',
          bg ? 'shadow-lg' : '',
          // The soft tile a link gets when nobody has chosen anything for it.
          !bg && plated ? 'bg-white/10 shadow-lg ring-1 ring-white/10' : '',
        ].join(' ')}
        style={{ width: BODY, height: BODY, backgroundColor: bg || undefined }}
      >
        {children}
      </span>
    </span>
  );
}

/** The artwork itself, framed by whatever zoom and offset it has been given. */
function Art({ src, icon, onError }) {
  const { zoom, x, y } = icon;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={onError}
      className="h-full w-full object-contain"
      style={
        zoom !== 1 || x || y
          ? { transform: `translate(${x}%, ${y}%) scale(${zoom})`, transformOrigin: 'center' }
          : undefined
      }
    />
  );
}

/**
 * An app's own macOS icon, served by the backend, with a lettered fallback for
 * the ones whose icon can't be read.
 *
 * Drawn at the full size of whatever box it is given, because Apple's artwork
 * carries its own margin — insetting it again would make every application
 * smaller than every link.
 */
export function AppIcon({ app, className = 'h-11 w-11', style }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <Body className={className} plated>
        <span className="text-[0.9em] font-semibold text-moon/70">{(app || '?').slice(0, 1).toUpperCase()}</span>
      </Body>
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
 * Left alone it is plainly a link — its mark on a soft tile. Given an icon of
 * its own, or a background, it drops the soft tile and sits in the grid the way
 * an application does. Either way its body is the same size as everything
 * else's, which is the whole point.
 */
export function SiteIcon({ item, url, className = 'h-11 w-11' }) {
  const site = item ?? (url ? { url } : null);
  const [failed, setFailed] = useState(null); // the src that didn't load, if any
  const src = useSiteIcon(site);
  const icon = iconOf(site);
  const custom = hasCustomIcon(site);

  // Keyed on the address rather than a bare flag: the icon starts as the
  // favicon and is replaced once the site's own is resolved, and a failure of
  // the first must not condemn the second.
  if (!src || failed === src) {
    return (
      <Body className={className} plated>
        <Globe className="h-1/2 w-1/2 text-accent/70" strokeWidth={1.6} aria-hidden="true" />
      </Body>
    );
  }

  return (
    <Body className={className} bg={icon.bg} plated={!custom}>
      <Art src={src} icon={icon} onError={() => setFailed(src)} />
    </Body>
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
      className={`pointer-events-none absolute bottom-0 right-0 grid h-[38%] w-[38%] place-items-center overflow-hidden rounded-[0.4rem] bg-[#0b1024] ring-1 ring-white/15 ${className}`}
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
  const icon = iconOf(item);
  const custom = hasCustomIcon(item);
  const framed = icon.zoom !== 1 || icon.x || icon.y;

  // The plain case: Apple's own artwork, at full size, already the right body.
  if (!custom && !icon.bg && !framed) return <AppIcon app={appIdOf(item)} className={className} />;

  // Zoomed but still Apple's: the same full-size drawing, cropped to the box.
  if (!custom && !icon.bg) {
    return (
      <span className={`grid ${className} shrink-0 place-items-center overflow-hidden rounded-[18%]`}>
        <AppIcon
          app={appIdOf(item)}
          className="h-full w-full"
          style={{ transform: `translate(${icon.x}%, ${icon.y}%) scale(${icon.zoom})` }}
        />
      </span>
    );
  }

  return (
    <Body className={className} bg={icon.bg}>
      {custom ? (
        <Art src={icon.src} icon={icon} />
      ) : (
        <AppIcon
          app={appIdOf(item)}
          className="h-full w-full"
          style={framed ? { transform: `translate(${icon.x}%, ${icon.y}%) scale(${icon.zoom})` } : undefined}
        />
      )}
    </Body>
  );
}

/** Either of the two, chosen by the item's shape. */
export default function LaunchIcon({ item, className }) {
  return isSite(item) ? <SiteIcon item={item} className={className} /> : <AppTile item={item} className={className} />;
}
