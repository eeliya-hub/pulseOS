import {
  ArrowLeft,
  AudioLines,
  Brain,
  CalendarDays,
  CloudSun,
  Globe,
  Loader2,
  MessageSquareText,
  Music2,
  Newspaper,
  Play,
  Plus,
  Sparkles,
  Trophy,
  TrendingUp,
  Trash2,
  Volume2,
  Wand2,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../hooks/useSettings.js';
import { api } from '../services/api/backendClient.js';
import { VOICES } from '../services/ai/voices.js';

// A fully-opaque ambient backdrop so the page reads as its own surface rather
// than a translucent overlay on the dashboard.
const PAGE_BG = {
  background:
    'radial-gradient(120% 90% at 12% -10%, rgba(96,124,214,0.20), transparent 55%),' +
    'radial-gradient(120% 100% at 100% 110%, rgba(150,110,214,0.18), transparent 55%),' +
    'linear-gradient(180deg, #0b0f1e 0%, #080b15 100%)',
};

// One section per pane. Everything about Pulse lives under exactly one of these,
// so the page never asks you to scan four cards to find one setting.
const SECTIONS = [
  {
    id: 'personality',
    label: 'Personality',
    icon: Wand2,
    title: 'Personality',
    blurb: 'How Pulse talks to you — tone, length and focus. Followed in every text and voice reply.',
  },
  {
    id: 'voice',
    label: 'Voice',
    icon: AudioLines,
    title: 'Voice',
    blurb: 'The voice Pulse speaks with. Pinning one stops it drifting between sessions.',
  },
  {
    id: 'prompts',
    label: 'Quick prompts',
    icon: MessageSquareText,
    title: 'Quick prompts',
    blurb: 'Your own one-tap chips, shown under the composer in every chat.',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: Brain,
    title: 'Memory',
    blurb: 'What Pulse remembers about you between conversations. It writes here as you chat.',
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    icon: Waypoints,
    title: 'Capabilities',
    blurb: 'What Pulse can reach on your behalf, and how much of today’s free allowance is left.',
  },
];

// Starting points for the personality box — tapping one appends its text, so you
// can stack a couple and edit from there rather than facing an empty field.
const STARTERS = [
  {
    label: 'Jarvis',
    text: 'Speak like Jarvis: unflappable, dry wit, never fawning. Address me as Mr Nayeri.',
  },
  {
    label: 'Straight to it',
    text: 'Lead with the answer. Two sentences unless I ask for more, and no preamble.',
  },
  {
    label: 'Warm',
    text: 'Be warm and conversational — notice how my day looks and say something human about it, not just the facts.',
  },
  {
    label: 'Nudge me',
    text: 'Keep me honest about my tasks and habits. If I am behind, say so plainly and suggest the next thing to do.',
  },
];

/**
 * Full-page AI settings, laid out as a proper settings app: a section rail on the
 * left, one focused pane on the right. Owns personality, voice, quick prompts,
 * long-term memory, and a live read-out of what Pulse can currently reach.
 */
export default function AISettings({ onClose }) {
  const { settings, update } = useSettings();
  const [section, setSection] = useState('personality');
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const counts = {
    prompts: (settings.customPrompts ?? []).length || null,
    memory: (settings.memories ?? []).length || null,
  };

  return createPortal(
    <div data-settings="" className="fixed inset-0 z-[75] flex flex-col text-moon" style={PAGE_BG}>
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4 md:px-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="soft-button grid h-9 w-9 place-items-center rounded-full text-moon/75 transition hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="orb-button grid h-9 w-9 place-items-center rounded-2xl">
          <Sparkles className="h-4 w-4 text-moon" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="display-type truncate text-lg font-light leading-none text-moon text-glow">Pulse AI</h1>
          <p className="mt-1 truncate text-[0.75rem] font-medium text-moon/38">
            {active.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-full bg-white/8 px-4 py-2 text-xs font-semibold text-moon/80 ring-1 ring-white/12 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Done
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Section rail — a vertical list on wide screens, a chip row on small */}
        <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r border-white/10 p-3 md:flex" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <NavItem
              key={s.id}
              section={s}
              badge={counts[s.id]}
              active={s.id === section}
              onClick={() => setSection(s.id)}
            />
          ))}
        </nav>

        <div className="hide-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 px-4 py-2.5 md:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={[
                'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                s.id === section ? 'bg-accent/15 text-accent ring-1 ring-accent/30' : 'soft-button text-moon/70',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* The pane */}
        <main className="glass-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-5 md:p-8">
            <div className="mb-5">
              <h2 className="display-type text-2xl font-light text-moon text-glow">{active.title}</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-moon/50">{active.blurb}</p>
            </div>

            {section === 'personality' && <PersonalityPane settings={settings} update={update} />}
            {section === 'voice' && <VoicePane settings={settings} update={update} />}
            {section === 'prompts' && <PromptsPane settings={settings} update={update} />}
            {section === 'memory' && <MemoryPane settings={settings} update={update} />}
            {section === 'capabilities' && <CapabilitiesPane />}
          </div>
        </main>
      </div>
    </div>,
    document.body,
  );
}

