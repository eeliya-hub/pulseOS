// What the launchpad's search box can do: find an app anywhere in your
// Applications folders, open one of your saved sites, go straight to a web
// address you typed, or hand the whole thing to Google.
//
// The app list comes from the backend, which walks /Applications,
// /Applications/Utilities, /System/Applications and ~/Applications — so it finds
// things that were never added to the launchpad.

import { hostOf, isSite, itemLabel, normalizeUrl } from './items.js';

const DOMAIN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

export const googleUrl = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/**
 * Rank a name against a query: an exact match beats a prefix match beats a match
 * buried in the middle, and among equals the shorter name wins. Without this
 * "mail" put Mailtrap above Mail.
 */
function score(name, q) {
  const lower = name.toLowerCase();
  const at = lower.indexOf(q);
  if (at < 0) return -1;
  if (lower === q) return 1000;
  return (at === 0 ? 500 : 100 - at) - name.length * 0.1;
}

/**
 * Build the result list for a query.
 *
 * @param {string} query        what the user typed
 * @param {Array} installed     [{ name }] every app on the machine
 * @param {Array} launchpad     the user's saved apps + sites
 * @returns {Array} [{ id, kind: 'app'|'site'|'url'|'web', label, sub, item?, url? }]
 */
export function searchResults(query, installed, launchpad) {
  const q = query.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  const out = [];

  // Your own sites first — you saved them, so you mean them.
  launchpad
    .filter(isSite)
    .map((site) => ({ site, s: Math.max(score(site.name || '', lower), score(hostOf(site.url), lower)) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .forEach(({ site }) =>
      out.push({ id: `site:${site.url}`, kind: 'site', label: itemLabel(site), sub: hostOf(site.url), item: site }),
    );

  installed
    .map((app) => ({ app, s: score(app.name, lower) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .forEach(({ app }) =>
      out.push({ id: `app:${app.name}`, kind: 'app', label: app.name, sub: 'Application', item: app.name }),
    );

  if (DOMAIN.test(q)) {
    const url = normalizeUrl(q);
    if (url && !out.some((r) => r.kind === 'site' && r.item.url === url)) {
      out.push({ id: `url:${url}`, kind: 'url', label: hostOf(url), sub: 'Open in your browser', url });
    }
  }

  out.push({ id: 'web', kind: 'web', label: `Search Google for “${q}”`, sub: 'google.com', url: googleUrl(q) });
  return out;
}
