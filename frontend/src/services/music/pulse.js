/**
 * What the immersive visuals move to.
 *
 * There is no audio to analyse. The record is playing on a Spotify Connect
 * device — a laptop app, a phone, a speaker — so nothing of it reaches this
 * page, and the Web Playback SDK's own output is DRM-protected and cannot be
 * routed into an AnalyserNode. Spotify's /audio-analysis, which used to publish
 * a beat timeline, has returned 403 for apps in Development mode since November
 * 2024.
 *
 * So the beat is reconstructed rather than heard, from three things that ARE
 * exact:
 *
 *   1. the track's real tempo, from the features endpoint (Spotify where it
 *      answers, ReccoBeats where it does not);
 *   2. the phase of that tempo, estimated from the synced lyric onsets — a
 *      singer enters on the beat far more often than not, so the circular mean
 *      of every onset taken modulo one beat lands close to where the beat sits;
 *   3. playback position, which the player reports each second and the caller
 *      interpolates between.
 *
 * This is steadier than a microphone and needs no permission: it is identical
 * on every play, unbothered by the room, and works on headphones. What it
 * cannot do is follow dynamics inside a bar — it knows where the beats are, not
 * how hard each one was hit. So the visuals are driven by continuous
 * oscillators running at the true tempo rather than by hard triggers on the
 * beat: a few tens of milliseconds of drift then reads as feel rather than as a
 * flash landing in the wrong place. Accents come from the lyric onsets, which
 * are timed to the vocal and land where you expect.
 */

const DEFAULT_TEMPO = 110;

/** Wrap to [-0.5, 0.5) turns. */
const wrapTurns = (x) => x - Math.round(x);

/**
 * Where the beat grid sits, in ms, given the lyric onsets.
 *
 * Each onset is a sample of the grid's phase; averaging them as unit vectors
 * (rather than as numbers) is what makes the average meaningful when the values
 * wrap around the end of a beat.
 */
function estimatePhase(lines, periodMs) {
  if (!periodMs) return 0;
  let x = 0;
  let y = 0;
  let n = 0;
  for (const line of lines) {
    if (!line?.text || line.at == null) continue;
    const turns = (line.at % periodMs) / periodMs;
    x += Math.cos(turns * Math.PI * 2);
    y += Math.sin(turns * Math.PI * 2);
    n += 1;
  }
  // Too few onsets, or onsets scattered evenly around the beat (which is what a
  // low resultant length means), and the estimate is worthless — take zero.
  if (n < 6) return 0;
  const strength = Math.hypot(x, y) / n;
  if (strength < 0.12) return 0;
  const turns = Math.atan2(y, x) / (Math.PI * 2);
  return ((turns % 1) + 1) % 1 * periodMs;
}

/** Tempo of last resort: the most common gap between sung lines, halved until it is a plausible beat. */
function tempoFromLines(lines) {
  const gaps = [];
  let previous = null;
  for (const line of lines) {
    if (!line?.text || line.at == null) continue;
    if (previous != null) gaps.push(line.at - previous);
    previous = line.at;
  }
  if (gaps.length < 8) return DEFAULT_TEMPO;
  gaps.sort((a, b) => a - b);
  let gap = gaps[Math.floor(gaps.length / 2)];
  while (gap > 1200) gap /= 2;
  while (gap > 0 && gap < 300) gap *= 2;
  const bpm = 60000 / gap;
  return Number.isFinite(bpm) && bpm > 40 && bpm < 220 ? bpm : DEFAULT_TEMPO;
}

/**
 * Build a driver for one track.
 *
 * @param {object} o
 * @param {object|null} o.features  the features payload, or null
 * @param {Array} o.lines           synced lyric lines ({ at, text }), may be empty
 * @returns {{ sample: (positionMs:number, seconds:number) => object, tempo:number, source:string }}
 */
