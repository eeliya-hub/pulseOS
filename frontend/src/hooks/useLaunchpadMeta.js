import { useCallback, useEffect, useState } from 'react';
import { itemKey } from '../services/launchpad/items.js';

// Everything the launchpad knows about its items *besides* the items themselves.
//
// The list of apps and sites stays in settings.launchpad, because Home reads it
// too and there should be one launchpad, not two. What lives here is the stuff
// only the full view cares about: the folders the user made and what's in them,
// which app the user chose to highlight, and how often each thing gets opened.
const KEY = 'pulse.launchpad.meta.v2';
const DEFAULTS = {
  folders: [], // user-created; the launchpad ships with none on purpose
  folderOf: {}, // itemKey → folder name ('' = loose, shows only under All)
  // itemKey → true for things that should appear ONLY in their folder. Filing
  // something is not the same as wanting it out of the way: most of the time
  // you want both, which is why All shows everything unless you say otherwise.
  filedAway: {},
  usage: {}, // itemKey → { count, lastAt }
  highlighted: '', // itemKey of the app on the highlight card; '' = none chosen
};

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
    // `pinned` was the old name, back when the card fell back to whatever was
    // opened most and pinning was the override.
    const { pinned, ...rest } = saved;
    return { ...DEFAULTS, ...rest, highlighted: saved.highlighted ?? pinned ?? '' };
  } catch {
    return DEFAULTS;
  }
}

let state = read();
const listeners = new Set();

function write(next) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota — the launchpad still works, it just won't remember */
  }
  listeners.forEach((fn) => fn(state));
}

export function useLaunchpadMeta() {
  const [meta, setMeta] = useState(state);

  useEffect(() => {
    listeners.add(setMeta);
    return () => listeners.delete(setMeta);
  }, []);

  /** Record an open. Drives the highlight card and the recents list. */
  const recordLaunch = useCallback((item) => {
    const key = itemKey(item);
    const previous = state.usage[key] ?? { count: 0, lastAt: 0 };
    write({ ...state, usage: { ...state.usage, [key]: { count: previous.count + 1, lastAt: Date.now() } } });
  }, []);

  const setFolder = useCallback((item, folder) => {
    write({ ...state, folderOf: { ...state.folderOf, [itemKey(item)]: folder } });
  }, []);

  const addFolder = useCallback((name) => {
    const clean = (name || '').trim().slice(0, 18);
    if (!clean || state.folders.some((f) => f.toLowerCase() === clean.toLowerCase())) return;
    write({ ...state, folders: [...state.folders, clean] });
  }, []);

  /** Whether something in a folder should also show under All. */
  const setFiledAway = useCallback((item, away) => {
    const key = itemKey(item);
    const filedAway = { ...state.filedAway };
    if (away) filedAway[key] = true;
    else delete filedAway[key];
    write({ ...state, filedAway });
  }, []);

  /** Move a folder in the row. The order of the chips is the order you read. */
  const reorderFolders = useCallback((from, to) => {
    const next = [...state.folders];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    write({ ...state, folders: next });
  }, []);

  /** Deleting a folder doesn't delete its apps — they go loose again. */
  const removeFolder = useCallback((name) => {
    const folderOf = Object.fromEntries(Object.entries(state.folderOf).filter(([, f]) => f !== name));
    write({ ...state, folders: state.folders.filter((f) => f !== name), folderOf });
  }, []);

  /** Choose the app on the highlight card; choosing the same one again clears it. */
  const toggleHighlight = useCallback((item) => {
    const key = item ? itemKey(item) : '';
    write({ ...state, highlighted: state.highlighted === key ? '' : key });
  }, []);

  /** Drop everything we know about an item that's no longer on the launchpad. */
  const forget = useCallback((item) => {
    const key = itemKey(item);
    const drop = (map) => Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
    write({
      ...state,
      folderOf: drop(state.folderOf),
      filedAway: drop(state.filedAway),
      usage: drop(state.usage),
      highlighted: state.highlighted === key ? '' : state.highlighted,
    });
  }, []);

  return {
    ...meta,
    recordLaunch,
    setFolder,
    setFiledAway,
    addFolder,
    removeFolder,
    reorderFolders,
    toggleHighlight,
    forget,
  };
}
