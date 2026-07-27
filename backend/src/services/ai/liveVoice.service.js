import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';
import { systemPrompt, TOOLS } from './tools.js';

// Gemini Live API — real-time bidirectional voice. This service owns the Gemini
// wire contract entirely: it opens one Live session per caller, translates raw
// server messages into normalized events, and exposes a small send API. The
// WebSocket gateway bridges these to the browser without knowing any Gemini shape.
//
// Audio in: raw 16-bit PCM, 16 kHz, mono, little-endian (base64 over the wire).
// Audio out: raw 16-bit PCM, 24 kHz.
const INPUT_MIME = 'audio/pcm;rate=16000';

let client = null;
function getClient() {
  if (!config.ai.geminiKey) throw ApiError.notConfigured('Gemini');
  if (!client) client = new GoogleGenAI({ apiKey: config.ai.geminiKey });
  return client;
}

// Fan a raw Gemini Live message out to normalized events. Keeping this here means
// the gateway only ever sees our own event vocabulary, not Gemini's.
function emitFromMessage(message, onEvent) {
  if (message.setupComplete) onEvent({ type: 'ready' });

  const content = message.serverContent;
  if (content) {
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) onEvent({ type: 'audio', data: Buffer.from(part.inlineData.data, 'base64') });
      else if (part.text) onEvent({ type: 'transcript', role: 'model', text: part.text });
    }
    // Streaming transcripts (enabled via input/outputAudioTranscription config).
    if (content.inputTranscription?.text) onEvent({ type: 'transcript', role: 'user', text: content.inputTranscription.text });
    if (content.outputTranscription?.text) onEvent({ type: 'transcript', role: 'model', text: content.outputTranscription.text });
    if (content.interrupted) onEvent({ type: 'interrupted' }); // user barged in
    if (content.turnComplete) onEvent({ type: 'turn_complete' });
  }

  if (message.toolCall?.functionCalls?.length) {
    onEvent({
      type: 'tool_call',
      calls: message.toolCall.functionCalls.map((fc) => ({ id: fc.id, name: fc.name, args: fc.args ?? {} })),
    });
  }
}

/**
 * Open a Gemini Live session.
 *
 * @param {object} p
 * @param {string} [p.userName]              personalizes the system prompt
 * @param {string} [p.instructions]          the user's persona preferences for Pulse
 * @param {string} [p.voiceName]             prebuilt Gemini voice to speak with
 * @param {(event:object)=>void} p.onEvent   normalized events (ready|audio|transcript|interrupted|turn_complete|tool_call)
 * @param {(err:Error)=>void} [p.onError]
 * @param {(info:object)=>void} [p.onClose]
 * @returns {Promise<{sendAudio,sendText,sendToolResponse,close}>}
 */
export async function createLiveSession({ userName, instructions, voiceName, onEvent, onError, onClose }) {
  const ai = getClient();

  const session = await ai.live.connect({
    model: config.ai.geminiLiveModel,
    callbacks: {
      onmessage: (message) => {
        try {
          emitFromMessage(message, onEvent);
        } catch (err) {
          onError?.(err);
        }
      },
      onerror: (err) => onError?.(err),
      onclose: (info) => onClose?.(info),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt(userName, instructions, { voice: true }),
      // Pin the speaking voice so it stays consistent (otherwise Gemini's default
      // can vary between sessions).
      ...(voiceName
        ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
        : {}),
      // Streaming transcripts for both sides of the conversation.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Same tools the text assistant uses — the model may call these, we forward
      // them to the browser to execute, then return the result. Automatic VAD,
      // turn detection and barge-in are on by default for Live models.
      tools: [{ functionDeclarations: TOOLS }],
    },
  });

  logger.info(`Gemini Live session opened (${config.ai.geminiLiveModel})`);

  return {
    sendAudio(buffer) {
      session.sendRealtimeInput({ audio: { data: buffer.toString('base64'), mimeType: INPUT_MIME } });
    },
    sendText(text) {
      session.sendRealtimeInput({ text });
    },
    sendToolResponse(functionResponses) {
      session.sendToolResponse({ functionResponses });
    },
    close() {
      try {
        session.close();
      } catch {
        /* already closed */
      }
    },
  };
}