export function createPulse({ features, lines = [] }) {
  const usable = features?.available && Number.isFinite(features.tempo) && features.tempo > 0;
  const tempo = usable ? features.tempo : tempoFromLines(lines);
  const periodMs = 60000 / tempo;
  const beatsPerBar = features?.timeSignature > 0 ? features.timeSignature : 4;
  const phaseMs = estimatePhase(lines, periodMs);

  // How hard the track hits, 0..1. Loudness is dBFS and mostly lives between
  // -20 and -3; energy alone reads flat across a playlist, so the two are
  // combined and the result kept off both rails.
  const energy = Number.isFinite(features?.energy) ? features.energy : 0.6;
  const loudness = Number.isFinite(features?.loudness) ? features.loudness : -9;
  const loud = Math.min(1, Math.max(0, (loudness + 22) / 19));
  const drive = Math.min(1, Math.max(0.12, energy * 0.62 + loud * 0.38));

  const danceability = Number.isFinite(features?.danceability) ? features.danceability : 0.5;
  const valence = Number.isFinite(features?.valence) ? features.valence : 0.5;

  // How sharply the swell peaks on the beat: a loose track breathes, a tight one
  // snaps. Kept well short of a spike, which would only show the drift.
  const sharpness = 1.6 + danceability * 2.8;

  // Lyric onsets drive the accent. Walked with a cursor rather than searched,
  // because this runs every frame.
  const onsets = lines.filter((l) => l?.text && l.at != null).map((l) => l.at);
  let cursor = 0;
  let lastAccentAt = -1e9;

  return {
    tempo,
    periodMs,
    phaseMs,
    beatsPerBar,
    drive,
    valence,
    source: usable ? features.source ?? 'spotify' : 'estimated',

    /**
     * @param {number} positionMs where the track is, interpolated
     * @param {number} seconds     wall clock since the view opened, for motion
     *                             that must keep going when the music stops
     */
    sample(positionMs, seconds) {
      // Beats since the start of the grid, as a float.
      const beats = (positionMs - phaseMs) / periodMs;
      const frac = beats - Math.floor(beats);
      // A swell that peaks ON the beat and falls away: 1 at the beat, easing to
      // 0 by the next one.
      const pulse = Math.pow(1 - frac, sharpness);
      const bars = beats / beatsPerBar;
      const barFrac = bars - Math.floor(bars);

      // Accent: rebuilt from scratch if the listener seeks backwards.
      if (onsets.length) {
        if (cursor > 0 && onsets[cursor - 1] > positionMs + 250) cursor = 0;
        while (cursor < onsets.length && onsets[cursor] <= positionMs) {
          lastAccentAt = onsets[cursor];
          cursor += 1;
        }
      }
      const sinceAccent = positionMs - lastAccentAt;
      const accent = sinceAccent >= 0 && sinceAccent < 1400 ? Math.pow(1 - sinceAccent / 1400, 2.2) : 0;

      return {
        seconds,
        tempo,
        beats,
        bars,
        barFrac,
        /** 0..1, peaking on each beat. */
        pulse,
        /** 0..1, peaking on the first beat of each bar. */
        barPulse: Math.pow(1 - barFrac, 2.2),
        /** 0..1, fires when a lyric line begins. */
        accent,
        drive,
        valence,
        energy,
      };
    },
  };
}

/** A driver for when nothing is playing: everything breathes, nothing beats. */
export function idlePulse() {
  return {
    tempo: DEFAULT_TEMPO,
    periodMs: 60000 / DEFAULT_TEMPO,
    phaseMs: 0,
    beatsPerBar: 4,
    drive: 0.22,
    valence: 0.5,
    source: 'idle',
    sample(_positionMs, seconds) {
      const beats = seconds * (DEFAULT_TEMPO / 60);
      const frac = beats - Math.floor(beats);
      return {
        seconds,
        tempo: DEFAULT_TEMPO,
        beats,
        bars: beats / 4,
        barFrac: (beats / 4) % 1,
        pulse: Math.pow(1 - frac, 2) * 0.35,
        barPulse: 0,
        accent: 0,
        drive: 0.22,
        valence: 0.5,
        energy: 0.3,
      };
    },
  };
}