function NavItem({ section, active, badge, onClick }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
        active ? 'soft-row glow-ring text-moon' : 'text-moon/60 hover:bg-white/6 hover:text-moon/85',
      ].join(' ')}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent/90' : 'text-moon/45'}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">{section.label}</span>
      {badge ? (
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.75rem] font-bold text-moon/60">{badge}</span>
      ) : null}
    </button>
  );
}

/* ── Personality ─────────────────────────────────────────────────────────── */

function PersonalityPane({ settings, update }) {
  const instructions = settings.aiInstructions ?? '';

  // Starters stack rather than overwrite — you can tap two and edit from there.
  const addStarter = (text) => {
    const current = instructions.trim();
    if (current.includes(text)) return;
    update({ aiInstructions: current ? `${current}\n${text}` : text });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => addStarter(s.text)}
            title={s.text}
            className="soft-button inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-moon/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Plus className="h-3 w-3 text-accent/80" aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      <section className="theme-card rounded-3xl p-4">
        <textarea
          value={instructions}
          onChange={(e) => update({ aiInstructions: e.target.value })}
          placeholder={
            'e.g. Respond like Jarvis and call me Mr Nayeri. Be concise but add a touch of wit. ' +
            'Comment on things — the weather, a song, the day ahead — not just the facts.'
          }
          className="glass-scroll min-h-[18rem] w-full resize-y rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3.5 text-[0.9375rem] leading-7 text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/[0.08]"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => update({ aiInstructions: '' })}
            disabled={!instructions}
            className="rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-moon/40 transition hover:bg-white/8 hover:text-rose-300/90 focus:outline-none disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-moon/40"
          >
            Clear
          </button>
          <span className="text-[0.75rem] font-medium text-moon/30">{instructions.length} characters</span>
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-moon/35">
        Your wording wins over Pulse’s default tone — but never over its tool rules, so it will still check your real
        calendar, weather and the web before answering.
      </p>
    </div>
  );
}

/* ── Voice ───────────────────────────────────────────────────────────────── */

