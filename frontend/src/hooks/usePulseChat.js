import { useCallback, useRef, useState } from 'react';
import { runAgent } from '../services/ai/agent.js';
import { buildAiInstructions } from '../services/ai/instructions.js';
import { batchCaption } from '../services/ai/toolCaptions.js';
import { createToolExecutor } from '../services/ai/tools.js';
import { useCalendarEvents } from './useCalendarEvents.js';
import { useLifeData } from './useLifeData.js';
import { useSettings } from './useSettings.js';
import { useTravelStore } from './useTravelStore.js';

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
  const travel = useTravelStore();
  const dataRef = useRef(null);
  dataRef.current = { life, settings, update, calendar, travel };
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
          executeBatch: (calls) => executorRef.current.executeBatch(calls),
          userName: dataRef.current.settings.name,
          instructions: buildAiInstructions(dataRef.current.settings),
          onTools: (calls) => setToolActivity(batchCaption(calls)),
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
