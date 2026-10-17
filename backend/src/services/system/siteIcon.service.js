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
const cache = new Map(); // origin → { at, until, icons }
const TTL_MS = 24 * 60 * 60 * 1000;

/*
 * A disappointment, though, is worth almost nothing.
 *
 * Reading a site is not reliable: Cloudflare answers a server with a 403 it
 * would never show a browser, WhatsApp's web app replies 400 to a plain GET,
 * Amazon returns an empty 202. Any of those leaves us with no declared icons
 * and nothing but Google's 16px favicon upscaled — and holding THAT for a day
 * meant one unlucky moment froze a grey globe onto the tile until tomorrow. It
 * was exactly the case: all three of those sites had real icons available and
 * all three were showing nothing, from a cache entry hours old.
 *
 * So a poor answer is kept only long enough to stop a grid of tiles asking
 * twenty times over, and the next look tries again.
 */
const THIN_TTL_MS = 5 * 60 * 1000;

// Every icon address resolve() has handed out. The proxy below will only fetch
// from this set, so it is a way to reach icons we found rather than a way to
// make this machine fetch any URL somebody names.
const known = new Set();
const bytes = new Map(); // icon url → { at, buffer, type }

const sizeOf = (spec) => {
  const n = Math.max(0, ...String(spec ?? '').split(/\s+/).map((s) => parseInt(s, 10) || 0));
  return Number.isFinite(n) ? n : 0;
};

/** A PNG's real dimensions, out of the 24 bytes that carry them. */
function pngSize(head) {
  if (head.length < 24) return 0;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (sig.some((byte, i) => head[i] !== byte)) return 0;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return Math.min(view.getUint32(16), view.getUint32(20));
}

/** The first chunk of a response, which for any real image is its header. */
async function firstBytes(res, wanted = 24) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  try {
    const parts = [];
    let total = 0;
    while (total < wanted) {
      const { value, done } = await reader.read();
      if (done) break;
      parts.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  } catch {
    return new Uint8Array();
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * Whether a URL actually serves an image, and how big it really is.
 *
 * Every icon here is a claim, twice over. A site declares icons it stopped
 * serving years ago, and /apple-touch-icon.png is a convention rather than a
 * promise — google.com, mail.google.com and amazon.co.uk all 404 on it.
 * Recommending an address without checking is how a tile ends up with a
 * broken-image glyph or a grey globe when a perfectly good favicon was
 * available all along.
 *
 * And the sizes are claims too: reddit.com declares an apple-touch-icon and
 * serves 57 pixels under it, while the 64px one it also declares is sharper. So
 * where the bytes say outright how big they are — which a PNG does, in its
 * first 24 — the bytes are believed over the markup.
 *
 * @returns {Promise<{ok: boolean, size: number}>} size 0 meaning "can't tell"
 */
async function serves(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    /*
     * A GET rather than a HEAD, because plenty of servers answer HEAD with
     * something other than what a GET would return — and a plain GET rather
     * than the one-byte ranged GET this used to send, because a Range header is
     * its own kind of unreliable. web.whatsapp.com answers `Range: bytes=0-0`
     * with a 400 and the same URL without it with a perfectly good PNG, which
     * is why WhatsApp's tile was wearing a grey globe.
     */
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: controller.signal,
      redirect: 'follow',
    });
    const type = res.headers.get('content-type') ?? '';
    // Some CDNs answer with no type at all; that is not a reason to discard an
    // icon that answered at all. An HTML body, though, is a soft 404.
    if (!res.ok || (type && !type.startsWith('image/'))) {
      res.body?.cancel().catch(() => {});
      return { ok: false, size: 0 };
    }
    return { ok: true, size: pngSize(await firstBytes(res)) };
  } catch {
    return { ok: false, size: 0 };
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
    if (hit && Date.now() < hit.until) {
      // `known` is the proxy's allow-list, and a cache hit still has to be
      // reachable through it — otherwise the second visit to a site serves an
      // address the image route then refuses as unknown.
      for (const icon of hit.icons.icons) known.add(icon.url);
      return hit.icons;
    }

    const html = await text(origin);
    const found = [];
    if (html) {
      found.push(...linkIcons(html, origin), ...(await manifestIcons(html, origin)));
    }
    // Declared or not, /apple-touch-icon.png is where the convention says to
    // look, and plenty of sites have one without ever mentioning it.
    found.push({ url: `${origin}/apple-touch-icon.png`, size: 180 });
    const host = new URL(origin).hostname;
    found.push({
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`,
      // Unsized until it is measured, and marked, because an answer made only
      // of this one is an answer worth asking about again soon.
      size: 1,
      fallback: true,
    });

    // Biggest first, and one entry per URL.
    const seen = new Set();
    const ranked = found
      .filter((i) => i.url && !seen.has(i.url) && seen.add(i.url))
      .sort((a, b) => b.size - a.size)
      .slice(0, 8);

    // Checked together rather than in turn: eight requests at once is one round
    // trip, and the caller wants every working candidate anyway so it can offer
    // a choice rather than just the winner.
    const live = await Promise.all(ranked.map((i) => serves(i.url)));
    const icons = ranked
      // A measured size replaces the claimed one, so the order below is what
      // the bytes are rather than what the markup said they would be.
      .map((icon, n) => (live[n].size ? { ...icon, size: live[n].size } : icon))
      .filter((_, n) => live[n].ok)
      // Biggest wins, whoever is serving it. Google's render is last resort by
      // standing, not by quality: google.com's own favicon is 32px and the one
      // Google holds for it is 144, and a tile would rather have the 144. At
      // the same size the site's own is preferred, because it is the site's own.
      .sort((a, b) => b.size - a.size || (a.fallback ? 1 : b.fallback ? -1 : 0));

    const result = { icons, best: icons[0]?.url ?? null };
    for (const icon of icons) known.add(icon.url);
    // Thin: nothing at all, or nothing but the last resort — which is what a
    // blocked or sulking page leaves behind, and not worth holding for a day.
    const thin = !icons.length || icons.every((i) => i.fallback);
    const now = Date.now();
    cache.set(origin, { at: now, until: now + (thin ? THIN_TTL_MS : TTL_MS), icons: result });
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
