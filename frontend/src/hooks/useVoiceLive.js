import { useCallback, useEffect, useRef, useState } from 'react';
import { useCalendarEvents } from './useCalendarEvents.js';
import { useLifeData } from './useLifeData.js';
import { useSettings } from './useSettings.js';
import { useTravelStore } from './useTravelStore.js';
import { spotifyPlayer } from './useSpotifyPlayer.js';
import { api } from '../services/api/backendClient.js';
import { createAudioPlayer } from '../services/ai/audioPlayer.js';
import { buildAiInstructions } from '../services/ai/instructions.js';
import { createMicRecorder } from '../services/ai/micRecorder.js';
import { createToolExecutor } from '../services/ai/tools.js';
import { batchCaption } from '../services/ai/toolCaptions.js';
import { panelsFromTool, receiptsFromTool, withReceipts } from '../services/ai/voiceContext.js';
import { clearAfterSpeech, runAfterSpeech } from '../services/ui/afterSpeech.js';

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
const EMPTY_PANELS = [];

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
  // Everything this turn's tools found, shaped into cards. A turn often produces
  // several — a brief pulls the weather, the calendar, the news and the football
  // — and the view shows them one at a time as Pulse reaches each one, so they
  // are kept as a list rather than collapsed to whichever landed last.
  const [panels, setPanels] = useState(EMPTY_PANELS);

  // Live app data for tool calls — same store the text assistant reads/writes.
  const life = useLifeData();
  const { settings, update } = useSettings();
  const calendar = useCalendarEvents();
  const travel = useTravelStore();
  const dataRef = useRef(null);
  dataRef.current = { life, settings, update, calendar, travel };
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
  const turnRef = useRef(0); // which turn we're on — a card belongs to the turn that fetched it
  const panelTurnRef = useRef(-1);

  const setStatusSafe = useCallback((next) => {
    if (!stoppedRef.current) setStatus(next);
  }, []);

  // Hold the music under the conversation: part-way down for the whole session
  // so it doesn't compete with the mic, further down while Pulse is speaking.
  // Driven off `status` rather than the individual transitions, so every way a
  // session can end — stopped, errored, socket dropped — releases the music.
  useEffect(() => {
    const level =
      status === VOICE_STATUS.SPEAKING
        ? 'speaking'
        : status === VOICE_STATUS.IDLE || status === VOICE_STATUS.ERROR
          ? 'none'
          : 'listening';
    spotifyPlayer.controls.setDuckLevel(level);
  }, [status]);

  // Unmounting closes the session without another status render, so release here
  // too — otherwise closing mid-answer would leave the music stuck under a voice
  // that is no longer talking.
  useEffect(() => () => spotifyPlayer.controls.setDuckLevel('none'), []);

  // Wipe the answer on screen to make room for the next one.
  const clearResponse = useCallback(() => {
    responseRef.current = '';
    turnClosedRef.current = false;
    setResponse('');
    setActivity('');
    setPanels(EMPTY_PANELS);
    panelTurnRef.current = -1;
  }, []);

  const runToolCalls = useCallback(async (calls) => {
    // Everything one request set going runs together, and is described together —
    // four tasks read as "Adding 4 tasks", not as the first of them.
    setActivity(batchCaption(calls));
    const outcomes = await executorRef.current.executeBatch(calls);

    // What the lookups found becomes cards, in the order the model asked for them
    // (usually the order it goes on to talk). What the changes did becomes ONE
    // receipt for the turn, however many calls and batches it took.
    try {
      const found = [];
      const receipts = [];
      for (const { call, result } of outcomes) {
        found.push(...panelsFromTool(call.name, call.args ?? {}, result));
        receipts.push(...receiptsFromTool(call.name, call.args ?? {}, result, call.id));
      }
      if (found.length || receipts.length) {
        const startingTurn = panelTurnRef.current !== turnRef.current;
        panelTurnRef.current = turnRef.current;
        setPanels((prev) => withReceipts(startingTurn ? found : [...prev, ...found], receipts));
      }
    } catch (error) {
      // Showing the work must never cost the answer. If a card can't be drawn,
      // the results still go back below — otherwise Gemini waits forever and the
      // conversation stalls with the changes already made and never confirmed.
      console.warn('Voice: could not draw this turn’s cards', error);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const responses = outcomes.map(({ call, result }) => ({ id: call.id, name: call.name, response: result }));
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
              // The last answer's cards go with it, but any fetched for the
              // answer now starting have to survive — those tools ran before the
              // first word of it arrived.
              if (panelTurnRef.current !== turnRef.current) setPanels(EMPTY_PANELS);
            }
            // The first words of an answer start its timeline; every chunk after
            // pins where the voice is against the audio queued for it.
            if (!responseRef.current) playerRef.current?.beginTurn();
            responseRef.current += msg.text;
            playerRef.current?.markText(responseRef.current.length);
            setResponse(responseRef.current);
            setActivity(''); // the model is talking now, not tool-running
          }
          // User transcripts aren't shown and no longer clear the answer — the last
          // reply stays put through the next question so there's time to read it.
          break;
        case 'interrupted': // user barged in — cut playback, keep the text until the next answer
          clearAfterSpeech(); // the answer never finished, so neither should what followed it
          playerRef.current?.flush();
          turnClosedRef.current = true; // the next answer replaces what's on screen
          setActivity('');
          setStatusSafe(VOICE_STATUS.LISTENING);
          break;
        case 'turn_complete':
          turnClosedRef.current = true; // keep the answer up until the next one begins
          turnRef.current += 1;
          setActivity('');
          break;
        case 'tool_call':
          runToolCalls(msg.calls || []);
          break;
        case 'tool_cancel':
          // They talked over the work. The calls may still finish — a change made
          // is made — and the receipt shows whatever actually happened.
          setActivity('');
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
    const ws = new WebSocket(api.ai.voiceWsUrl());
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    setStatusSafe(VOICE_STATUS.CONNECTING);

    // Who the user is, how they want Pulse to behave, their saved prompts and
    // everything Pulse remembers — sent as the opening message rather than in
    // the URL, which a long memory list used to overflow (HTTP 431, no voice).
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'start',
          name: dataRef.current.settings.name,
          instructions: buildAiInstructions(dataRef.current.settings),
          voice: dataRef.current.settings.voiceName,
        }),
      );
    };

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
      // Whatever was waiting for Pulse to stop talking happens here — ahead of
      // the guards below, so it still runs if the session is closing.
      if (!playing) runAfterSpeech();
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
  // How far into the answer's text the voice has actually reached, in characters.
  const getSpokenChars = useCallback(
    (totalChars) => playerRef.current?.getSpokenChars?.(totalChars) ?? totalChars ?? 0,
    [],
  );

  return {
    status,
    error,
    response,
    activity,
    panels,
    getMicBands,
    getMicLevel,
    getAiLevel,
    getAiBands,
    getSpokenChars,
    start,
    stop,
    isActive: status !== VOICE_STATUS.IDLE,
  };
}
