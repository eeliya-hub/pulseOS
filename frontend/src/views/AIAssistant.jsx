import { MessageSquarePlus, Mic, Send, Settings, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatThread } from '../components/PulseMessages.jsx';
import { Column, Ground, SkyZone } from '../components/Stage.jsx';
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
      {/* ── Sky: the conversation you're in ──────────────────────────────── */}
      <SkyZone className="flex items-end justify-between gap-8">
        <div className="min-w-0">
          <p className="t-lede flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rise" aria-hidden="true" />
            {conversations.length === 1 ? 'One conversation' : `${conversations.length} conversations`}
          </p>
          <h1 className="t-hero mt-1 truncate">{activeTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-1">
          <button type="button" onClick={onNewConversation} className="pill h-10 px-4">
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            New chat
          </button>
          <button
            type="button"
            onClick={onOpenAiSettings}
            aria-label="Pulse AI settings"
            title="Pulse AI settings"
            className="pill h-10 w-10 px-0 text-moon/75"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </SkyZone>

      {/* ── Ground: your conversations, and the one you're reading ─────────── */}
      <Ground className="grid grid-cols-[15rem_minmax(0,1fr)]">
        <Column label="Conversations" className="pr-6 pt-7" bodyClassName="glass-scroll overflow-y-auto pb-4 pr-1">
          <div className="cascade mt-1 space-y-0.5">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeId;
              return (
                <div
                  key={conversation.id}
                  className={[
                    'group relative flex items-center rounded-[0.9rem] transition-colors',
                    isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.045]',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className={[
                      'min-w-0 flex-1 truncate py-2.5 pl-3 pr-2 text-left text-[0.9375rem] focus:outline-none',
                      isActive ? 'text-moon' : 'text-moon/70',
                    ].join(' ')}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conversation.id)}
                    className="mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-moon/35 opacity-0 transition hover:bg-white/10 hover:text-moon/80 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </Column>

        <div className="ground-rule flex min-h-0 min-w-0 flex-col pl-8 pt-7">
          <ChatThread
            messages={messages}
            isLoading={isLoading}
            toolActivity={toolActivity}
            userInitial={(userName || 'E').slice(0, 1).toUpperCase()}
            className="mx-auto w-full max-w-[46rem] pb-7"
          />

          <div className="mx-auto w-full max-w-[46rem] shrink-0 pb-3 pt-2">
            <div className="hide-scrollbar mb-3 flex gap-2 overflow-x-auto pr-10 [mask-image:linear-gradient(90deg,#000_85%,transparent)]">
              {prompts.map((chip, index) => (
                <button
                  key={`${chip.label}-${index}`}
                  type="button"
                  onClick={() => submit(chip.text, chip.label)}
                  title={chip.text}
                  className="pill h-8 shrink-0 px-3.5 text-[0.8125rem] text-moon/80"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <form
              className="flex items-center gap-1.5 rounded-full bg-white/[0.06] p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl transition focus-within:bg-white/[0.08] focus-within:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
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
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-moon/70 transition hover:bg-white/10 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
                placeholder="Message Pulse"
                className="min-w-0 flex-1 bg-transparent px-2 text-[0.9375rem] text-moon outline-none placeholder:text-moon/40"
              />
              <button
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className="pill pill-lit h-10 w-10 px-0 disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="ml-0.5 h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </Ground>

      {showVoice && <VoiceAssistant onClose={() => setShowVoice(false)} />}
    </div>
  );
}
