// AudioWorklet that turns live microphone input into the format the Gemini Live
// API expects: mono, 16-bit PCM, 16 kHz, little-endian. Browsers capture at the
// hardware rate (usually 44.1/48 kHz), so we linearly resample down to 16 kHz and
// post Int16 frames (transferred, not copied) to the main thread.
//
// Served from /pcm-recorder-worklet.js (this file lives in public/), and loaded
// via audioContext.audioWorklet.addModule('/pcm-recorder-worklet.js').
/* global sampleRate */
const TARGET_RATE = 16000;

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE; // input samples per output sample
    this.readPos = 0; // fractional read cursor within `tail`
    this.tail = new Float32Array(0); // input samples carried across process() calls
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    const buf = new Float32Array(this.tail.length + channel.length);
    buf.set(this.tail, 0);
    buf.set(channel, this.tail.length);

    // Resample to 16 kHz with linear interpolation.
    const out = [];
    let i = this.readPos;
    while (i + 1 < buf.length) {
      const idx = i | 0;
      const frac = i - idx;
      const sample = buf[idx] * (1 - frac) + buf[idx + 1] * frac;
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      out.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
      i += this.ratio;
    }

    // Carry the not-yet-consumed input (from the current read index) forward so
    // the next call can interpolate across the boundary seamlessly.
    const consumed = i | 0;
    this.tail = buf.slice(Math.min(consumed, buf.length));
    this.readPos = i - consumed;

    if (out.length) {
      const pcm = Int16Array.from(out);
      this.port.postMessage(pcm, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PCMRecorderProcessor);
