import { ArrowLeft, AudioLines, Brain, Loader2, MessageSquareText, Play, Plus, Sparkles, Trash2, Volume2, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

/**
 * Full-page AI settings: how Pulse should talk to you, plus a manager for your
 * own quick prompts (which show as one-tap chips in every chat).
 */
export default function AISettings({ onClose }) {
  const { settings, update } = useSettings();
  const prompts = settings.customPrompts ?? [];
  const [draft, setDraft] = useState({ title: '', prompt: '' });

  // Voice preview: 'loading:<id>' | 'playing:<id>' | ''.
  const [preview, setPreview] = useState('');
  const audioRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Stop any preview audio when the page closes.
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

  const setPrompts = (next) => update({ customPrompts: next });
  const addPrompt = () => {
    const title = draft.title.trim();
    const prompt = draft.prompt.trim();
    if (!prompt) return; // the sent text is required; the title is optional
    setPrompts([...prompts, { title: title || prompt.slice(0, 40), prompt }]);
    setDraft({ title: '', prompt: '' });
  };
  const editPrompt = (index, patch) =>
    setPrompts(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const removePrompt = (index) => setPrompts(prompts.filter((_, i) => i !== index));

  // Long-term memory management.
  const memories = settings.memories ?? [];
  const [memDraft, setMemDraft] = useState('');
  const setMemories = (next) => update({ memories: next });
  const addMemory = () => {
    const text = memDraft.trim();
    if (!text) return;
    setMemories([...memories, { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, at: Date.now() }]);
    setMemDraft('');
  };
  const removeMemory = (id) => setMemories(memories.filter((m) => m.id !== id));

  const instructions = settings.aiInstructions ?? '';

  return createPortal(
    <div data-settings="" className="fixed inset-0 z-[75] flex flex-col text-white" style={PAGE_BG}>
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4 md:px-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="soft-button grid h-9 w-9 place-items-center rounded-full text-white/75 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="orb-button grid h-9 w-9 place-items-center rounded-2xl">
          <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
        </span>
        <div>
          <h1 className="display-type text-lg font-light leading-none text-white text-glow">Pulse AI</h1>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/38">
            Personality · voice · prompts · memory
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-full bg-white/8 px-4 py-2 text-xs font-semibold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Done
        </button>
      </header>

      {/* Body — two balanced columns on wide screens, stacked on small */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="glass-scroll mx-auto grid max-w-6xl gap-5 p-5 md:p-8 lg:grid-cols-2 lg:items-start">
          {/* Left column: personality + voice */}
          <div className="flex flex-col gap-5">
            {/* Personality */}
            <section className="theme-card rounded-3xl p-5">
              <SectionHead
                icon={Wand2}
                title="Personality"
                subtitle="Tone, format and focus — followed in every text and voice reply."
              />
              <div className="mt-4">
                <textarea
                  value={instructions}
                  onChange={(e) => update({ aiInstructions: e.target.value })}
                  placeholder={
                    'e.g. Respond like Jarvis and call me Mr Nayeri. Be concise but add a touch of wit. ' +
                    'Comment on things — the weather, a song, the day ahead — not just the facts.'
                  }
                  className="glass-scroll min-h-[13rem] w-full resize-y rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3.5 text-[15px] leading-7 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/[0.08]"
                />
                <p className="mt-2 text-right text-[10px] font-medium text-white/30">
                  {instructions.length} characters
                </p>
              </div>
            </section>

            {/* Voice */}
            <section className="theme-card rounded-3xl p-5">
              <SectionHead
                icon={AudioLines}
                title="Voice"
                subtitle="Pulse's speaking voice. Pinning one stops it changing between sessions — applies next time you open voice."
              />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VOICES.map((voice) => {
                  const on = (settings.voiceName ?? 'Puck') === voice.id;
                  const loading = preview === `loading:${voice.id}`;
                  const playing = preview === `playing:${voice.id}`;
                  return (
                    <div
                      key={voice.id}
                      className={[
                        'relative rounded-2xl border transition',
                        on
                          ? 'border-cyan-200/40 bg-cyan-200/12 ring-1 ring-cyan-200/25'
                          : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        onClick={() => update({ voiceName: voice.id })}
                        aria-pressed={on}
                        className="flex w-full flex-col items-start rounded-2xl px-3 py-2.5 pr-9 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/40"
                      >
                        <span className={`text-sm font-semibold ${on ? 'text-cyan-50' : 'text-white/85'}`}>
                          {voice.label}
                        </span>
                        <span className="text-[11px]">
                          <span className={voice.gender === 'female' ? 'text-rose-200/85' : 'text-sky-200/85'}>
                            {voice.gender === 'female' ? 'Female' : 'Male'}
                          </span>
                          <span className="text-white/35"> · {voice.note}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => playVoicePreview(voice.id)}
                        aria-label={`Preview ${voice.label} voice`}
                        title="Preview"
                        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      >
                        {loading ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : playing ? (
                          <Volume2 className="h-3 w-3 animate-pulse text-cyan-100" aria-hidden="true" />
                        ) : (
                          <Play className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right column: prompts + memory */}
          <div className="flex flex-col gap-5">
          {/* Custom prompts */}
          <section className="theme-card flex flex-col rounded-3xl p-5">
            <SectionHead
              icon={MessageSquareText}
              title="Custom prompts"
              subtitle="One-tap chips at the bottom of every chat — a title to label it, and what it sends."
              badge={prompts.length || null}
            />

            {/* Existing prompts (scrolls) */}
            <div className="glass-scroll mt-4 max-h-[20rem] space-y-2.5 overflow-y-auto pr-1">
              {prompts.length === 0 ? (
                <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 px-6 text-center">
                  <MessageSquareText className="h-6 w-6 text-white/25" aria-hidden="true" />
                  <p className="text-sm text-white/45">No custom prompts yet</p>
                  <p className="text-xs text-white/30">Add one below to pin it as a quick chip.</p>
                </div>
              ) : (
                prompts.map((prompt, index) => (
                  <div
                    key={index}
                    className="group rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-200/12 text-[11px] font-bold text-cyan-100/90">
                        {index + 1}
                      </span>
                      <input
                        value={prompt.title ?? ''}
                        onChange={(e) => editPrompt(index, { title: e.target.value })}
                        placeholder="Title (chip label)"
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:font-normal placeholder:text-white/30"
                      />
                      <button
                        type="button"
                        onClick={() => removePrompt(index)}
                        aria-label="Delete prompt"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/30 opacity-0 transition hover:bg-white/10 hover:text-rose-300 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <textarea
                      value={prompt.prompt ?? ''}
                      onChange={(e) => editPrompt(index, { prompt: e.target.value })}
                      rows={2}
                      placeholder="What it sends to Pulse…"
                      className="glass-scroll mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[13px] leading-6 text-white/85 outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-black/25"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Add a new one (pinned) */}
            <div className="mt-3 shrink-0 rounded-2xl border border-white/12 bg-white/[0.05] p-3">
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="New prompt title, e.g. Daily brief"
                className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:font-normal placeholder:text-white/35"
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
                className="glass-scroll mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[13px] leading-6 text-white/85 outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-black/25"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-white/30">⌘/Ctrl + Enter</span>
                <button
                  type="button"
                  onClick={addPrompt}
                  disabled={!draft.prompt.trim()}
                  className="orb-button inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:scale-100 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add prompt
                </button>
              </div>
            </div>
          </section>

          {/* Memory */}
          <section className="theme-card flex flex-col rounded-3xl p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/8 ring-1 ring-white/10">
                <Brain className="h-4 w-4 text-cyan-100/80" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="display-type text-base font-normal text-white">Memory</h2>
                  {memories.length ? (
                    <span className="rounded-full bg-cyan-200/15 px-2 py-0.5 text-[10px] font-bold text-cyan-100/90">
                      {memories.length}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs leading-5 text-white/45">
                  What Pulse remembers about you across conversations — it fills this in as you chat, and uses it to
                  personalize replies.
                </p>
              </div>
              {memories.length ? (
                <button
                  type="button"
                  onClick={() => setMemories([])}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-white/40 transition hover:bg-white/8 hover:text-rose-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            <div className="glass-scroll mt-4 max-h-[16rem] space-y-1.5 overflow-y-auto pr-1">
              {memories.length === 0 ? (
                <div className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 px-6 text-center">
                  <Brain className="h-6 w-6 text-white/25" aria-hidden="true" />
                  <p className="text-sm text-white/45">Nothing remembered yet</p>
                  <p className="text-xs text-white/30">
                    Tell Pulse “remember I’m vegetarian” and it’ll show up here.
                  </p>
                </div>
              ) : (
                memories.map((memory) => (
                  <div
                    key={memory.id}
                    className="group flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-cyan-200/70" aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-[13px] leading-6 text-white/85">{memory.text}</p>
                    <button
                      type="button"
                      onClick={() => removeMemory(memory.id)}
                      aria-label="Forget this"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white/30 opacity-0 transition hover:bg-white/10 hover:text-rose-300 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add a memory manually */}
            <div className="mt-3 flex items-center gap-2">
              <input
                value={memDraft}
                onChange={(e) => setMemDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMemory();
                  }
                }}
                placeholder="Add something to remember…"
                className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/[0.08]"
              />
              <button
                type="button"
                onClick={addMemory}
                disabled={!memDraft.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-cyan-200/15 px-3.5 py-2.5 text-xs font-semibold text-cyan-50 ring-1 ring-cyan-200/25 transition hover:bg-cyan-200/22 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            </div>
          </section>
          </div>
        </div>
      </main>
    </div>,
    document.body,
  );
}

function SectionHead({ icon: Icon, title, subtitle, badge }) {
  return (
    <div className="flex shrink-0 items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/8 ring-1 ring-white/10">
        <Icon className="h-4 w-4 text-cyan-100/80" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="display-type text-base font-normal text-white">{title}</h2>
          {badge ? (
            <span className="rounded-full bg-cyan-200/15 px-2 py-0.5 text-[10px] font-bold text-cyan-100/90">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-5 text-white/45">{subtitle}</p>
      </div>
    </div>
  );
}
