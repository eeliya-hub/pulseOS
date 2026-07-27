import { useCallback, useRef, useState } from 'react';
import { useCalendarEvents } from './useCalendarEvents.js';
import { useLifeData } from './useLifeData.js';
import { useSettings } from './useSettings.js';
import { api } from '../services/api/backendClient.js';
import { createAudioPlayer } from '../services/ai/audioPlayer.js';
import { buildAiInstructions } from '../services/ai/instructions.js';
import { createMicRecorder } from '../services/ai/micRecorder.js';
import { createToolExecutor } from '../services/ai/tools.js';

// Voice session states, surfaced to the UI.
// idle → requesting-mic → connecting → listening ⇄ speaking → (error | idle)
export const VOICE_STATUS = {
  IDLE: 'idle',
  REQUESTING_MIC: 'requesting-mic',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

const MAX_RECONNECTS = 4;

/**
 * Owns a full-duplex Gemini Live voice session: mic capture → backend WS → Gemini
 * → streamed audio back. Reconnects transparently if the socket drops, and runs
 * any tool calls the model makes against live app state (same executor the text
 * assistant uses), so voice can read and change the dashboard too.
 *
 * The UI is deliberately answer-only: no chat log, no echo of what the user said.
 * `response` holds just the current spoken answer — it lingers after the turn ends
 * and is wiped the instant the next question begins, so one reply is on screen at
 * a time. `getMicBands`/`getAiLevel` expose live audio for the visualisers.
 */
export function useVoiceLive() {
  const [status, setStatus] = useState(VOICE_STATUS.IDLE);
  const [error, setError] = useState('');
  const [response, setResponse] = useState(''); // the AI's current spoken answer (ephemeral)
  const [activity, setActivity] = useState(''); // tool the AI is running, e.g. 'get_weather'

  // Live app data for tool calls — same store the text assistant reads/writes.
  const life = useLifeData();
  const { settings, update } = useSettings();
  const calendar = useCalendarEvents();
  const dataRef = useRef(null);
  dataRef.current = { life, settings, update, calendar };
  const executorRef = useRef(null);
  if (!executorRef.current) executorRef.current = createToolExecutor(() => dataRef.current);

  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const playerRef = useRef(null);
  const readyRef = useRef(false); // Gemini setup complete — safe to stream mic
  const stoppedRef = useRef(false); // user asked to stop; suppress reconnects
  const retriesRef = useRef(0);
  const genRef = useRef(0); // session generation — invalidates stale async work
  const responseRef = useRef(''); // live copy of the AI answer being spoken
  const turnClosedRef = useRef(false); // answer finished; next input replaces it

  const setStatusSafe = useCallback((next) => {
    if (!stoppedRef.current) setStatus(next);
  }, []);

  // Wipe the answer on screen to make room for the next one.
  const clearResponse = useCallback(() => {
    responseRef.current = '';
    turnClosedRef.current = false;
    setResponse('');
    setActivity('');
  }, []);

  const runToolCalls = useCallback(async (calls) => {
    const responses = [];
    for (const call of calls) {
      const result = await executorRef.current.execute(call.name, call.args);
      responses.push({ id: call.id, name: call.name, response: result ?? {} });
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'tool_response', responses }));
    }
  }, []);

  const handleServerMessage = useCallback(
    (event) => {
      // Binary frames are model audio; play them as they arrive.
      if (event.data instanceof ArrayBuffer) {
        playerRef.current?.enqueue(event.data);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ready':
          readyRef.current = true;
          retriesRef.current = 0;
          setStatusSafe(VOICE_STATUS.LISTENING);
          break;
        case 'transcript':
          if (msg.role === 'model') {
            // The previous answer lingers until this one actually starts — its
            // first token wipes it and replaces it, so nothing blinks away early.
            if (turnClosedRef.current) {
              responseRef.current = '';
              turnClosedRef.current = false;
            }
            responseRef.current += msg.text;
            setResponse(responseRef.current);
            setActivity(''); // the model is talking now, not tool-running
          }
          // User transcripts aren't shown and no longer clear the answer — the last
          // reply stays put through the next question so there's time to read it.
          break;
        case 'interrupted': // user barged in — cut playback, keep the text until the next answer
          playerRef.current?.flush();
          turnClosedRef.current = true; // the next answer replaces what's on screen
          setActivity('');
          setStatusSafe(VOICE_STATUS.LISTENING);
          break;
        case 'turn_complete':
          turnClosedRef.current = true; // keep the answer up until the next one begins
          setActivity('');
          break;
        case 'tool_call':
          setActivity(msg.calls?.[0]?.name || 'working');
          runToolCalls(msg.calls || []);
          break;
        case 'error':
          setError(msg.message || 'The voice assistant hit a problem.');
          setStatusSafe(VOICE_STATUS.ERROR);
          stoppedRef.current = true; // don't reconnect on a server-declared error
          break;
        default:
          break;
      }
    },
    [runToolCalls, setStatusSafe],
  );

  // Open (or re-open) the socket. Mic + player are already running by this point.
  const connect = useCallback(() => {
    readyRef.current = false;
    const ws = new WebSocket(
      api.ai.voiceWsUrl(
        dataRef.current.settings.name,
        buildAiInstructions(dataRef.current.settings),
        dataRef.current.settings.voiceName,
      ),
    );
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    setStatusSafe(VOICE_STATUS.CONNECTING);

    ws.onmessage = handleServerMessage;
    ws.onerror = () => {
      /* surfaced via onclose */
    };
    ws.onclose = () => {
      readyRef.current = false;
      if (stoppedRef.current) return;
      if (retriesRef.current >= MAX_RECONNECTS) {
        setError('Lost the connection to the voice assistant. Tap the mic to try again.');
        setStatusSafe(VOICE_STATUS.ERROR);
        return;
      }
      const delay = 400 * 2 ** retriesRef.current;
      retriesRef.current += 1;
      setStatusSafe(VOICE_STATUS.CONNECTING);
      window.setTimeout(() => {
        if (!stoppedRef.current) connect();
      }, delay);
    };
  }, [handleServerMessage, setStatusSafe]);

  // Neutralise the socket and release mic + audio. Safe to call with nothing open.
  const teardown = useCallback(async () => {
    readyRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    await recorderRef.current?.stop();
    await playerRef.current?.close();
    recorderRef.current = null;
    playerRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    stoppedRef.current = true;
    genRef.current += 1; // abort any in-flight start()
    await teardown();
    clearResponse();
    setStatus(VOICE_STATUS.IDLE);
  }, [teardown, clearResponse]);

  const start = useCallback(async () => {
    // Open a fresh generation up front. Any earlier start() still mid-await sees a
    // newer gen and bails, so a React StrictMode remount (or a rapid re-open) can
    // never leave two mics/sockets live at once.
    const gen = (genRef.current += 1);
    stoppedRef.current = false;
    retriesRef.current = 0;
    setError('');
    clearResponse();
    await teardown(); // clear out a half-open previous session before starting
    if (gen !== genRef.current) return;

    // Player: playback state drives the listening ⇄ speaking indicator.
    const player = createAudioPlayer();
    player.setOnPlayingChange((playing) => {
      if (stoppedRef.current || !readyRef.current) return;
      setStatusSafe(playing ? VOICE_STATUS.SPEAKING : VOICE_STATUS.LISTENING);
    });
    player.resume(); // unlock audio output within this click gesture
    playerRef.current = player;

    // Mic: stream frames only once Gemini says it's ready — and only while this
    // generation is still the active one.
    const recorder = createMicRecorder({
      onFrame: (buffer) => {
        if (gen === genRef.current && readyRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(buffer);
        }
      },
    });
    recorderRef.current = recorder;

    try {
      setStatus(VOICE_STATUS.REQUESTING_MIC);
      await recorder.start();
    } catch (err) {
      if (gen !== genRef.current) return; // superseded while asking for the mic
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      setError(
        denied
          ? 'Microphone access was blocked. Allow the mic in your browser settings, then try again.'
          : err?.message || 'Could not access the microphone.',
      );
      setStatus(VOICE_STATUS.ERROR);
      await recorder.stop().catch(() => {});
      recorderRef.current = null;
      playerRef.current = null;
      return;
    }

    if (gen !== genRef.current || stoppedRef.current) {
      await recorder.stop().catch(() => {}); // torn down while acquiring the mic
      return;
    }
    connect();
  }, [clearResponse, connect, setStatusSafe, teardown]);

  // Live audio for the visualisers. Stable getters that read whichever source is
  // currently mounted — the mic while you talk, the player while Pulse talks.
  const getMicBands = useCallback((count) => recorderRef.current?.getBands?.(count) ?? [], []);
  const getMicLevel = useCallback(() => recorderRef.current?.getLevel?.() ?? 0, []);
  const getAiLevel = useCallback(() => playerRef.current?.getLevel?.() ?? 0, []);
  const getAiBands = useCallback((count) => playerRef.current?.getBands?.(count) ?? [], []);
  // How far through the current spoken answer the audio actually is (0..1).
  const getSpeechProgress = useCallback(() => playerRef.current?.getSpeechProgress?.() ?? 1, []);

  return {
    status,
    error,
    response,
    activity,
    getMicBands,
    getMicLevel,
    getAiLevel,
    getAiBands,
    getSpeechProgress,
    start,
    stop,
    isActive: status !== VOICE_STATUS.IDLE,
  };
}
