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
  icalFeeds: [], // [{ id, name, url }] — subscribed .ics calendar feeds
  hiddenCalendars: [], // calendarIds toggled off in the Life Hub
  // Home highlight tracker: always show the next event whose title matches
  // `match` (e.g. a recurring shift), under a custom `label`, optionally renamed
  // to `title` in the UI only. Empty `match` = just the next upcoming event.
  pinned: { label: 'Highlighted event', match: '', title: '', image: '', excludeFromUpcoming: false },
  // Home launchpad — macOS app names to show/open, with their own icons.
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
  return { ...saved, follows, pinned: { ...DEFAULTS.pinned, ...pinned } };
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
