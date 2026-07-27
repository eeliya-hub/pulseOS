import { useCallback, useEffect, useState } from 'react';

// A tiny shared, persisted settings store (name + location). Module-level so
// every component — idle screen, home, news card — reads and updates the same
// source of truth and re-renders together.
const KEY = 'pulse.settings.v1';
const DEFAULTS = {
  name: 'Eeliya',
  location: 'Kent',
  follows: [
    { id: '39:Arsenal', sport: 'football', leagueId: 39, leagueLabel: 'Premier League', team: 'Arsenal' },
    { id: '12:Los Angeles Lakers', sport: 'basketball', leagueId: 12, leagueLabel: 'NBA', team: 'Los Angeles Lakers' },
    { id: '1:Jacksonville Jaguars', sport: 'nfl', leagueId: 1, leagueLabel: 'NFL', team: 'Jacksonville Jaguars' },
    { id: 'Formula 1:Formula 1', sport: 'f1', leagueId: null, leagueLabel: 'Formula 1', team: 'Formula 1' },
  ],
  stocks: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL'],
  // Free-typed guidance on how the Pulse assistant should talk to the user
  // (tone, format, focus). Sent with every AI chat and folded into its prompt.
  aiInstructions: '',
  // User-authored quick prompts, shown as one-tap chips in the chat. Each is
  // { title, prompt }: the title labels the chip, the prompt is what's sent.
  customPrompts: [],
  // Which Gemini Live prebuilt voice Pulse speaks with (see services/ai/voices.js).
  voiceName: 'Puck',
  // Long-term memory: durable facts Pulse has learned about the user, recalled in
  // every future conversation. Each is { id, text, at }.
  memories: [],
  icalFeeds: [], // [{ id, name, url }] — subscribed .ics calendar feeds
  hiddenCalendars: [], // calendarIds toggled off in the Life Hub
  // Home highlight tracker: always show the next event whose title matches
  // `match` (e.g. a recurring shift), under a custom `label`, optionally renamed
  // to `title` in the UI only. Empty `match` = just the next upcoming event.
  pinned: { label: 'Highlighted event', match: '', title: '', image: '', excludeFromUpcoming: false },
  // Home launchpad — items are either a macOS app name (string, opened with its
  // own icon) or a website shortcut ({ url, name }, opened in the browser).
  launchpad: ['Safari', 'Mail', 'Calendar', 'Notes', 'Music', 'App Store', 'System Settings', 'Photos'],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...DEFAULTS, ...JSON.parse(raw) });
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

// Normalize older stored follows (e.g. the F1 entry used to be per-constructor).
function migrate(saved) {
  const follows = (saved.follows ?? []).map((f) =>
    f.sport === 'f1'
      ? { ...f, id: 'Formula 1:Formula 1', leagueLabel: 'Formula 1', team: 'Formula 1' }
      : f,
  );
  const pinned =
    saved.pinned?.label === 'Up next' && !saved.pinned.match && !saved.pinned.title
      ? { ...saved.pinned, label: 'Highlighted event' }
      : saved.pinned;
  // Older versions stored custom prompts as plain strings — lift them to
  // { title, prompt } objects.
  const customPrompts = (saved.customPrompts ?? [])
    .map((p) =>
      typeof p === 'string'
        ? { title: p.slice(0, 40), prompt: p }
        : { title: p.title ?? '', prompt: p.prompt ?? p.text ?? '' },
    )
    .filter((p) => p.title || p.prompt);
  // Normalize memories (tolerate older plain-string entries).
  const memories = (saved.memories ?? [])
    .map((m, i) =>
      typeof m === 'string'
        ? { id: `m-legacy-${i}`, text: m, at: 0 }
        : { id: m.id ?? `m-${i}`, text: m.text ?? '', at: m.at ?? 0 },
    )
    .filter((m) => m.text.trim());
  return { ...saved, follows, pinned: { ...DEFAULTS.pinned, ...pinned }, customPrompts, memories };
}

let state = load();
const subscribers = new Set();

// Read the current settings outside of React (used by the launch preloader).
export const getSettings = () => state;

function setState(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  subscribers.forEach((fn) => fn(state));
}

export function useSettings() {
  const [settings, setLocal] = useState(state);

  useEffect(() => {
    const fn = (next) => setLocal(next);
    subscribers.add(fn);
    setLocal(state); // sync in case it changed before mount
    return () => subscribers.delete(fn);
  }, []);

  const update = useCallback((patch) => setState(patch), []);
  return { settings, update };
}
