import { ApiError } from '../../utils/ApiError.js';

/**
 * Resolve a live-TV stream redirector to the playlist it actually points at.
 *
 * Two of the news channels are published through matthuisman's jmp2.uk
 * redirector, which is what keeps them working when the upstream FAST platform
 * rotates its URLs. The browser can't follow it: a cross-origin request has to
 * pass the CORS check on *every* hop, and the 302 itself carries no
 * access-control-allow-origin — so hls.js fails with a bare `manifestLoadError`
 * before it ever sees the real playlist. The CDNs behind it all send proper CORS,
 * so following the hop here and handing the frontend the final URL is enough.
 *
 * Only the redirector's own host is accepted, so this can't be used to make the
 * backend fetch arbitrary URLs.
 */
const ALLOWED_HOSTS = new Set(['jmp2.uk']);
const TTL_MS = 4 * 60 * 1000; // the tokens in some of these URLs are short-lived

const cache = new Map(); // source URL → { url, at }

/**
 * Hosts this backend is willing to fetch stream bytes from.
 *
 * Seeded only by our own redirector resolution and then extended, as playlists
 * are rewritten, with the hosts those playlists themselves point at. That chain
 * starts at jmp2.uk and never leaves it, so the proxy below can't be pointed at
 * an arbitrary address — it is a stream relay, not an open proxy.
 */
const trustedHosts = new Set();

const hostOf = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' ? hostname : null;
  } catch {
    return null;
  }
};

export function trustStreamHost(url) {
  const host = hostOf(url);
  if (host) trustedHosts.add(host);
  return host;
}

export const isTrustedStreamUrl = (url) => {
  const host = hostOf(url);
  return Boolean(host && trustedHosts.has(host));
};

export const liveStreamService = {
  async resolve(source) {
    if (!source) throw ApiError.badRequest('Provide a stream `url`.');

    let target;
    try {
      target = new URL(source);
    } catch {
      throw ApiError.badRequest('That is not a valid URL.');
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
      throw ApiError.badRequest(`Only ${[...ALLOWED_HOSTS].join(', ')} stream links can be resolved.`);
    }

    const hit = cache.get(source);
    if (hit && Date.now() - hit.at < TTL_MS) {
      trustStreamHost(hit.url);
      return { url: hit.url, cached: true };
    }

    let response;
    try {
      response = await fetch(source, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw ApiError.upstream('Live news stream', `couldn't reach the redirector — ${error.message}`);
    }
    if (!response.ok) throw ApiError.upstream('Live news stream', `the redirector answered ${response.status}`);

    // `response.url` is the address after the redirect chain — the playlist that
    // hls.js needs. Reading the body would only waste a manifest fetch.
    response.body?.cancel?.();
    const url = response.url;
    if (!url || url === source) throw ApiError.upstream('Live news stream', 'the redirector did not point anywhere');

    cache.set(source, { url, at: Date.now() });
    trustStreamHost(url); // this playlist, and what it points at, may now be relayed
    return { url, cached: false };
  },
};

/**
 * Relay one playlist or segment, adding the CORS header its own CDN doesn't.
 *
 * Some FAST channels serve the playlist with `access-control-allow-origin` but
 * their media segments from a CDN that sends none — talkSPORT is one — so hls.js
 * loads the manifest and then fails on every segment. Those channels are marked
 * `viaProxy` in the frontend and come through here instead.
 *
 * Playlists are rewritten so the URLs inside them point back at this endpoint;
 * everything else is streamed straight through.
 */
const PLAYLIST_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl'];

const looksLikePlaylist = (url, contentType = '') =>
  PLAYLIST_TYPES.some((t) => contentType.toLowerCase().includes(t)) || /\.m3u8(\?|$)/i.test(url);

/** Rewrite every URL in a playlist to come back through this relay. */
function rewritePlaylist(text, baseUrl, toProxyUrl) {
  const absolute = (ref) => {
    try {
      return new URL(ref, baseUrl).toString();
    } catch {
      return null;
    }
  };
  const relay = (ref) => {
    const url = absolute(ref);
    if (!url) return ref;
    trustStreamHost(url); // reachable because the playlist that named it was
    return toProxyUrl(url);
  };

  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      // URI="…" appears on EXT-X-KEY, EXT-X-MEDIA and EXT-X-MAP.
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${relay(ref)}"`);
      }
      return relay(trimmed);
    })
    .join('\n');
}

export async function relayStream(target, { toProxyUrl }) {
  if (!target) throw ApiError.badRequest('Provide a stream `url`.');
  if (!isTrustedStreamUrl(target)) {
    throw ApiError.badRequest('That stream has not been resolved through this app.');
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { 'user-agent': 'PulseOS/0.1 (personal dashboard)' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw ApiError.upstream('Live news stream', `couldn't reach the stream — ${error.message}`);
  }
  if (!upstream.ok) throw ApiError.upstream('Live news stream', `the stream answered ${upstream.status}`);

  const contentType = upstream.headers.get('content-type') ?? '';
  if (looksLikePlaylist(target, contentType)) {
    const body = await upstream.text();
    return { kind: 'playlist', contentType: 'application/vnd.apple.mpegurl', body: rewritePlaylist(body, target, toProxyUrl) };
  }
  return { kind: 'segment', contentType: contentType || 'video/mp2t', stream: upstream.body };
}
