import { WebSocketServer } from 'ws';
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
// Up from the browser: { type: 'tool_response', responses } | { type: 'text', text }
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
    const params = new URL(req.url, 'http://localhost').searchParams;
    const userName = params.get('name') || undefined;
    const instructions = params.get('instructions') || undefined;
    const voiceName = params.get('voice') || undefined;
    let live = null;
    let closed = false;

    const sendJson = (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

    const teardown = () => {
      if (closed) return;
      closed = true;
      live?.close();
      live = null;
    };

    // Browser → Gemini. Audio arrives as binary; everything else is JSON control.
    ws.on('message', (data, isBinary) => {
      if (!live) return; // pre-ready frames are dropped; the client starts the mic after 'ready'
      if (isBinary) {
        live.sendAudio(data);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
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

    try {
      live = await createLiveSession({
        userName,
        instructions,
        voiceName,
        onEvent: (event) => {
          if (closed) return;
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
