// A launchpad item is either a macOS app name (a plain string, opened with
// `open -a`) or a website shortcut ({ url, name }, opened in the browser).
// These helpers normalize the two so the grid, the picker and the Home card can
// all treat them the same.

import { api } from '../api/backendClient.js';

export const isSite = (item) => Boolean(item) && typeof item === 'object' && typeof item.url === 'string';

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return (url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
};

export const itemKey = (item) => (isSite(item) ? `site:${item.url}` : `app:${item}`);
export const itemLabel = (item) => (isSite(item) ? item.name || hostOf(item.url) : item);

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
  if (isSite(item)) return api.launch(undefined, item.url).catch(() => {});
  return api.launch(item).catch(() => {});
}
