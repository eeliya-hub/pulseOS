import { useCallback, useRef, useState } from 'react';
import { runAgent } from '../services/ai/agent.js';
import { buildAiInstructions } from '../services/ai/instructions.js';
import { createToolExecutor } from '../services/ai/tools.js';
import { useCalendarEvents } from './useCalendarEvents.js';
import { useLifeData } from './useLifeData.js';
import { useSettings } from './useSettings.js';

// Friendly captions shown while each tool runs.
export const TOOL_LABELS = {
  get_upcoming_events: 'Checking your calendar',
  get_past_events: 'Looking back through your calendar',
  get_today: 'Reading your day',
  get_weather: 'Checking the weather',
  get_news: 'Reading the news',
  search_web: 'Searching the internet',
  get_sports: 'Checking the scores',
  get_stocks: 'Pulling your watchlist',
  list_calendars: 'Checking your calendars',
  create_calendar_event: 'Adding the event',
  delete_calendar_event: 'Removing the event',
  add_task: 'Adding the task',
  complete_task: 'Completing the task',
  add_habit: 'Adding the habit',
  set_location: 'Updating your location',
  add_stock: 'Updating your watchlist',
  remember: 'Making a note',
  forget: 'Forgetting that',
  list_memories: 'Recalling what I know',
  open_app: 'Opening the app',
  play_music: 'Starting the music',
  pause_music: 'Pausing the music',
  next_track: 'Skipping ahead',
  previous_track: 'Going back a track',
  get_now_playing: 'Checking what’s playing',
};

const quote = (text, max = 40) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return `“${clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean}”`;
};

/**
 * The caption shown while a tool runs. Where the tool took a subject (a search
 * query, a place, an app), it goes in the caption — so the status says what
 * Pulse is actually doing rather than a generic stand-in.
 */
export function toolCaption(name, args = {}) {
  const base = TOOL_LABELS[name] || 'Working';
  const query = (args?.query || '').trim();
  switch (name) {
    case 'search_web':
      return query ? `Searching the internet for ${quote(query)}` : base;
    case 'get_news':
      return query ? `Reading the news on ${quote(query)}` : args?.scope === 'local' ? 'Reading local news' : base;
    case 'get_weather':
      return args?.location ? `Checking the weather in ${args.location}` : base;
    case 'play_music':
      return query ? `Putting on ${quote(query)}` : base;
    case 'open_app':
      return args?.name ? `Opening ${args.name}` : base;
    default:
      return base;
  }
}

// Normalize a quick prompt (a plain string default, or a { title, prompt } custom
// entry) into { label, text }: what the chip shows vs. what it sends.
export function toPromptChip(p) {
  if (typeof p === 'string') return { label: p, text: p };
  const text = (p?.prompt ?? '').trim();
  return { label: (p?.title || text).trim(), text };
}

/**
 * The shared chat engine behind both the full AI page and the compact popover.
 * Owns the loading + tool-activity state and the agent loop; the conversation
 * itself lives in the caller (so both hosts share one thread).
 *
 * @param {object} p
 * @param {Array} p.messages
 * @param {(updater)=>void} p.setMessages
 */
export function usePulseChat({ messages, setMessages }) {
  const [isLoading, setIsLoading] = useState(false);
  const [toolActivity, setToolActivity] = useState(null);

  // Live app data the tools read/write. A ref keeps the executor pointed at the
  // latest values without rebuilding it every render.
  const life = useLifeData();
  const { settings, update } = useSettings();
  const calendar = useCalendarEvents();
  const dataRef = useRef(null);
  dataRef.current = { life, settings, update, calendar };
  const executorRef = useRef(null);
  if (!executorRef.current) executorRef.current = createToolExecutor(() => dataRef.current);

  /**
   * Send a message. `label` is what the bubble shows when it differs from what
   * gets sent — a quick prompt reads as its title ("Daily brief") while Pulse
   * still receives the full instruction behind it.
   */
  const send = useCallback(
    async (text, label) => {
      const value = (text ?? '').trim();
      if (!value || isLoading) return;

      const shown = (label ?? '').trim();
      const userMessage = { role: 'user', text: value };
      if (shown && shown !== value) userMessage.label = shown;
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setIsLoading(true);
      setToolActivity(null);

      try {
        const modelMessages = nextMessages
          .slice(-12)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
        const reply = await runAgent({
          messages: modelMessages,
          execute: (name, args) => executorRef.current.execute(name, args),
          userName: dataRef.current.settings.name,
          instructions: buildAiInstructions(dataRef.current.settings),
          onTool: (name, args) => setToolActivity(toolCaption(name, args)),
        });
        setMessages((current) => [...current, { role: 'model', text: reply }]);
      } catch (error) {
        const notConfigured =
          error?.code === 'NOT_CONFIGURED' || /not configured/i.test(error?.message || '');
        setMessages((current) => [
          ...current,
          {
            role: 'model',
            text: notConfigured
              ? "The assistant isn't set up yet — add an AI key to `backend/.env` and restart the backend, then I can read and update your dashboard."
              : 'Sorry, I hit a problem reaching the assistant. Please try again in a moment.',
          },
        ]);
      } finally {
        setIsLoading(false);
        setToolActivity(null);
      }
    },
    [isLoading, messages, setMessages],
  );

  return {
    isLoading,
    toolActivity,
    send,
    userName: settings.name,
    customPrompts: settings.customPrompts ?? [],
  };
}
