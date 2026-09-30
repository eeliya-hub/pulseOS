import { ApiError } from '../../utils/ApiError.js';

/**
 * The best icon a website has to offer.
 *
 * The launchpad used to take whatever Google's favicon service returned, which
 * is a 16 or 32px favicon upscaled: blurry on a tile, and blank for any site
 * Google hasn't crawled. Most sites publish something far better and say so in
 * their own HTML — an apple-touch-icon is 180px square by convention, and a web
 * manifest usually lists a 512px one.
 *
 * So this reads the page, collects every icon it declares, and picks the
 * largest. Google's service stays as the last resort, because a blurry icon
 * beats a grey globe.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const TIMEOUT_MS = 7000;

// Icons are worth holding: a site changes its logo about as often as its name.
const cache = new Map(); // origin → { at, icons }
const TTL_MS = 24 * 60 * 60 * 1000;

// Every icon address resolve() has handed out. The proxy below will only fetch
// from this set, so it is a way to reach icons we found rather than a way to
// make this machine fetch any URL somebody names.
const known = new Set();
const bytes = new Map(); // icon url → { at, buffer, type }

const sizeOf = (spec) => {
  const n = Math.max(0, ...String(spec ?? '').split(/\s+/).map((s) => parseInt(s, 10) || 0));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Whether a URL actually serves an image.
 *
 * Every icon here is a claim: a site declares icons it stopped serving years
 * ago, and /apple-touch-icon.png is a convention rather than a promise —
 * google.com, mail.google.com and amazon.co.uk all 404 on it. Recommending an
 * address without checking is how a tile ends up with a broken-image glyph or a
 * grey globe when a perfectly good favicon was available all along. A HEAD is
 * cheap, and a 200 that serves HTML is a soft 404, so the type is checked too.
 */
async function serves(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    // A one-byte ranged GET rather than a HEAD: plenty of servers answer HEAD
    // with something other than what a GET would return, and asking for a byte
    // costs the same as asking for none.
    const res = await fetch(url, {
      headers: { 'user-agent': UA, range: 'bytes=0-0' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok && res.status !== 206) return false;
    const type = res.headers.get('content-type') ?? '';
    // Some CDNs answer with no type at all; that is not a reason to discard an
    // icon that answered at all. An HTML body, though, is a soft 404.
    return !type || type.startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function text(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Every `<link rel="…icon…">` on the page, with whatever size it claims. */
function linkIcons(html, base) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!/\bicon\b/.test(rel)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      // An apple-touch-icon is 180px square by convention even when unsized,
      // which makes it a better default guess than a bare "icon".
      const claimed = sizeOf(/sizes=["']([^"']+)["']/i.exec(tag)?.[1]);
      const size = claimed || (rel.includes('apple') ? 180 : 0);
      out.push({ url: new URL(href, base).toString(), size });
    } catch {
      /* an href we can't resolve is one we can't use */
    }
  }
  return out;
}

/** The icons a web manifest lists, which is where the big ones usually live. */
async function manifestIcons(html, base) {
  const href = /<link\b[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
  if (!href) return [];
  let manifestUrl;
  try {
    manifestUrl = new URL(href, base).toString();
  } catch {
    return [];
  }
  const body = await text(manifestUrl);
  if (!body) return [];
  try {
    const data = JSON.parse(body);
    return (data.icons ?? [])
      .filter((i) => i?.src)
      .map((i) => ({ url: new URL(i.src, manifestUrl).toString(), size: sizeOf(i.sizes) }));
  } catch {
    return [];
  }
}

export const siteIconService = {
  /**
   * @param {string} raw a page URL, or a bare hostname
   * @returns {Promise<{icons: Array<{url: string, size: number}>, best: string|null}>}
   */
  async resolve(raw) {
    const input = (raw ?? '').trim();
    if (!input) throw ApiError.badRequest('Provide a `url`.');
    let origin;
    try {
      origin = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).origin;
    } catch {
      throw ApiError.badRequest('That is not a web address.');
    }

    const hit = cache.get(origin);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.icons;

    const html = await text(origin);
    const found = [];
    if (html) {
      found.push(...linkIcons(html, origin), ...(await manifestIcons(html, origin)));
    }
    // Declared or not, /apple-touch-icon.png is where the convention says to
    // look, and plenty of sites have one without ever mentioning it.
    found.push({ url: `${origin}/apple-touch-icon.png`, size: 180 });
    const host = new URL(origin).hostname;
    found.push({ url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`, size: 1 });

    // Biggest first, and one entry per URL.
    const seen = new Set();
    const ranked = found
      .filter((i) => i.url && !seen.has(i.url) && seen.add(i.url))
      .sort((a, b) => b.size - a.size)
      .slice(0, 8);

    // Checked together rather than in turn: eight HEADs at once is one round
    // trip, and the caller wants every working candidate anyway so it can offer
    // a choice rather than just the winner.
    const live = await Promise.all(ranked.map((i) => serves(i.url)));
    const icons = ranked.filter((_, n) => live[n]);

    const result = { icons, best: icons[0]?.url ?? null };
    for (const icon of icons) known.add(icon.url);
    cache.set(origin, { at: Date.now(), icons: result });
    return result;
  },

  /**
   * The bytes of an icon we found, fetched here rather than by the browser.
   *
   * Some sites serve their icon happily to a server and refuse it to a page:
   * WhatsApp's apple-touch-icon is a real PNG with a permissive resource
   * policy that a browser still cannot load, which left its tile showing a
   * globe while curl had no trouble at all. Fetching it here sidesteps every
   * such policy, and means one round trip per icon for the whole app rather
   * than one per tile.
   */
  async image(url) {
    const target = (url ?? '').trim();
    if (!known.has(target)) throw ApiError.badRequest('Unknown icon.');

    const hit = bytes.get(target);
    if (hit && Date.now() - hit.at < TTL_MS) return hit;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(target, { headers: { 'user-agent': UA }, signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw ApiError.upstream('site icon', `${res.status} ${res.statusText}`);
      const type = res.headers.get('content-type') || 'image/png';
      if (!type.startsWith('image/')) throw ApiError.upstream('site icon', 'not an image');
      const entry = { at: Date.now(), buffer: Buffer.from(await res.arrayBuffer()), type };
      bytes.set(target, entry);
      return entry;
    } finally {
      clearTimeout(timer);
    }
  },
};
