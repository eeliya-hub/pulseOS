// Microphone capture. Opens the mic, runs it through the PCM worklet, and hands
// 16 kHz Int16 frames to `onFrame` as ArrayBuffers ready to stream to the
// backend. Intentionally does NOT connect the worklet to the speakers, so the
// mic is never echoed back to the user.
export function createMicRecorder({ onFrame }) {
  let stream = null;
  let ctx = null;
  let source = null;
  let node = null;
  let analyser = null;
  let freqData = null;
  let levelData = null;

  return {
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is not supported in this browser.');
      }
      // Browser AEC/noise suppression keeps the model from hearing its own voice.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      await ctx.audioWorklet.addModule('/pcm-recorder-worklet.js');

      source = ctx.createMediaStreamSource(stream);
      node = new AudioWorkletNode(ctx, 'pcm-recorder');
      node.port.onmessage = (event) => onFrame(event.data.buffer);
      source.connect(node);

      // Parallel analyser (never connected to output) purely so the UI can draw a
      // live spectrum of the user's voice while they talk.
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      levelData = new Float32Array(analyser.fftSize);
      source.connect(analyser);
    },

    // Smoothed 0..1 loudness of the mic right now (RMS of the waveform). Drives the
    // even, loudness-scaled envelope of the listening ribbon.
    getLevel() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(levelData);
      let sum = 0;
      for (let i = 0; i < levelData.length; i += 1) sum += levelData[i] * levelData[i];
      return Math.sqrt(sum / levelData.length);
    },

    // Bucket the low ~60% of the spectrum (where speech energy sits) into `count`
    // bands, each 0..1. Drives the reactive bars in the voice UI.
    getBands(count = 7) {
      if (!analyser) return new Array(count).fill(0);
      analyser.getByteFrequencyData(freqData);
      const usable = Math.floor(freqData.length * 0.6);
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

    async stop() {
      try {
        if (node) node.port.onmessage = null;
        source?.disconnect();
        node?.disconnect();
        analyser?.disconnect();
      } catch {
        /* nodes already torn down */
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (ctx) {
        try {
          await ctx.close();
        } catch {
          /* already closed */
        }
      }
      stream = ctx = source = node = analyser = freqData = levelData = null;
    },
  };
}
