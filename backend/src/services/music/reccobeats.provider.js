/**
 * Track features from ReccoBeats, used when Spotify won't give us its own.
 *
 * Spotify restricted /audio-features and /audio-analysis in November 2024; an
 * app in Development mode gets a flat 403 whatever its scopes. ReccoBeats
 * publishes the same measurements against Spotify track ids, keyless, so the
 * immersive visualiser can still be driven by the actual tempo of the record
 * rather than by a guess.
 *
 * What it does NOT give is a beat timeline — there are no onset positions here,
 * only a tempo. The caller turns that into a grid and finds its phase from the
 * synced lyric onsets; see `frontend/src/services/music/pulse.js`.
 */

const BASE = 'https://api.reccobeats.com/v1';
const TIMEOUT_MS = 6000;

/**
 * @param {string} trackId Spotify track id
 * @returns {Promise<object>} the same shape as spotify.audioFeatures
 */
export async function audioFeatures(trackId) {
  if (!trackId) return { available: false, reason: 'No track id.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/audio-features?ids=${encodeURIComponent(trackId)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { available: false, reason: `ReccoBeats ${res.status}` };

    const body = await res.json();
    const d = Array.isArray(body?.content) ? body.content[0] : null;
    // A track it has never seen comes back as an empty list, not an error.
    if (!d || typeof d.tempo !== 'number') {
      return { available: false, reason: 'ReccoBeats has no features for this track.' };
    }

    return {
      available: true,
      source: 'reccobeats',
      tempo: d.tempo,
      // ReccoBeats does not publish a time signature; four is the safe read for
      // almost everything, and the visuals only use it to group beats into bars.
      timeSignature: 4,
      key: d.key ?? -1,
      mode: d.mode ?? -1,
      loudness: d.loudness ?? null,
      energy: d.energy ?? null,
      valence: d.valence ?? null,
      danceability: d.danceability ?? null,
      acousticness: d.acousticness ?? null,
      instrumentalness: d.instrumentalness ?? null,
      speechiness: d.speechiness ?? null,
      durationMs: d.durationMs ?? null,
    };
  } catch (err) {
    return { available: false, reason: err?.name === 'AbortError' ? 'ReccoBeats timed out.' : String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}
