import { useCallback, useEffect, useState } from 'react';

// A tiny shared, persisted settings store (name + location). Module-level so
// every component — idle screen, home, news card — reads and updates the same
// source of truth and re-renders together.
const KEY = 'pulse.settings.v1';

// A handful of sites to start the launchpad's website row off with, so it isn't
// empty on day one. Seeded exactly once (see `migrate`) — delete any of them and
// they stay deleted.
const STARTER_SITES = [
  { url: 'https://www.google.com', name: 'Google' },
  { url: 'https://www.youtube.com', name: 'YouTube' },
  { url: 'https://mail.google.com', name: 'Gmail' },
  { url: 'https://web.whatsapp.com', name: 'WhatsApp' },
  { url: 'https://chatgpt.com', name: 'ChatGPT' },
  { url: 'https://www.reddit.com', name: 'Reddit' },
  { url: 'https://www.amazon.co.uk', name: 'Amazon' },
];

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
  // Which of the launchpad shows on Home, as itemKeys and in the order Home
  // draws them. `null` means "whatever the launchpad's first twelve are", which
  // is how this behaved before the two could differ — so an existing setup
  // keeps its Home card until someone deliberately picks a different one.
  homeLaunchpad: null,
  // The tape across the top of Markets. Separate from the watchlist above on
  // purpose: the watchlist is what you hold, the tape is what you glance at.
  // Equities and coins both work — a symbol traded as a coin is priced as one.
  ticker: ['AAPL', 'NVDA', 'TSLA', 'BTC', 'ETH', 'VOO'],
  // Free-typed guidance on how the Pulse assistant should talk to the user
  // (tone, format, focus). Sent with every AI chat and folded into its prompt.
  aiInstructions: '',
  // User-authored quick prompts, shown as one-tap chips in the chat. Each is
  // { title, prompt }: the title labels the chip, the prompt is what's sent.
  customPrompts: [],
  // Which Gemini Live prebuilt voice Pulse speaks with (see services/ai/voices.js).
  voiceName: 'Puck',
  // When the screen goes idle while music is playing, show the immersive player
  // instead of the plain screensaver. Off means the usual idle screen.
  afkImmersive: true,
  // The immersive player's light: the sleeve's colours drifting round the room.
  // Off holds them still.
  immersiveMotion: true,
  // Seconds on Home without a touch before the clock takes over; 0 = never.
  idleAfter: 20,
  // Quiets every ambient movement in the app — the sky's drift, the horizon's
  // breathing, the light running the baseline — for anyone who'd rather it sat still.
  reduceMotion: false,
  // 'auto' follows the hour; 'dawn' | 'day' | 'dusk' | 'night' holds the sky there.
  skyPhase: 'auto',
  // The highlight colour everywhere — 'sky' takes the hour's, or a colour of your own.
  accent: 'sky',
  // What's behind everything: the living sky, or a photo of yours (kept under its
  // own key — see useWallpaper — so a settings write never carries the picture).
  // `tint` lends the photo's colours to the sky and, unless you chose one, the accent.
  background: { kind: 'sky', dim: 0.7, blur: 0, tint: true },
  // 'MM-DD'. Pulse wishes you a happy birthday on the day, and the assistant knows.
  birthday: '',
  // Weather in 'metric' (°C) or 'imperial' (°F).
  units: 'metric',
  // The big clocks — top bar, resting screen, immersive player — in 24 or 12 hours.
  clock24: true,
  // The tab bar, left to right with Ask Pulse in the middle, and the ones you've put away.
  tabs: ['home', 'launchpad', 'life', 'markets', 'music', 'travel'],
  hiddenTabs: [],
  // What the resting clock shows besides the time.
  restShows: { greeting: true, date: true, weather: false, next: false },
  // The immersive player: how strong its light is, and the words.
  immersiveLight: 'rich', // 'soft' | 'rich' | 'vivid'
  showLyrics: true,
  lyricsSize: 'medium', // 'small' | 'medium' | 'large'
  // Double-tap Space anywhere to talk to Pulse.
  voiceShortcut: true,
  // How fast the Markets tape runs: 'slow' | 'steady' | 'quick'.
  tickerSpeed: 'steady',
  // Long-term memory: durable facts Pulse has learned about the user, recalled in
  // every future conversation. Each is { id, text, at }.
  memories: [],
  // Which layers the trip map draws. Remembered across sessions — how someone
  // wants to read their own trip is a preference, not a per-visit choice.
  travelMapLayers: { places: true, stay: true, flight: true, airports: true },
  icalFeeds: [], // [{ id, name, url }] — subscribed .ics calendar feeds
  hiddenCalendars: [], // calendarIds toggled off in the Life Hub
  // Home highlight tracker: always show the next event whose title matches
  // `match` (e.g. a recurring shift), under a custom `label`, optionally renamed
  // to `title` in the UI only. Empty `match` = just the next upcoming event.
  pinned: { label: 'Highlighted event', match: '', title: '', image: '', excludeFromUpcoming: false },
  // Home launchpad — items are either a macOS app name (string, opened with its
  // own icon) or a website shortcut ({ url, name }, opened in the browser).
  launchpad: ['Safari', 'Mail', 'Calendar', 'Notes', 'Music', 'App Store', 'System Settings', 'Photos', ...STARTER_SITES],
  // Whether the starter sites above have been handed out yet. False here so a
  // launchpad saved before they existed picks them up on its next load.
  seededSites: false,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const migrated = migrate({ ...DEFAULTS, ...JSON.parse(raw) });
      // Write the migration straight back, so the one-time work really is one
      // time: without this the seeding flag never sticks and a starter site the
      // user deletes reappears on the next load.
      try {
        localStorage.setItem(KEY, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
      return migrated;
    }
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
  // One-time: give a launchpad saved before the starter sites existed its share
  // of them, skipping any the user already has. Runs once, so deleted ones stay
  // deleted.
  const launchpad = saved.seededSites
    ? saved.launchpad
    : [
        ...(saved.launchpad ?? []),
        ...STARTER_SITES.filter((site) => !(saved.launchpad ?? []).some((item) => item?.url === site.url)),
      ];
  // Every tab exactly once, in the saved order, with any tab added since the
  // order was saved put back at the end rather than lost.
  const known = DEFAULTS.tabs;
  const tabs = [...new Set([...(saved.tabs ?? []).filter((t) => known.includes(t)), ...known])];
  return {
    ...saved,
    follows,
    launchpad,
    seededSites: true,
    pinned: { ...DEFAULTS.pinned, ...pinned },
    customPrompts,
    memories,
    tabs,
    hiddenTabs: (saved.hiddenTabs ?? []).filter((t) => known.includes(t) && t !== 'home'),
    background: { ...DEFAULTS.background, ...saved.background },
    restShows: { ...DEFAULTS.restShows, ...saved.restShows },
  };
}

let state = load();
const subscribers = new Set();

// Read the current settings outside of React (used by the launch preloader).
export const getSettings = () => state;

/**
 * Merge a change into settings. Pass a function to compute the change from the
 * settings as they are at this instant — which is what anything built from a
 * current list has to do. Two memories saved back to back from a render-time
 * copy both start from the same list, and the second silently drops the first.
 */
function setState(patch) {
  const changes = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...changes };
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
