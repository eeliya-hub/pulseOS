import { appendFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';

// TEMPORARY: capture what a real voice session receives and decides.
const trace = (line) => {
  try { appendFileSync('/tmp/pulse-voice-trace.log', `${new Date().toISOString()} ${line}\n`); } catch { /* diagnostic */ }
};
import { isAllowedOrigin } from '../config/env.js';
import { createLiveSession } from '../services/ai/liveVoice.service.js';
import { logger } from '../utils/logger.js';

// Bridges each browser WebSocket to its own Gemini Live session. One connection
// ↔ one session ↔ one user, so multiple people can talk at once and each keeps
// isolated conversation context (held server-side inside the Live session).
//
// Wire protocol (browser ↔ gateway):
//   • binary frames  = raw PCM audio (browser→16 kHz in, gateway→24 kHz out)
//   • text frames     = JSON control messages
// Down to the browser: { type: 'ready' | 'transcript' | 'interrupted'
//                        | 'turn_complete' | 'tool_call' | 'error', ... }
// Up from the browser: { type: 'start', name, instructions, voice }
//                     | { type: 'tool_response', responses } | { type: 'text', text }
//
// The session opens on 'start', not on connect: the user's instructions, saved
// prompts and remembered facts can run to thousands of characters, and carrying
// them in the URL made the upgrade request fail with a 431 once they did. A
// first message has no such ceiling.
const WS_PATH = '/api/voice';
const PING_INTERVAL_MS = 30_000;

export function attachVoiceGateway(server) {
  const wss = new WebSocketServer({
    server,
    path: WS_PATH,
    verifyClient: ({ origin }) => isAllowedOrigin(origin),
    maxPayload: 1 << 20, // 1 MB — audio frames are a few KB
  });

  wss.on('connection', async (ws, req) => {
    // Query params remain as a fallback for older clients; the browser now sends
    // these in its first message instead.
    const params = new URL(req.url, 'http://localhost').searchParams;
    let userName = params.get('name') || undefined;
    let instructions = params.get('instructions') || undefined;
    let voiceName = params.get('voice') || undefined;
    let live = null;
    let closed = false;
    let starting = null;

    const sendJson = (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

    const teardown = () => {
      if (closed) return;
      closed = true;
      live?.close();
      live = null;
    };

    // Browser → Gemini. Audio arrives as binary; everything else is JSON control.
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        live?.sendAudio(data); // pre-ready audio is dropped; the mic starts after 'ready'
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === 'start') {
        // Worth a line in the log: a voice session that starts with 0 characters
        // of instructions is one that has no memory of the user.
        logger.info(
          `Voice start: ${msg.name ?? 'anon'}, ${(msg.instructions || '').length} chars of context, voice=${msg.voice ?? 'default'}`,
        );
        trace(`START name=${msg.name} chars=${(msg.instructions || '').length} hasDrivingMemory=${/driving lesson/i.test(msg.instructions || '')} hasAddress=${/flaxpond/i.test(msg.instructions || '')}`);
        if (starting || live) return; // already opening or open
        if (msg.name) userName = msg.name;
        if (msg.instructions) instructions = msg.instructions;
        if (msg.voice) voiceName = msg.voice;
        starting = openSession();
        return;
      }
      if (!live) return;
      if (msg.type === 'tool_response' && Array.isArray(msg.responses)) live.sendToolResponse(msg.responses);
      else if (msg.type === 'text' && msg.text) live.sendText(msg.text);
    });

    ws.on('close', teardown);
    ws.on('error', (err) => {
      logger.warn('Voice socket error:', err.message);
      teardown();
    });

    // Keepalive: drop half-open connections that stop answering pings.
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    async function openSession() {
    try {
      live = await createLiveSession({
        userName,
        instructions,
        voiceName,
        onEvent: (event) => {
          if (closed) return;
          if (event.type === 'tool_call') {
            for (const call of event.calls ?? []) trace(`TOOL ${call.name} ${JSON.stringify(call.args)}`);
          }
          if (event.type === 'tool_cancel') trace(`CANCELLED ${(event.ids ?? []).join(',')}`);
          if (event.type === 'transcript' && event.role === 'user' && event.text?.trim()) {
            trace(`HEARD "${event.text.trim()}"`);
          }
          if (event.type === 'audio') {
            if (ws.readyState === ws.OPEN) ws.send(event.data); // 24 kHz PCM, binary
            return;
          }
          sendJson(event);
        },
        onError: (err) => {
          logger.error('Gemini Live error:', err?.message ?? err);
          sendJson({ type: 'error', message: 'Voice service hit a problem.' });
        },
        onClose: () => {
          if (!closed && ws.readyState === ws.OPEN) ws.close();
        },
      });

      // The client may have gone away during the async connect.
      if (closed) {
        live.close();
        return;
      }
    } catch (err) {
      const notConfigured = err?.code === 'NOT_CONFIGURED';
      logger.error('Failed to open Gemini Live session:', err?.message ?? err);
      sendJson({
        type: 'error',
        code: err?.code,
        message: notConfigured
          ? "The voice assistant isn't set up yet — add a GEMINI_API_KEY to backend/.env and restart."
          : 'Could not start the voice session. Please try again.',
      });
      ws.close();
    }
    }

    // A client that never sends 'start' (or an older one passing the URL params)
    // still gets a session — after a beat, so the handshake wins the race.
    setTimeout(() => {
      if (!starting && !live && !closed) {
        logger.warn('Voice: no start message arrived — opening with URL params only (stale client?)');
        trace(`NO START MESSAGE (stale browser tab) urlInstructions=${(instructions || '').length}`);
        starting = openSession();
      }
    }, 1500);
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  logger.info(`Voice gateway listening on ws://…${WS_PATH}`);
  return wss;
}
