import { createCache } from '../../utils/cache.js';
import { fetchJson } from '../../utils/httpClient.js';

// Lyrics via LRCLIB — a community lyrics database that needs no key and no
// account, and serves TIME-SYNCED lyrics (LRC) as well as plain text. Spotify
// has no public lyrics API, so this is what makes a karaoke-style view possible.
//
// https://lrclib.net/docs
const BASE = 'https://lrclib.net/api';
const INTEGRATION = 'LRCLIB';
const UA = 'PulseOS/0.1 (personal dashboard; https://github.com/)';

// Lyrics never change — cache hard so scrubbing and re-opening a track is free.
const cache = createCache(24 * 60 * 60 * 1000);

const get = (path) => fetchJson(`${BASE}${path}`, { integration: INTEGRATION, timeoutMs: 8_000, headers: { 'user-agent': UA } });

/**
 * Parse an LRC body into timed lines: `[mm:ss.xx] words`. A line can carry
 * several timestamps (a repeated chorus), which expands into one entry each.
 * Blank entries are kept — they're the instrumental gaps, and dropping them
 * would make the view jump straight from one verse to the next.
 */
export function parseLrc(lrc = '') {
  const out = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const [, m, s, frac] of stamps) {
      const ms = Number(m) * 60_000 + Number(s) * 1000 + Number((frac ?? '0').padEnd(3, '0'));
      out.push({ at: ms, text });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const shape = (hit) => ({
  found: true,
  synced: Boolean(hit.syncedLyrics),
  instrumental: Boolean(hit.instrumental),
  trackName: hit.trackName,
  artistName: hit.artistName,
  lines: hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : [],
  plain: hit.plainLyrics ?? '',
  source: 'LRCLIB',
});

// Prefer a hit that actually has synced lyrics, then one close to the right
// duration — a compilation cut of the same song can be a different edit.
function bestOf(results, durationSec) {
  const usable = (results ?? []).filter((r) => r.syncedLyrics || r.plainLyrics);
  if (!usable.length) return null;
  return usable.sort((a, b) => {
    if (Boolean(b.syncedLyrics) !== Boolean(a.syncedLyrics)) return b.syncedLyrics ? 1 : -1;
    if (!durationSec) return 0;
    return Math.abs((a.duration ?? 0) - durationSec) - Math.abs((b.duration ?? 0) - durationSec);
  })[0];
}

export const lyricsService = {
  /**
   * @param {object} p
   * @param {string} p.track    song title (as Spotify reports it)
   * @param {string} p.artist   lead artist
   * @param {string} [p.album]
   * @param {number} [p.durationMs]
   */
  async lookup({ track, artist, album, durationMs } = {}) {
    const title = (track || '').trim();
    const by = (artist || '').trim();
    if (!title || !by) return { found: false, reason: 'Need both a track and an artist.' };

    const durationSec = durationMs ? Math.round(durationMs / 1000) : null;
    const key = `lyrics:${title.toLowerCase()}|${by.toLowerCase()}|${durationSec ?? ''}`;

    return cache.wrap(key, async () => {
      // 1. Exact lookup — the signature match, including duration, so we get the
      //    timings for THIS edit of the song rather than a different cut.
      const exact = new URLSearchParams({ track_name: title, artist_name: by });
      if (album) exact.set('album_name', album);
      if (durationSec) exact.set('duration', String(durationSec));
      const hit = await get(`/get?${exact}`).catch(() => null);
      if (hit?.syncedLyrics || hit?.plainLyrics) return shape(hit);

      // 2. Same, without album/duration — Spotify's album name often differs from
      //    the one lyrics were filed under (deluxe editions, singles, regions).
      const loose = await get(`/get?${new URLSearchParams({ track_name: title, artist_name: by })}`).catch(() => null);
      if (loose?.syncedLyrics || loose?.plainLyrics) return shape(loose);

      // 3. Full-text search, then pick the closest usable match.
      const found = await get(`/search?${new URLSearchParams({ track_name: title, artist_name: by })}`).catch(() => null);
      const best = bestOf(found, durationSec);
      if (best) return shape(best);

      return { found: false, reason: 'No lyrics found for this track.' };
    });
  },
};