function VoicePane({ settings, update }) {
  // 'loading:<id>' | 'playing:<id>' | ''
  const [preview, setPreview] = useState('');
  const audioRef = useRef(null);
  const selected = settings.voiceName ?? 'Puck';

  useEffect(() => () => audioRef.current?.pause(), []);

  const playVoicePreview = async (voiceId) => {
    audioRef.current?.pause();
    setPreview(`loading:${voiceId}`);
    try {
      const { audio } = await api.ai.voicePreview(voiceId);
      const el = new Audio(`data:audio/wav;base64,${audio}`);
      audioRef.current = el;
      el.onended = () => setPreview((p) => (p === `playing:${voiceId}` ? '' : p));
      el.onerror = () => setPreview('');
      await el.play();
      setPreview(`playing:${voiceId}`);
    } catch {
      setPreview('');
    }
  };

  const current = VOICES.find((v) => v.id === selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/[0.07] px-4 py-3">
        <AudioLines className="h-4 w-4 shrink-0 text-accent/80" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-moon/75">
          Speaking as <span className="font-semibold text-accent">{current?.label ?? selected}</span>
          {current ? <span className="text-moon/40"> · {current.note.toLowerCase()}</span> : null}
        </p>
        <span className="shrink-0 text-[0.75rem] font-medium text-moon/35">
          Next session
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {VOICES.map((voice) => {
          const on = selected === voice.id;
          const loading = preview === `loading:${voice.id}`;
          const playing = preview === `playing:${voice.id}`;
          return (
            <div
              key={voice.id}
              className={[
                'relative rounded-2xl border transition',
                on
                  ? 'border-accent/40 bg-accent/12 ring-1 ring-accent/25'
                  : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => update({ voiceName: voice.id })}
                aria-pressed={on}
                className="flex w-full flex-col items-start rounded-2xl px-3.5 py-3 pr-10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span className={`text-sm font-semibold ${on ? 'text-accent' : 'text-moon/85'}`}>{voice.label}</span>
                <span className="mt-0.5 text-[0.8125rem]">
                  <span className={voice.gender === 'female' ? 'text-rose-200/85' : 'text-sky-200/85'}>
                    {voice.gender === 'female' ? 'Female' : 'Male'}
                  </span>
                  <span className="text-moon/35"> · {voice.note}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => playVoicePreview(voice.id)}
                aria-label={`Preview ${voice.label} voice`}
                title="Preview"
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/10 text-moon/70 transition hover:bg-white/20 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : playing ? (
                  <Volume2 className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
                ) : (
                  <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Quick prompts ───────────────────────────────────────────────────────── */

function PromptsPane({ settings, update }) {
  const prompts = settings.customPrompts ?? [];
  const [draft, setDraft] = useState({ title: '', prompt: '' });

  const setPrompts = (next) => update({ customPrompts: next });
  const addPrompt = () => {
    const title = draft.title.trim();
    const prompt = draft.prompt.trim();
    if (!prompt) return; // the sent text is required; the title is optional
    setPrompts([...prompts, { title: title || prompt.slice(0, 40), prompt }]);
    setDraft({ title: '', prompt: '' });
  };
  const editPrompt = (index, patch) => setPrompts(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const removePrompt = (index) => setPrompts(prompts.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {prompts.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No quick prompts yet"
          hint="Add one below and it becomes a chip you can tap in any chat."
        />
      ) : (
        prompts.map((prompt, index) => (
          <div
            key={index}
            className="group rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent/12 text-[0.8125rem] font-bold text-accent/90">
                {index + 1}
              </span>
              <input
                value={prompt.title ?? ''}
                onChange={(e) => editPrompt(index, { title: e.target.value })}
                placeholder="Title (chip label)"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-moon outline-none placeholder:font-normal placeholder:text-moon/30"
              />
              <button
                type="button"
                onClick={() => removePrompt(index)}
                aria-label="Delete prompt"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-moon/30 opacity-0 transition hover:bg-white/10 hover:text-rose-300 focus:opacity-100 focus:outline-none group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <textarea
              value={prompt.prompt ?? ''}
              onChange={(e) => editPrompt(index, { prompt: e.target.value })}
              rows={2}
              placeholder="What it sends to Pulse…"
              className="glass-scroll mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[0.8125rem] leading-6 text-moon/85 outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-black/25"
            />
          </div>
        ))
      )}

      <div className="theme-card rounded-2xl p-3.5">
        <input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="New prompt title, e.g. Daily brief"
          className="w-full bg-transparent text-sm font-semibold text-moon outline-none placeholder:font-normal placeholder:text-moon/35"
        />
        <textarea
          value={draft.prompt}
          onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              addPrompt();
            }
          }}
          rows={2}
          placeholder="What it sends to Pulse…"
          className="glass-scroll mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[0.8125rem] leading-6 text-moon/85 outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-black/25"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[0.75rem] text-moon/30">⌘/Ctrl + Enter</span>
          <button
            type="button"
            onClick={addPrompt}
            disabled={!draft.prompt.trim()}
            className="orb-button inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-moon transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:scale-100 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add prompt
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Memory ──────────────────────────────────────────────────────────────── */

function MemoryPane({ settings, update }) {
  const memories = settings.memories ?? [];
  const [draft, setDraft] = useState('');

  const setMemories = (next) => update({ memories: next });
  const addMemory = () => {
    const text = draft.trim();
    if (!text) return;
    setMemories([
      ...memories,
      { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, at: Date.now() },
    ]);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addMemory();
            }
          }}
          placeholder="Add something to remember…"
          className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-moon outline-none transition placeholder:text-moon/30 focus:border-accent/40 focus:bg-white/[0.08]"
        />
        <button
          type="button"
          onClick={addMemory}
          disabled={!draft.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-accent/15 px-3.5 py-2.5 text-xs font-semibold text-accent ring-1 ring-accent/25 transition hover:bg-accent/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add
        </button>
      </div>

      {memories.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="Nothing remembered yet"
          hint="Tell Pulse “remember I’m vegetarian” and it’ll show up here."
        />
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-[0.8125rem] font-medium text-moon/35">
              {memories.length} remembered
            </p>
            <button
              type="button"
              onClick={() => setMemories([])}
              className="rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-moon/40 transition hover:bg-white/8 hover:text-rose-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Forget everything
            </button>
          </div>
          <div className="space-y-1.5">
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="group flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-[0.8125rem] leading-6 text-moon/85">{memory.text}</p>
                <button
                  type="button"
                  onClick={() => setMemories(memories.filter((m) => m.id !== memory.id))}
                  aria-label="Forget this"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-moon/30 opacity-0 transition hover:bg-white/10 hover:text-rose-300 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Capabilities ────────────────────────────────────────────────────────── */

// The backend identifies providers by lowercase id; these are the written names.
const PROVIDER_LABEL = { gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude' };
const providerLabel = (id) => PROVIDER_LABEL[id] ?? id;

// Turn the backend's integration report into rows the page can render. Each row
// says what Pulse can do, through what, and whether it needs anything from you.
function capabilityRows(integrations) {
  const i = integrations ?? {};
  const search = i.search ?? {};
  const cal = i.calendar ?? {};
  const sports = i.sports ?? {};
  const ai = i.ai ?? {};
  const calSources = [cal.google && 'Google', cal.ical && 'Apple / iCal'].filter(Boolean);
  const liveSports = ['football', 'nba', 'nfl', 'f1'].filter((k) => sports[k]);

  return [
    {
      key: 'ai',
      icon: Sparkles,
      name: 'Assistant',
      live: Boolean(ai.gemini || ai.openai || ai.claude),
      note: ai.default ? `Answering with ${providerLabel(ai.default)}` : 'Add an AI key to backend/.env',
    },
    {
      key: 'search',
      icon: Globe,
      name: 'Web search',
      live: search.enabled !== false,
      note: search.brave
        ? 'Searching with Brave'
        : search.tavily
          ? 'Searching with Tavily'
          : 'Keyless — DuckDuckGo, Bing News, Wikipedia',
    },
    {
      key: 'calendar',
      icon: CalendarDays,
      name: 'Calendar',
      live: calSources.length > 0,
      note: calSources.length ? `Reading and writing ${calSources.join(' + ')}` : 'Connect a calendar in the Life Hub',
    },
    { key: 'weather', icon: CloudSun, name: 'Weather', live: Boolean(i.weather), note: 'Live conditions and forecast' },
    { key: 'news', icon: Newspaper, name: 'News', live: Boolean(i.news), note: 'Headlines, plus local news for your area' },
    {
      key: 'sports',
      icon: Trophy,
      name: 'Sports',
      live: liveSports.length > 0,
      note: liveSports.length ? `Live for ${liveSports.length} of 4 leagues` : 'Add a sports key to backend/.env',
    },
    { key: 'stocks', icon: TrendingUp, name: 'Markets', live: Boolean(i.stocks), note: 'Your watchlist, live prices' },
    { key: 'music', icon: Music2, name: 'Music', live: Boolean(i.music), note: 'Play, pause and skip in-app Spotify' },
  ];
}

function CapabilitiesPane() {
  const [state, setState] = useState({ loading: true, integrations: null, usage: null, failed: false });

  useEffect(() => {
    let alive = true;
    Promise.all([api.status().catch(() => null), api.usage().catch(() => null)]).then(([status, usage]) => {
      if (!alive) return;
      setState({
        loading: false,
        integrations: status?.integrations ?? null,
        usage: usage?.ai ?? null,
        failed: !status,
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => capabilityRows(state.integrations), [state.integrations]);

  // The provider actually answering, and what's left of today's allowance.
  const providerId = state.integrations?.ai?.default;
  const day = providerId ? state.usage?.[providerId]?.periods?.day : null;

  if (state.loading) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-moon/50">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Checking what’s connected…
      </div>
    );
  }

  if (state.failed) {
    return (
      <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] px-4 py-3.5 text-sm text-amber-100/80">
        Can’t reach the Pulse backend — start it with <span className="font-mono text-[0.8125rem]">npm run dev</span> in{' '}
        <span className="font-mono text-[0.8125rem]">backend/</span> to see what’s connected.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {day ? (
        <section className="theme-card rounded-3xl p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.8125rem] font-medium text-moon/40">
              Today’s {providerLabel(providerId)} allowance
            </p>
            <p className="text-xs text-moon/45">
              <span className="font-semibold text-moon/80">{day.requests.used}</span>
              {day.requests.limit ? ` / ${day.requests.limit}` : ''} requests
            </p>
          </div>
          <Meter used={day.requests.used} limit={day.requests.limit} />
          <p className="mt-2 text-[0.8125rem] text-moon/30">
            {day.tokens.used.toLocaleString()} tokens used
            {day.tokens.limit ? ` of ${day.tokens.limit.toLocaleString()}` : ''} · resets at midnight
          </p>
        </section>
      ) : null}

      <div className="space-y-1.5">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.key}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
            >
              <Icon className={`h-4 w-4 shrink-0 ${row.live ? 'text-accent/80' : 'text-moon/25'}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${row.live ? 'text-moon/90' : 'text-moon/45'}`}>{row.name}</p>
                <p className="truncate text-xs text-moon/40">{row.note}</p>
              </div>
              <span
                className={[
                  'shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] font-bold',
                  row.live ? 'bg-emerald-300/12 text-emerald-200/90' : 'bg-white/6 text-moon/35',
                ].join(' ')}
              >
                {row.live ? 'Live' : 'Set up'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Meter({ used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct > 85 ? 'bg-rose-300/70' : pct > 60 ? 'bg-amber-200/70' : 'bg-accent/70';
  return (
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 px-6 text-center">
      <Icon className="h-6 w-6 text-moon/25" aria-hidden="true" />
      <p className="text-sm text-moon/45">{title}</p>
      <p className="text-xs text-moon/30">{hint}</p>
    </div>
  );
}
