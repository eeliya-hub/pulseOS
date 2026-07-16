import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * OAuth token store, keyed by provider (+ optional user), persisted to a local
 * JSON file so a backend restart doesn't drop your Spotify/Google sessions.
 *
 * For production / Firebase, swap the file for Firestore (one doc per user per
 * provider) — the get/set/clear/has call sites stay identical.
 */
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.tokens.json');

const keyFor = (provider, user = 'default') => `${provider}:${user}`;

function load() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8'))));
  } catch {
    return new Map();
  }
}

const store = load();

function persist() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(store), null, 2));
  } catch {
    // disk unavailable — keep working in-memory
  }
}

export const tokenStore = {
  get: (provider, user) => store.get(keyFor(provider, user)) ?? null,
  set: (provider, tokens, user) => {
    store.set(keyFor(provider, user), tokens);
    persist();
  },
  clear: (provider, user) => {
    store.delete(keyFor(provider, user));
    persist();
  },
  has: (provider, user) => store.has(keyFor(provider, user)),
};
