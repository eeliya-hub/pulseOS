import { MessageSquarePlus, Send, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import GlassCard from '../components/GlassCard.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
import { useCalendarEvents } from '../hooks/useCalendarEvents.js';
import { useLifeData } from '../hooks/useLifeData.js';
import { useSettings } from '../hooks/useSettings.js';
import { runAgent } from '../services/ai/agent.js';
import { createToolExecutor } from '../services/ai/tools.js';

const prompts = [
  "What's on my calendar today?",
  'Add a task to call the dentist',
  'Add gym tomorrow at 7pm',
  "What's the weather?",
  'Add NVDA to my watchlist',
];

// Friendly captions shown while each tool runs.
const TOOL_LABELS = {
  get_upcoming_events: 'Checking your calendar',
  get_today: 'Reading your day',
  get_weather: 'Checking the weather',
  get_stocks: 'Pulling your watchlist',
  create_calendar_event: 'Adding the event',
  delete_calendar_event: 'Removing the event',
  add_task: 'Adding the task',
  complete_task: 'Completing the task',
  add_habit: 'Adding the habit',
  set_location: 'Updating your location',
  add_stock: 'Updating your watchlist',
  open_app: 'Opening the app',
};

function LoadingDots() {
  return (
    <div className="flex h-5 items-center space-x-1.5">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-100/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function formatText(text) {
  return text.split('\n').map((line, lineIndex) => (
    <p key={`${line}-${lineIndex}`} className={line.trim() === '' ? 'h-3' : 'mb-1.5'}>
      {line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={`${part}-${partIndex}`} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  ));
}

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
}) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolActivity, setToolActivity] = useState(null);
  const lastInitialPrompt = useRef('');
  const messagesRef = useRef(null);

  // Live app data the AI can read/write. A ref keeps the tool executor pointed
  // at the latest values without rebuilding it every render.
  const life = useLifeData();
  const { settings, update } = useSettings();
  const calendar = useCalendarEvents();
  const dataRef = useRef(null);
  dataRef.current = { life, settings, update, calendar };
  const executorRef = useRef(null);
  if (!executorRef.current) executorRef.current = createToolExecutor(() => dataRef.current);

  const handleSend = useCallback(
    async (textToProcess) => {
      const text = (textToProcess ?? inputText).trim();
      if (!text || isLoading) return;

      setInputText('');
      const nextMessages = [...messages, { role: 'user', text }];
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
          onTool: (name) => setToolActivity(TOOL_LABELS[name] || 'Working'),
        });
        setMessages((current) => [...current, { role: 'model', text: reply }]);
      } catch (error) {
        const notConfigured = error?.code === 'NOT_CONFIGURED' || /not configured/i.test(error?.message || '');
        setMessages((current) => [
          ...current,
          {
            role: 'model',
            text: notConfigured
              ? "The assistant isn't set up yet — add a **GEMINI_API_KEY** to `backend/.env` and restart the backend, then I can read and update your dashboard."
              : 'Sorry, I hit a problem reaching the assistant. Please try again in a moment.',
          },
        ]);
      } finally {
        setIsLoading(false);
        setToolActivity(null);
      }
    },
    [inputText, isLoading, messages, setMessages],
  );

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading, activeId]);

  useEffect(() => {
    if (!initialPrompt || initialPrompt === lastInitialPrompt.current) return;
    lastInitialPrompt.current = initialPrompt;
    handleSend(initialPrompt);
    onPromptConsumed();
  }, [handleSend, initialPrompt, onPromptConsumed]);

  const activeTitle =
    conversations.find((conversation) => conversation.id === activeId)?.title ?? 'New chat';

  return (
    <div className="flex h-full flex-col">
      <ViewHeader lead="Pulse" accent="AI" subtitle="Calm, synced, listening" />
      <GlassCard className="relative flex min-h-0 flex-1 flex-row overflow-hidden" noPadding>
        <aside className="hidden w-52 shrink-0 flex-col border-r border-white/10 bg-white/[0.03] md:flex">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
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
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/38">
                Current conversation
              </p>
            </div>
            <button
              type="button"
              onClick={onNewConversation}
              className="soft-button ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:hidden"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              New
            </button>
            <span
              className="glow-dot ml-auto h-1.5 w-1.5 rounded-full bg-emerald-300 text-emerald-300 md:ml-2"
              aria-hidden="true"
            />
          </div>

          <div ref={messagesRef} className="glass-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((message, index) => {
              const isUser = message.role === 'user';

              return (
                <div
                  key={`${message.role}-${index}`}
                  className={`fade-in flex gap-3 ${isUser ? 'justify-end' : ''}`}
                  style={{ '--delay': '0ms' }}
                >
                  {!isUser ? (
                    <span className="orb-button grid h-8 w-8 shrink-0 place-items-center rounded-full">
                      <Sparkles className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                    </span>
                  ) : null}

                  <div
                    className={`max-w-[75%] border border-white/10 p-3.5 text-sm leading-6 text-white/88 shadow-lg backdrop-blur-md ${
                      isUser
                        ? 'rounded-2xl rounded-tr-md bg-white/16'
                        : 'rounded-2xl rounded-tl-md bg-white/6'
                    }`}
                  >
                    {isUser ? <p>{message.text}</p> : formatText(message.text)}
                  </div>

                  {isUser ? (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/18 text-sm font-semibold shadow-lg">
                      E
                    </span>
                  ) : null}
                </div>
              );
            })}

            {isLoading ? (
              <div className="fade-in flex gap-3">
                <span className="orb-button grid h-8 w-8 shrink-0 place-items-center rounded-full">
                  <Sparkles className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                </span>
                <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-md">
                  <LoadingDots />
                  {toolActivity ? <span className="text-xs font-medium text-white/60">{toolActivity}…</span> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-white/10 bg-white/5 p-3.5 backdrop-blur-xl">
            <div className="hide-scrollbar mb-2.5 flex gap-2 overflow-x-auto">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="soft-button shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-white/72 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              className="group relative flex items-center"
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
            >
              <label htmlFor="pulse-ai-message" className="sr-only">
                Message Pulse
              </label>
              <input
                id="pulse-ai-message"
                type="text"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder="Message Pulse..."
                className="w-full rounded-full border border-white/12 bg-white/7 py-2.5 pl-4 pr-12 text-sm text-white outline-none transition-all placeholder:text-white/40 focus:border-cyan-100/30 focus:bg-white/10 focus:shadow-[0_0_20px_rgba(116,242,255,0.08)]"
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
      </GlassCard>
    </div>
  );
}
