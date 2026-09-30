// A launchpad item is an application or a website shortcut. These helpers
// normalize the two so the grid, the picker and the Home card can all treat
// them the same.
//
//   app:   'Safari'                   — or { app: 'Safari', name?, icon? }
//   site:  { url, name?, icon?, browser?, badge? }
//
//   name?:    what to call it, when its own name isn't what you call it
//   icon?:    { src, zoom, x, y }     a chosen or uploaded image, and how it sits
//   browser?: 'Google Chrome'         which browser opens it (sites only)
//   badge?:   'browser' | 'none'      whether the tile admits it is a link
//
// Every one of those is optional, and absent means the behaviour this had
// before any of them existed. An application is still allowed to be the bare
// string it always was: it becomes an object the moment it is given a name or
// an icon, and `itemKey` is deliberately the same either way, so the folders,
// the usage counts and Home's selection all keep pointing at it.

import { api } from '../api/backendClient.js';

export const isSite = (item) => Boolean(item) && typeof item === 'object' && typeof item.url === 'string';

/** The macOS application name, whichever shape the item is in. */
export const appIdOf = (item) => (typeof item === 'string' ? item : (item?.app ?? ''));

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return (url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
};

export const itemKey = (item) => (isSite(item) ? `site:${item.url}` : `app:${appIdOf(item)}`);
export const itemLabel = (item) =>
  item?.name || (isSite(item) ? hostOf(item.url) : appIdOf(item));

/** The same item as an object, so it can be given a name or an icon. */
export const asEditable = (item) => (typeof item === 'string' ? { app: item } : item);

/**
 * An application with nothing set on it is stored as the bare string it always
 * was. Clearing the last customisation puts it back, so a launchpad that has
 * never been fiddled with reads exactly as it used to.
 */
export function tidyItem(item) {
  if (isSite(item)) return item;
  const { app, name, icon } = item ?? {};
  // Framing counts as customisation even without a picture: an application's
  // own icon can be zoomed, and dropping that because there was no uploaded
  // image threw the setting away the moment it was made.
  const framed = icon && (Boolean(icon.src) || icon.zoom !== 1 || icon.x || icon.y);
  if (!name && !framed) return app;
  return { app, ...(name ? { name } : {}), ...(framed ? { icon } : {}) };
}

export const faviconUrl = (url, size = 128) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=${size}`;

/** Add a scheme if the user typed a bare host, then validate it as http(s). */
export function normalizeUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/**
 * Rewrite the order of a subset of the launchpad.
 *
 * Apps and sites share a single list, and the apps grid can be filtered to one
 * folder, so a drag only ever reorders *some* of it. The reordered members are
 * written back into the exact slots they already occupied — so dragging one app
 * past another can't disturb where the sites, or the apps in another folder, sit
 * in the stored list.
 *
 * @param {Array} all      the whole launchpad
 * @param {string[]} keys  itemKeys of the members being reordered
 * @param {string[]} order the same keys in their new order
 * @returns {Array} a new launchpad list
 */
export function reorderWithin(all, keys, order) {
  const member = new Set(keys);
  const byKey = new Map(all.map((item) => [itemKey(item), item]));
  const slots = all.map((item, i) => (member.has(itemKey(item)) ? i : -1)).filter((i) => i >= 0);
  const ordered = order.map((k) => byKey.get(k)).filter(Boolean);
  if (ordered.length !== slots.length) return all; // stale drag — leave it alone

  const next = [...all];
  slots.forEach((slot, n) => {
    next[slot] = ordered[n];
  });
  return next;
}

/**
 * Open an item — a native app (via the backend's `open -a`) or a website in the
 * default browser. Fails silently if the backend is unreachable: a dead click is
 * better than an error dialog on a dashboard nobody is sitting in front of.
 */
export function launchItem(item) {
  if (isSite(item)) return api.launch(undefined, item.url, item.browser).catch(() => {});
  return api.launch(appIdOf(item)).catch(() => {});
}

/**
 * The items Home should show, out of the whole launchpad.
 *
 * Home and the Launchpad tab used to be the same list, with Home showing its
 * first twelve — so the only way to change what was on the home screen was to
 * reorder the launchpad. They are separable now, and `keys` is the separation:
 * itemKeys, in the order Home should draw them. A key for something since
 * removed is skipped rather than drawn as a hole.
 *
 * @param {Array} launchpad the whole list
 * @param {string[]|null} keys the Home selection, or null for "the first few"
 */
export function homeItems(launchpad, keys, limit = 12) {
  const all = launchpad ?? [];
  if (!Array.isArray(keys)) return all.slice(0, limit);
  const byKey = new Map(all.map((item) => [itemKey(item), item]));
  return keys.map((k) => byKey.get(k)).filter(Boolean).slice(0, limit);
}

/* ── Icons ──────────────────────────────────────────────────────── */

/** The default framing for an icon: filling its tile, centred, unzoomed. */
export const DEFAULT_ICON = { src: '', zoom: 1, x: 0, y: 0 };

/** How a site's icon should be drawn, whatever it was given. */
export const iconOf = (item) => ({ ...DEFAULT_ICON, ...(item?.icon ?? {}) });

/** True when someone has chosen this item's icon rather than letting it guess. */
export const hasCustomIcon = (item) => Boolean(item?.icon?.src);

/**
 * The best icon a site publishes, resolved by the backend.
 *
 * Google's favicon service is a 32px image upscaled to whatever you ask for,
 * and blank for anything it hasn't crawled. Sites declare far better icons in
 * their own HTML, so we read those and keep Google as the last resort.
 */
export const resolveSiteIcon = (url) =>
  api.launch
    .siteIcon(url)
    .then((d) => (d?.best ? api.launch.siteIconUrl(d.best) : null))
    .catch(() => null);

/**
 * Shrink an uploaded image to one tile's worth of pixels, square, transparent
 * where the image doesn't reach.
 *
 * Icons the user supplies arrive at whatever size their screenshot was, and
 * storing those verbatim both blows the settings out and leaves a tile whose
 * artwork is a different scale from every tile beside it. A square canvas at
 * the size the grid actually draws makes an uploaded image an icon rather than
 * a picture: `contain` so nothing is cropped, and no fill, so a logo on
 * transparency stays on transparency instead of gaining the white card its
 * source had.
 */
export function toIconDataUrl(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
