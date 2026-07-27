import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';
import { assertQuota, recordRequest } from './quota.js';

// One-shot text-to-speech for the "preview this voice" button in settings. Uses
// Gemini's TTS model with the same prebuilt voice names the Live session accepts,
// and returns a ready-to-play WAV so the browser can just `new Audio(...)`.
const INTEGRATION = 'Gemini TTS';
const SAMPLE = "Hi, I'm Pulse, this is how I sound.";
// The TTS model needs the input framed as a transcript to read aloud, otherwise
// it tries to "answer" and 400s. This directive is spoken as style, not read out.
const sayPrompt = (text) => `Read the following aloud in a warm, natural voice: ${text}`;

// Pull the sample rate out of a mime like "audio/L16;codec=pcm;rate=24000".
function rateFromMime(mime, fallback = 24000) {
  const m = /rate=(\d+)/.exec(mime || '');
  return m ? Number(m[1]) : fallback;
}

// Wrap raw little-endian 16-bit mono PCM in a minimal WAV container.
function wavFromPcm(pcm, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const ttsService = {
  async preview({ voice, text } = {}) {
    if (!config.ai.geminiKey) throw ApiError.notConfigured('Gemini');

    assertQuota('gemini');
    recordRequest('gemini');

    const model = config.ai.geminiTtsModel;
    const body = {
      contents: [{ parts: [{ text: sayPrompt(text || SAMPLE) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        ...(voice ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } : {}),
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.geminiKey}`;
    const data = await fetchJson(url, {
      integration: INTEGRATION,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const part = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!part) throw ApiError.badRequest('The TTS model returned no audio.');

    const pcm = Buffer.from(part.inlineData.data, 'base64');
    const wav = wavFromPcm(pcm, rateFromMime(part.inlineData.mimeType));
    return { audio: wav.toString('base64'), mimeType: 'audio/wav' };
  },
};
