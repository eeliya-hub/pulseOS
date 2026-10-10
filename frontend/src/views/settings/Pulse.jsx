import { Loader2, Play, Plus, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../hooks/useSettings.js';
import { DEFAULT_VOICE, VOICES } from '../../services/ai/voices.js';
import { api } from '../../services/api/backendClient.js';
import { Area, Choice, Confirm, Empty, Group, Page, Preview, Row, ToggleRow } from './controls.jsx';

// Starting points for the personality box — tapping one adds its words, so you
// can stack a couple and edit from there rather than facing an empty field.
const STARTERS = [
  { label: 'Jarvis', text: 'Speak like Jarvis: unflappable, dry wit, never fawning. Address me as Mr Nayeri.' },
  { label: 'Straight to it', text: 'Lead with the answer. Two sentences unless I ask for more, and no preamble.' },
  {
    label: 'Warm',
    text: 'Be warm and conversational — notice how my day looks and say something human about it, not just the facts.',
  },
  {
    label: 'Nudge me',
    text: 'Keep me honest about my tasks and habits. If I am behind, say so plainly and suggest the next thing to do.',
  },
];

const voiceOf = (id) => VOICES.find((v) => v.id === id) ?? VOICES.find((v) => v.id === DEFAULT_VOICE);

/** Your assistant as you've made it: the voice it speaks in, and the first of your words to it. */
export function PulsePreview() {
  const { settings } = useSettings();
  const voice = voiceOf(settings.voiceName);
  const words = (settings.aiInstructions ?? '').trim().split('\n')[0];
  const memories = (settings.memories ?? []).length;
  return (
    <Preview>
      <svg viewBox="0 0 384 60" preserveAspectRatio="none" className="absolute inset-x-0 top-[3.6rem] h-12 w-full" fill="none">
        <path d="M0 34 H150 M232 34 H384" stroke="rgba(238,240,250,0.16)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path
          d="M150 34 L162 22 L172 50 L188 4 L204 42 L214 34 H232"
          style={{ stroke: 'var(--accent)', filter: 'drop-shadow(0 0 4px var(--accent))' }}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute left-5 top-4">
        <p className="t-label text-[0.75rem]">Speaking as</p>
        <p className="display-type mt-1 text-[1.75rem] leading-none text-moon">{voice.label}</p>
      </div>
      <p className="t-micro absolute right-5 top-5 text-right">
        {voice.note}, {voice.gender}
        <br />
        {memories} {memories === 1 ? 'thing' : 'things'} remembered
      </p>
      <p className="display-type absolute inset-x-5 bottom-4 line-clamp-2 text-[0.9375rem] italic leading-snug text-moon/80">
        {words ? `“${words}”` : 'In its own words, until you give it yours.'}
      </p>
    </Preview>
  );
}

export function PulsePane({ tab = 'personality' }) {
  if (tab === 'voice') return <VoiceTab />;
  if (tab === 'prompts') return <PromptsTab />;
  if (tab === 'memory') return <MemoryTab />;
  return <PersonalityTab />;
}

/* ── Personality ─────────────────────────────────────────────────────────── */

function PersonalityTab() {
  const { settings, update } = useSettings();
  const words = settings.aiInstructions ?? '';

  const add = (text) =>
    update((s) => {
      const current = (s.aiInstructions ?? '').trim();
      if (current.includes(text)) return {};
      return { aiInstructions: current ? `${current}\n${text}` : text };
    });

  return (
    <Page>
      <Group
        title="In your words"
        note="How Pulse should talk to you. Followed in every chat and every voice reply — your words win over its own tone, never over its rules, so it still checks your real calendar, weather and the web."
        action={
          <>
            <span className="t-meta clock-figures">{words.length} characters</span>
            <button type="button" onClick={() => update({ aiInstructions: '' })} disabled={!words} className="pill h-8 px-3.5 disabled:opacity-35">
              Clear
            </button>
          </>
        }
        bare
      >
        <Area
          value={words}
          onChange={(aiInstructions) => update({ aiInstructions })}
          rows={9}
          placeholder="e.g. Respond like Jarvis and call me Mr Nayeri. Be concise, with a touch of wit. Say something about the day — the weather, a song — not just the facts."
          aria-label="How Pulse should talk to you"
          className="text-[1rem]"
        />
      </Group>

      <Group title="Starting points" note="Each adds its words to yours. Stack a couple, then make them your own.">
        {STARTERS.map((starter) => {
          const added = words.includes(starter.text);
          return (
            <Row key={starter.label} label={starter.label} hint={starter.text}>
              <button type="button" onClick={() => add(starter.text)} disabled={added} className={`pill h-8 px-3.5 ${added ? 'pill-lit' : ''}`}>
                {added ? 'Added' : 'Add'}
              </button>
            </Row>
          );
        })}
      </Group>
    </Page>
  );
}

/* ── Voice ───────────────────────────────────────────────────────────────── */

function VoiceTab() {
  const { settings, update } = useSettings();
  const selected = voiceOf(settings.voiceName).id;
  // 'loading:<id>' | 'playing:<id>' | ''
  const [preview, setPreview] = useState('');
  const audio = useRef(null);

  useEffect(() => () => audio.current?.pause(), []);

  const listen = async (id) => {
    audio.current?.pause();
    if (preview === `playing:${id}`) {
      setPreview('');
      return;
    }
    setPreview(`loading:${id}`);
    try {
      const { audio: wav } = await api.ai.voicePreview(id);
      const el = new Audio(`data:audio/wav;base64,${wav}`);
      audio.current = el;
      el.onended = () => setPreview((p) => (p === `playing:${id}` ? '' : p));
      el.onerror = () => setPreview('');
      await el.play();
      setPreview(`playing:${id}`);
    } catch {
      setPreview('');
    }
  };

  return (
    <Page>
      <Group title="Voice" note="Pulse speaks in one voice from start to finish. A new choice takes over from your next voice conversation.">
        {VOICES.map((voice) => {
          const state = preview.endsWith(`:${voice.id}`) ? preview.split(':')[0] : '';
          const on = voice.id === selected;
          return (
            // The play button and the choice sit side by side rather than one
            // inside the other: hearing a voice shouldn't also pick it.
            <div key={voice.id} className="flex items-center">
              <button
                type="button"
                onClick={() => listen(voice.id)}
                aria-label={state === 'playing' ? `Stop ${voice.label}` : `Hear ${voice.label}`}
                title="Hear it"
                className={`pill ml-5 h-9 w-9 shrink-0 px-0 ${state === 'playing' ? 'pill-lit' : ''}`}
              >
                {state === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : state === 'playing' ? (
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                )}
              </button>
              <Choice
                selected={on}
                onClick={() => update({ voiceName: voice.id })}
                title={voice.label}
                meta={`${voice.note}, ${voice.gender}`}
              />
            </div>
          );
        })}
      </Group>

      <Group title="Talking to Pulse">
        <ToggleRow
          label="Double-tap Space to talk"
          hint="Anywhere in Pulse, outside a text box. The mic in Ask Pulse works either way."
          checked={settings.voiceShortcut !== false}
          onChange={(voiceShortcut) => update({ voiceShortcut })}
        />
      </Group>
    </Page>
  );
}

/* ── Quick prompts ───────────────────────────────────────────────────────── */

function PromptsTab() {
  const { settings, update } = useSettings();
  const prompts = settings.customPrompts ?? [];
  const [draft, setDraft] = useState({ title: '', prompt: '' });

  const edit = (index, patch) =>
    update((s) => ({ customPrompts: (s.customPrompts ?? []).map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
  const remove = (index) => update((s) => ({ customPrompts: (s.customPrompts ?? []).filter((_, i) => i !== index) }));
  const add = () => {
    const prompt = draft.prompt.trim();
    if (!prompt) return;
    const title = draft.title.trim() || prompt.slice(0, 40);
    update((s) => ({ customPrompts: [...(s.customPrompts ?? []), { title, prompt }] }));
    setDraft({ title: '', prompt: '' });
  };

  return (
    <Page>
      <Group title="Your prompts" note="One-tap chips under the box in every chat. Say a chip’s name to Pulse and it runs it too.">
        {prompts.length === 0 ? (
          <Empty>None yet — the first one you add appears here.</Empty>
        ) : (
          prompts.map((p, index) => (
            <div key={index} className="settings-row group items-start">
              <span className="display-figures w-6 shrink-0 pt-0.5 text-[1.375rem] leading-none text-accent">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <input
                  value={p.title ?? ''}
                  onChange={(e) => edit(index, { title: e.target.value })}
                  placeholder="What the chip says"
                  aria-label="Chip label"
                  className="editable-field w-full bg-transparent text-[0.9688rem] text-moon outline-none"
                />
                <textarea
                  value={p.prompt ?? ''}
                  onChange={(e) => edit(index, { prompt: e.target.value })}
                  rows={2}
                  placeholder="What it sends to Pulse"
                  aria-label="What it sends"
                  className="editable-field glass-scroll t-meta mt-1 w-full resize-none bg-transparent leading-snug outline-none"
                />
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="Delete this prompt"
                className="pill h-8 w-8 shrink-0 px-0 text-moon/55 opacity-0 transition-opacity hover:text-fall focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </Group>

      <Group title="A new prompt" pad>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="space-y-3"
        >
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="What the chip says — e.g. Daily brief"
            aria-label="New chip label"
            className="field"
          />
          <Area
            value={draft.prompt}
            onChange={(prompt) => setDraft((d) => ({ ...d, prompt }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                add();
              }
            }}
            rows={3}
            placeholder="What it sends — e.g. Give me today in three lines: plans, weather, and anything I’ve forgotten."
            aria-label="What the new prompt sends"
          />
          <div className="flex items-center justify-between">
            <span className="t-micro">⌘ Enter adds it</span>
            <button type="submit" disabled={!draft.prompt.trim()} className="pill pill-lit h-9 px-4 disabled:opacity-40">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add prompt
            </button>
          </div>
        </form>
      </Group>
    </Page>
  );
}

/* ── Memory ──────────────────────────────────────────────────────────────── */

function MemoryTab() {
  const { settings, update } = useSettings();
  const memories = settings.memories ?? [];
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    update((s) => ({
      memories: [...(s.memories ?? []), { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, at: Date.now() }],
    }));
    setDraft('');
  };
  const forget = (id) => update((s) => ({ memories: (s.memories ?? []).filter((m) => m.id !== id) }));

  return (
    <Page>
      <Group title="Teach Pulse" note="It writes here itself as you talk, too. Everything listed is remembered in every conversation.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="settings-row"
        >
          <Plus className="h-4 w-4 shrink-0 text-moon/45" strokeWidth={1.7} aria-hidden="true" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Something to remember — e.g. I’m vegetarian"
            aria-label="Something for Pulse to remember"
            className="min-w-0 flex-1 bg-transparent text-[0.9688rem] text-moon outline-none placeholder:text-moon/35"
          />
          <button type="submit" disabled={!draft.trim()} className="pill pill-lit h-9 px-4 disabled:opacity-40">
            Remember
          </button>
        </form>
      </Group>

      <Group
        title="Remembered"
        action={
          memories.length ? (
            <Confirm ask={`Forget all ${memories.length}`} onConfirm={() => update({ memories: [] })} className="pill h-8 px-3.5">
              Forget everything
            </Confirm>
          ) : null
        }
      >
        {memories.length === 0 ? (
          <Empty>Nothing yet. Tell Pulse “remember I’m vegetarian” and it shows up here.</Empty>
        ) : (
          memories.map((m) => (
            <div key={m.id} className="settings-row group">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="settings-row-label">{m.text}</span>
                {m.at ? (
                  <span className="settings-row-hint">
                    {new Date(m.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => forget(m.id)}
                aria-label="Forget this"
                className="pill h-8 w-8 shrink-0 px-0 text-moon/55 opacity-0 transition-opacity hover:text-fall focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </Group>
    </Page>
  );
}
