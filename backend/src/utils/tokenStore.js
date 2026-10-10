import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * OAuth token store, keyed by provider (+ optional user), persisted to a local
 * JSON file so a backend restart doesn't drop your Spotify/Google sessions.
 *
 * For production / Firebase, swap the file for Firestore (one doc per user per
 * provider) — the get/set/clear/has call sites stay identical.
 */
/**
 * Where the tokens live — and, under a test, deliberately somewhere else.
 *
 * This was an env var the test script was supposed to set, and the comment
 * here said tests must never touch the real store. The script never set it.
 * The mail tests call `forgetAccount` and `forgetAllAccounts` to clean up
 * their fixtures, those ran against the real file, and a `npm test` silently
 * signed the machine's owner out of every mailbox they had connected. A
 * refresh token cannot be got back, so the only remedy was to connect again.
 *
 * So the guard no longer depends on anyone remembering. `NODE_TEST_CONTEXT` is
 * set by `node --test` in every test process, so a test gets a throwaway file
 * of its own whatever command started it — and one per process id, so test
 * files running in parallel cannot tread on each other either. The env var
 * stays for anyone who wants to point the store somewhere specific.
 */
const UNDER_TEST = Boolean(process.env.NODE_TEST_CONTEXT);

const FILE =
  process.env.PULSE_TOKEN_FILE ||
  (UNDER_TEST
    ? path.join(os.tmpdir(), `pulse-tokens-test-${process.pid}.json`)
    : path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.tokens.json'));

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
  /**
   * Every `provider:user` key held, or those under one provider.
   *
   * Needed because mail is the first integration with more than one account of
   * the same kind — a personal Gmail and a university one are two entries under
   * `mail:google`, and nothing could enumerate them. Calendar and Spotify each
   * know their single key by name and are unaffected.
   */
  keys: (provider) => {
    const prefix = provider ? `${provider}:` : '';
    return [...store.keys()].filter((key) => key.startsWith(prefix));
  },
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
