/**
 * Moving everything you have set up from one Pulse to another.
 *
 * It is needed because a browser keeps this sort of thing per origin, and the
 * desktop app serves itself from a different port to the dev server — so to a
 * browser they are two unrelated sites that happen to look identical. Nothing
 * crosses between them on its own, and there is no API to ask: your trips, your
 * launchpad, your folders and your conversations live in the browser, not on
 * the server.
 *
 * So it is a file. Export writes one, import reads it, and the two Pulses never
 * have to know about each other.
 */

const PREFIX = 'pulse.';
const VERSION = 1;

/**
 * Keys that are a cache of something fetched, not something you made.
 *
 * Carrying these over would be worse than leaving them: a calendar cache
 * belongs to an account the new copy has not connected yet, so it would show
 * events it cannot refresh and cannot explain. Everything else under the prefix
 * travels, including keys added after this was written — a list of what to take
 * would be a list to forget to update.
 */
const DERIVED = new Set([
  'pulse.calendar.cache.v2',
  /*
   * The mail cache, for the same reason as the calendar's and one more.
   *
   * It belongs to a mailbox the new copy has not connected, so it could only
   * show mail it cannot refresh. And it holds senders, subjects and preview
   * lines — a backup is a file someone may email to themselves or leave on a
   * drive, and the contents of an inbox have no business travelling in it.
   * Bodies were never in there to begin with (see useMail), but headers alone
   * say plenty.
   */
  'pulse.mail.cache.v1',
]);

const readable = () => {
  try {
    return Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIX) && !DERIVED.has(k));
  } catch {
    return [];
  }
};

/** Everything worth carrying, as a plain object ready to be written to a file. */
export function collect() {
  const data = {};
  for (const key of readable()) {
    const value = window.localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  return {
    kind: 'pulseos-backup',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    // Where it came from, so an import can say so rather than leaving you to
    // guess which of two identical-looking copies you just restored.
    origin: window.location.origin,
    data,
  };
}

/** What's in a backup, in the words the settings panel uses. */
const LABELS = {
  'pulse.settings.v1': 'Settings, launchpad and watchlists',
  'pulse.launchpad.meta.v2': 'Launchpad folders and arrangement',
  'pulse.travel.v3': 'Trips',
  'pulse.travel.v2': 'Trips (older format)',
  'pulse.travel.packing': 'Packing lists',
  'pulse.life.v1': 'To-dos, habits and projects',
  'pulse.conversations.v1': 'Pulse conversations',
  'pulse.wallpaper.v1': 'Your background photo',
};

/**
 * What this copy of Pulse is keeping, store by store, and how much room each
 * takes — the derived caches included, since they take room too.
 *
 * @returns {{ key: string, label: string, bytes: number, carried: boolean }[]}
 */
export function storedSummary() {
  let keys = [];
  try {
    keys = Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
  const EXTRA = {
    'pulse.calendar.cache.v2': 'Calendar cache',
    'pulse.miniplayer.pos.v1': 'Where the mini player sits',
    'pulse.news.scope': 'Which news Markets opens on',
    'pulse.newsChannel': 'The live channel last watched',
  };
  return keys
    .map((key) => {
      const value = window.localStorage.getItem(key) ?? '';
      return {
        key,
        label: LABELS[key] ?? EXTRA[key] ?? key.replace(PREFIX, ''),
        // UTF-16 in storage: two bytes a character is what it really costs.
        bytes: (key.length + value.length) * 2,
        carried: !DERIVED.has(key),
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

export const describe = (payload) =>
  Object.keys(payload?.data ?? {})
    .map((key) => LABELS[key])
    .filter(Boolean);

/** Save a backup to disk. */
export function download() {
  const payload = collect();
  const stamp = payload.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pulseos-${stamp}.json`;
  a.click();
  // Revoking immediately can beat the download on some builds; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return payload;
}

/**
 * Restore a backup.
 *
 * Everything in the file is written, and anything the file does not mention is
 * left alone — so restoring trips onto a copy that already has a launchpad does
 * not cost you the launchpad. The page is reloaded afterwards because every
 * store here reads its key once, at startup, and would otherwise sit on the old
 * values until something happened to make it look again.
 *
 * @param {File} file
 * @returns {Promise<string[]>} what was restored, in readable terms
 */
export async function restore(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not a Pulse backup.');
  }
  if (payload?.kind !== 'pulseos-backup' || !payload.data) {
    throw new Error('That file is not a Pulse backup.');
  }
  if (payload.version > VERSION) {
    throw new Error('That backup was made by a newer version of Pulse.');
  }

  const restored = describe(payload);
  for (const [key, value] of Object.entries(payload.data)) {
    // Only the app's own keys, whatever the file claims — a backup should not
    // be able to write anything it likes into storage.
    if (!key.startsWith(PREFIX) || typeof value !== 'string') continue;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      throw new Error('There was not enough room to restore this backup.');
    }
  }
  return restored;
}
