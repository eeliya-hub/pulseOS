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

export function createAudioPlayer() {
  let ctx = null;
  let analyser = null;
  let levelData = null;
  let freqData = null;
  let nextStartTime = 0;
  let turnStart = 0; // audio-clock time the current spoken turn began
  const active = new Set();
  let onPlayingChange = null;
  let playing = false;
  let stopTimer = null;

  const ensureCtx = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
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
      if (!playing) turnStart = startAt; // first chunk of a new spoken turn
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

    // Fraction 0..1 of the current spoken turn's audio that has actually played —
    // lets the transcript follow the voice (which lags the fast-arriving text).
    getSpeechProgress() {
      if (!ctx) return 1;
      const total = nextStartTime - turnStart;
      if (total <= 0) return playing ? 0 : 1;
      return Math.max(0, Math.min(1, (ctx.currentTime - turnStart) / total));
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
