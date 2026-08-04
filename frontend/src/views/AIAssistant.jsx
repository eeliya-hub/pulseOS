import { MessageSquarePlus, Mic, Send, Settings, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import GlassCard from '../components/GlassCard.jsx';
import { ChatThread } from '../components/PulseMessages.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
import VoiceAssistant from '../components/VoiceAssistant.jsx';
import { toPromptChip, usePulseChat } from '../hooks/usePulseChat.js';

const DEFAULT_PROMPTS = [
  "What's on my calendar today?",
  'What did I have on last week?',
  "What's the news today?",
  'Add gym tomorrow at 7pm',
  "What's the weather?",
  'Add NVDA to my watchlist',
];

export default function AIAssistant({
  conversations,
  activeId,
  messages,
  setMessages,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  initialPrompt,
  onPromptConsumed,
  onOpenAiSettings,
}) {
  const [inputText, setInputText] = useState('');
  const [showVoice, setShowVoice] = useState(false);
  const lastInitialPrompt = useRef('');

  const { isLoading, toolActivity, send, userName, customPrompts } = usePulseChat({ messages, setMessages });
  const prompts = (customPrompts.length ? customPrompts : DEFAULT_PROMPTS).map(toPromptChip).filter((c) => c.text);

  const submit = useCallback(
    (text, label) => {
      const value = (text ?? inputText).trim();
      if (!value) return;
      setInputText('');
      send(value, label);
    },
    [inputText, send],
  );

  useEffect(() => {
    if (!initialPrompt || initialPrompt === lastInitialPrompt.current) return;
    lastInitialPrompt.current = initialPrompt;
    submit(initialPrompt);
    onPromptConsumed();
  }, [initialPrompt, onPromptConsumed, submit]);

  const activeTitle =
    conversations.find((conversation) => conversation.id === activeId)?.title ?? 'New chat';

  return (
    <div className="flex h-full flex-col">
      <ViewHeader lead="Pulse" accent="AI" subtitle="Calm, synced, listening" />
      <GlassCard className="relative flex min-h-0 flex-1 flex-row overflow-hidden" noPadding>
        <aside className="hidden w-52 shrink-0 flex-col border-r border-white/10 bg-white/[0.03] md:flex">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-3">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-white/42">
              Chats
            </p>
            <button
              type="button"
              onClick={onNewConversation}
              className="soft-button grid h-7 w-7 place-items-center rounded-lg text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label="New chat"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="glass-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeId;
              return (
                <div
                  key={conversation.id}
                  className={[
                    'group relative flex items-center rounded-xl transition-colors',
                    isActive ? 'soft-row glow-ring' : 'hover:bg-white/6',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="min-w-0 flex-1 truncate py-2 pl-3 pr-2 text-left text-xs font-medium text-white/80 focus:outline-none"
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conversation.id)}
                    className="mr-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white/35 opacity-0 transition hover:bg-white/10 hover:text-white/80 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="panel-header flex shrink-0 items-center gap-3 px-5 py-3">
            <span className="orb-button grid h-8 w-8 place-items-center rounded-full">
              <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="display-type truncate text-base font-normal leading-none text-white">
                {activeTitle}
              </p>
              <p className="mt-1 text-[0.625rem] font-medium uppercase tracking-[0.2em] text-white/38">
                Current conversation
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenAiSettings}
                aria-label="Pulse AI settings"
                title="Pulse AI settings"
                className="grid h-8 w-8 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onNewConversation}
                className="soft-button inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.6875rem] font-semibold text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:hidden"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                New
              </button>
              <span
                className="glow-dot h-1.5 w-1.5 rounded-full bg-emerald-300 text-emerald-300"
                aria-hidden="true"
              />
            </div>
          </div>

          <ChatThread
            messages={messages}
            isLoading={isLoading}
            toolActivity={toolActivity}
            userInitial={(userName || 'E').slice(0, 1).toUpperCase()}
            className="p-5"
          />

          <div className="shrink-0 border-t border-white/10 bg-white/5 p-3.5 backdrop-blur-xl">
            <div className="hide-scrollbar mb-2.5 flex gap-2 overflow-x-auto">
              {prompts.map((chip, index) => (
                <button
                  key={`${chip.label}-${index}`}
                  type="button"
                  onClick={() => submit(chip.text, chip.label)}
                  title={chip.text}
                  className="soft-button shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-white/72 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <form
              className="group relative flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <button
                type="button"
                onClick={() => setShowVoice(true)}
                aria-label="Start a voice conversation"
                title="Talk to Pulse"
                className="soft-button grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/80 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
              </button>
              <label htmlFor="pulse-ai-message" className="sr-only">
                Message Pulse
              </label>
              <input
                id="pulse-ai-message"
                type="text"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder="Message Pulse..."
                className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/7 py-2.5 pl-4 pr-12 text-sm text-white outline-none transition-all placeholder:text-white/40 focus:border-cyan-100/30 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(116,242,255,0.08)]"
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

            {showVoice && <VoiceAssistant onClose={() => setShowVoice(false)} />}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
