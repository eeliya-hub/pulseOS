// Gapless playback for Gemini's streamed voice. Audio arrives as raw 16-bit PCM
// at 24 kHz; each chunk is decoded to a Web Audio buffer and scheduled back-to-
// back on a running time cursor so there are no clicks between chunks. flush()
// stops everything instantly — that's what makes barge-in feel immediate.
const OUTPUT_RATE = 24000;

// How long to keep reporting "playing" after the audio queue drains. Gemini's
// speech arrives in bursts with small gaps between them; without this hangover the
// UI would flip speaking→listening on every gap and again the instant an answer
// ends. Holding for a beat keeps the "speaking" state calm and sustained. A real
// barge-in bypasses it via flush(), so responsiveness is unaffected.
const PLAY_HANGOVER_MS = 900;

// Fast speech is around 15 characters a second; this leaves headroom above that
// while still catching a transcript that has arrived well ahead of its audio.
const MAX_CHARS_PER_SECOND = 22;

export function createAudioPlayer() {
  let ctx = null;
  let analyser = null;
  let levelData = null;
  let freqData = null;
  let nextStartTime = 0;

  // ── Where the voice actually is in the text ──────────────────────────────
  // Gemini emits the transcript and the audio for the same speech at roughly the
  // same moment. So at the instant a transcript chunk lands, the audio queued up
  // to that point is the audio for the text up to that point — one anchor pairing
  // a character count with an audio-clock time. Interpolating between anchors
  // gives the voice's position in the text at any moment.
  //
  // This replaces measuring elapsed/total against the audio queued SO FAR, which
  // could only ever be wrong while streaming: early in an answer the total is a
  // fraction of the real one, so the position raced to the end and snapped back
  // every time more audio arrived.
  let anchors = []; // { chars, audioEnd }, ascending
  let turnStart = 0; // audio-clock time this answer's speech begins
  let spokenChars = 0; // last reported position — never allowed to go backwards
  const active = new Set();
  let onPlayingChange = null;
  let playing = false;
  let stopTimer = null;

  const ensureCtx = () => {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      // Run the graph at the voice's OWN sample rate.
      //
      // Left at the hardware default (usually 48 kHz), every 24 kHz chunk is
      // resampled on its own, with no history carried across the seam between
      // one chunk and the next — which rings, and is heard as a tick or beep
      // running under the speech. Measured on a pure tone: 893 discontinuities
      // in three seconds at 48 kHz against 29 at 24 kHz.
      //
      // The conversion still happens, once, at the output device, where it is
      // continuous instead of restarting hundreds of times a second.
      try {
        ctx = new AudioCtx({ sampleRate: OUTPUT_RATE });
      } catch {
        ctx = new AudioCtx(); // browser refused the rate — resampled beats silent
      }
      // Everything plays through an analyser → destination, so the UI can read the
      // amplitude of the voice that's actually sounding right now (time-aligned
      // with playback, which per-chunk inspection wouldn't be).
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      analyser.connect(ctx.destination);
      levelData = new Float32Array(analyser.fftSize);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  // Only fire on real transitions, so the UI status doesn't churn.
  const setPlaying = (next) => {
    if (next === playing) return;
    playing = next;
    onPlayingChange?.(next);
  };

  const cancelStop = () => {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
  };

  // Defer the drop to "not playing" by the hangover, and cancel it if more audio
  // shows up in the meantime.
  const scheduleStop = () => {
    cancelStop();
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (active.size === 0) setPlaying(false);
    }, PLAY_HANGOVER_MS);
  };

  return {
    // Notified true when the queue becomes non-empty, false when it drains.
    setOnPlayingChange(fn) {
      onPlayingChange = fn;
    },

    // Unlock the output context while a user gesture is still active, so the
    // first streamed response isn't blocked by the browser's autoplay policy.
    resume() {
      ensureCtx();
    },

    // Schedule a chunk of 24 kHz mono PCM16 (ArrayBuffer of little-endian Int16).
    enqueue(arrayBuffer) {
      const audioCtx = ensureCtx();
      const int16 = new Int16Array(arrayBuffer);
      if (!int16.length) return;

      const float = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i += 1) float[i] = int16[i] / 0x8000;

      const buffer = audioCtx.createBuffer(1, float.length, OUTPUT_RATE);
      buffer.copyToChannel(float, 0);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);

      const startAt = Math.max(audioCtx.currentTime, nextStartTime);
      source.start(startAt);
      nextStartTime = startAt + buffer.duration;

      cancelStop(); // fresh audio — stay in the speaking state
      setPlaying(true);
      active.add(source);
      source.onended = () => {
        active.delete(source);
        if (active.size === 0) scheduleStop();
      };
    },

    // Smoothed 0..1 loudness of the audio playing right now (RMS of the waveform).
    // Drives the "Pulse is speaking" aura in the voice UI.
    getLevel() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(levelData);
      let sum = 0;
      for (let i = 0; i < levelData.length; i += 1) sum += levelData[i] * levelData[i];
      return Math.sqrt(sum / levelData.length);
    },

    /**
     * Start a new spoken answer. Called when its first transcript arrives, which
     * is also when its audio begins queueing — so the turn's audio starts either
     * now or wherever the previous answer's audio finishes.
     *
     * Explicit rather than inferred: this used to be "the first chunk after the
     * player went quiet", and since the quiet flag has a 900ms hangover, any
     * pause longer than that mid-answer looked like a new turn, reset the clock,
     * and threw the highlight back to the first sentence.
     */
    beginTurn() {
      const audioCtx = ensureCtx();
      anchors = [];
      spokenChars = 0;
      turnStart = Math.max(audioCtx.currentTime, nextStartTime);
    },

    /**
     * Record that the answer's transcript now runs to `chars` characters. Pairs
     * that with the audio queued so far to make one anchor on the timeline.
     */
    markText(chars) {
      if (!ctx || !(chars > 0)) return;
      const audioEnd = Math.max(nextStartTime, turnStart);
      const last = anchors[anchors.length - 1];
      if (last) {
        if (chars <= last.chars) return; // nothing new said
        // More text against audio we have already anchored: widen that anchor
        // rather than adding a zero-length span the interpolation can't use.
        if (audioEnd <= last.audioEnd) {
          last.chars = chars;
          return;
        }
      }
      anchors.push({ chars, audioEnd });
    },

    /**
     * How far into the answer's text the voice has actually got, in characters.
     * Interpolated across the anchors on the audio clock, clamped to the audio
     * that has actually been queued, and monotonic — the highlight may pause,
     * never reverse.
     */
    getSpokenChars(totalChars = Infinity) {
      if (!ctx || !anchors.length) return spokenChars;

      // Never claim progress past audio that exists: between bursts the clock
      // keeps running while nothing is playing.
      const now = Math.min(ctx.currentTime, nextStartTime);
      const last = anchors[anchors.length - 1];
      let position;

      if (now <= turnStart) {
        position = 0;
      } else if (now > last.audioEnd) {
        // Past the last anchor — audio still playing out text we already have.
        // Carry on at the rate this answer has been spoken at so far.
        const elapsed = last.audioEnd - turnStart;
        const rate = elapsed > 0 ? last.chars / elapsed : 0;
        position = last.chars + (now - last.audioEnd) * rate;
      } else {
        let prevChars = 0;
        let prevTime = turnStart;
        position = last.chars;
        for (const anchor of anchors) {
          if (now <= anchor.audioEnd) {
            const span = anchor.audioEnd - prevTime;
            const t = span > 0 ? (now - prevTime) / span : 1;
            position = prevChars + t * (anchor.chars - prevChars);
            break;
          }
          prevChars = anchor.chars;
          prevTime = anchor.audioEnd;
        }
      }

      // A burst of transcript against very little audio makes one anchor imply an
      // impossible speaking rate, which would run the highlight ahead and leave
      // it stalled while the voice caught up. Nobody speaks faster than this, so
      // cap by elapsed time as well as by the audio that exists.
      const plausible = (now - turnStart) * MAX_CHARS_PER_SECOND;
      spokenChars = Math.max(spokenChars, Math.min(position, plausible, totalChars));
      return spokenChars;
    },

    // Spectrum split into `count` bands (0..1) — lets the speaking ring ripple per
    // frequency instead of pulsing as one blob.
    getBands(count = 6) {
      if (!analyser) return new Array(count).fill(0);
      analyser.getByteFrequencyData(freqData);
      const usable = Math.floor(freqData.length * 0.7);
      const bands = new Array(count);
      for (let b = 0; b < count; b += 1) {
        const startI = Math.floor((b / count) * usable);
        const endI = Math.max(startI + 1, Math.floor(((b + 1) / count) * usable));
        let sum = 0;
        for (let i = startI; i < endI; i += 1) sum += freqData[i];
        bands[b] = sum / (endI - startI) / 255;
      }
      return bands;
    },

    // Barge-in / stop: cut all scheduled audio immediately (skips the hangover).
    flush() {
      cancelStop();
      for (const source of active) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      active.clear();
      nextStartTime = ctx ? ctx.currentTime : 0;
      anchors = [];
      spokenChars = 0;
      turnStart = nextStartTime;
      setPlaying(false);
    },

    async close() {
      this.flush();
      if (ctx) {
        try {
          await ctx.close();
        } catch {
          /* already closed */
        }
        ctx = null;
        analyser = null;
        levelData = null;
        freqData = null;
      }
    },
  };
}
