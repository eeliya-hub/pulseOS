import { Maximize2, MessageSquarePlus, Mic, Send, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toPromptChip, usePulseChat } from '../hooks/usePulseChat.js';
import { ChatThread } from './PulseMessages.jsx';

const DEFAULT_PROMPTS = ["What's on my calendar today?", "What's the news?", "What's the weather?"];

/**
 * A compact, floating chat window — the popover you get from the dock's Pulse
 * launcher. Shares the active conversation with the full page, so expanding
 * carries the thread straight over.
 *
 * @param {object} p
 * @param {Array} p.messages
 * @param {(updater)=>void} p.setMessages
 * @param {()=>void} p.onClose
 * @param {()=>void} p.onExpand   open the full AI page with this conversation
 * @param {()=>void} p.onVoice    switch to the voice assistant
 * @param {()=>void} p.onNewChat  start a fresh conversation
 */
export default function ChatPopover({ messages, setMessages, onClose, onExpand, onVoice, onNewChat }) {
  const [inputText, setInputText] = useState('');
  const { isLoading, toolActivity, send, userName, customPrompts } = usePulseChat({ messages, setMessages });
  const quickPrompts = (customPrompts.length ? customPrompts : DEFAULT_PROMPTS)
    .map(toPromptChip)
    .filter((c) => c.text);

  const submit = (text, label) => {
    const value = (text ?? inputText).trim();
    if (!value) return;
    setInputText('');
    send(value, label);
  };

  return createPortal(
    <div
      data-settings=""
      className="pointer-events-none fixed inset-x-0 bottom-[5.75rem] z-[65] flex justify-center px-4"
    >
      <div className="theme-card pointer-events-auto fade-in flex h-[min(34rem,calc(100dvh-8.5rem))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.75rem] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="orb-button grid h-8 w-8 shrink-0 place-items-center rounded-full">
            <Sparkles className="h-4 w-4 text-moon" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="display-type truncate text-sm font-normal leading-none text-moon">Pulse</p>
            <p className="mt-1 text-[0.75rem] font-medium text-moon/38">Here to help</p>
          </div>
          <button
            type="button"
            onClick={onNewChat}
            aria-label="New chat"
            title="New chat"
            className="soft-button grid h-7 w-7 place-items-center rounded-lg text-moon/70 transition hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onExpand}
            aria-label="Expand to full screen"
            title="Expand"
            className="soft-button grid h-7 w-7 place-items-center rounded-lg text-moon/70 transition hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="grid h-7 w-7 place-items-center rounded-lg text-moon/55 transition hover:bg-white/10 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Thread */}
        <ChatThread
          messages={messages}
          isLoading={isLoading}
          toolActivity={toolActivity}
          userInitial={(userName || 'E').slice(0, 1).toUpperCase()}
          className="p-4"
        />

        {/* Composer */}
        <div className="shrink-0 border-t border-white/10 bg-white/5 p-3 backdrop-blur-xl">
          {messages.length <= 1 ? (
            <div className="hide-scrollbar mb-2 flex gap-2 overflow-x-auto">
              {quickPrompts.map((chip, index) => (
                <button
                  key={`${chip.label}-${index}`}
                  type="button"
                  onClick={() => submit(chip.text, chip.label)}
                  title={chip.text}
                  className="soft-button shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-moon/72 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="relative flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <button
              type="button"
              onClick={onVoice}
              aria-label="Talk to Pulse"
              title="Talk to Pulse"
              className="soft-button grid h-9 w-9 shrink-0 place-items-center rounded-full text-moon/80 transition hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
            <label htmlFor="pulse-popover-message" className="sr-only">
              Ask anything
            </label>
            <input
              id="pulse-popover-message"
              type="text"
              autoFocus
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="Ask anything"
              className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/7 py-2.5 pl-4 pr-11 text-sm text-moon outline-none transition-all placeholder:text-moon/40 focus:border-accent/30 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(116,242,255,0.08)]"
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="orb-button absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-105 disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
