import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import {
  bumpMailboxes,
  bumpUnread,
  dedupe,
  listKey,
  mergeCapabilities,
  parseKey,
  patchLists,
  removeFromLists,
  restoreLists,
  revert,
  strip,
  unreadDelta,
  unreadFor,
} from '../services/mail/store.js';

/**
 * The one mail store, shared by every view that shows mail.
 *
 * Built on the same shape as useCalendarEvents — a module-level store with a
 * subscriber set, one refresher however many components are mounted, a
 * staleness window, and the rule that a request which FAILED tells us nothing
 * and must never downgrade what we already know.
 *
 * It differs from the calendar in one deliberate way, which is the privacy
 * decision taken for this feature:
 *
 *   HEADERS are persisted to localStorage — sender, subject, preview, date and
 *   flags — so the Life Hub card and the inbox paint instantly on launch
 *   instead of showing a skeleton every time.
 *
 *   BODIES are never persisted. They live in a plain Map for the life of the
 *   tab and go when it closes. A body is the most sensitive thing Pulse
 *   touches, and nothing about an instant first paint requires keeping one.
 */

const LS_KEY = 'pulse.mail.cache.v1';
// Mail arrives while you are looking at it, so this is short.
const STALE_AFTER = 60 * 1000;
const POLL_EVERY = 30 * 1000;
const PAGE_SIZE = 25;

const DEFAULTS = {
  status: null, // { configured, accounts[], providers[], unavailable[] }
  summary: null, // the Life Hub figures
  mailboxes: [], // per-account mailbox lists with unread counts
  // Keyed by `${accountId ?? 'all'}:${mailbox}:${category ?? ''}:${query}`.
  lists: {},
  reachable: null, // null until we have tried
  fetchedAt: 0,
  loading: false,
  sending: false,
};

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...saved,
      // Belt and braces: if an older build ever wrote a body, it stops here.
      lists: Object.fromEntries(
        Object.entries(saved.lists ?? {}).map(([key, page]) => [
          key,
          { ...page, messages: (page.messages ?? []).map(strip) },
        ]),
      ),
      loading: false,
      sending: false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let store = loadCache();
const subscribers = new Set();

/** Bodies: in memory, for this tab, and never written anywhere. */
const openBodies = new Map();

function setStore(patch) {
  store = { ...store, ...patch };
  subscribers.forEach((fn) => fn(store));
}

function persist() {
  try {
    const { status, summary, mailboxes, lists, fetchedAt } = store;
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        status,
        summary,
        mailboxes,
        fetchedAt,
        // Only the first page of each listing is worth keeping, and only its
        // headers. Keeping every page someone scrolled to would put half a
        // mailbox on disk for no gain — the first page is what a cold start shows.
        lists: Object.fromEntries(
          Object.entries(lists).map(([key, page]) => [
            key,
            { ...page, messages: (page.messages ?? []).slice(0, PAGE_SIZE).map(strip), nextPageToken: null },
          ]),
        ),
      }),
    );
  } catch {
    /* storage disabled or full — non-fatal, the app just re-fetches */
  }
}

/* ── Reading ──────────────────────────────────────────────────────────────── */

let inFlight = null;

/**
 * Refresh the connection status, the mailbox counts and the Life Hub figures.
 *
 * As with the calendar: anything that fails leaves the last known state alone
 * and only records that the backend could not be reached. A two-second restart
 * must not read as "your mail is gone".
 */
async function refreshCore({ refresh = false } = {}) {
  if (inFlight) return inFlight;
  setStore({ loading: true });
  inFlight = (async () => {
    let reachable = true;
    try {
      let status = null;
      try {
        status = await api.mail.status();
      } catch {
        reachable = false;
      }
      const nextStatus = status ?? store.status;
      const connected = (nextStatus?.accounts ?? []).length > 0;

      let summary = store.summary;
      let mailboxes = store.mailboxes;
      if (connected) {
        const [gotSummary, gotBoxes] = await Promise.all([
          api.mail.summary(undefined, refresh).catch(() => null),
          api.mail.mailboxes().catch(() => null),
        ]);
        if (gotSummary) summary = gotSummary;
        else reachable = false;
        if (gotBoxes) mailboxes = gotBoxes.accounts ?? [];
        else reachable = false;
      } else if (status) {
        // Genuinely signed out of everything, rather than unable to ask.
        summary = { connected: false, unread: 0, important: 0, needsAction: 0, deadlines: 0, recent: 0, highlights: [], accounts: [] };
        mailboxes = [];
      }

      setStore({
        status: nextStatus,
        summary,
        mailboxes,
        reachable,
        fetchedAt: status ? Date.now() : store.fetchedAt,
        loading: false,
      });
      if (reachable) persist();
    } finally {
      setStore({ loading: false });
      inFlight = null;
    }
  })();
  return inFlight;
}

/** One page of a mailbox. `more` appends the next page rather than replacing. */
async function fetchList(options, { more = false, refresh = false } = {}) {
  const key = listKey(options);
  const existing = store.lists[key];
  if (more && !existing?.nextPageToken) return existing;

  setStore({ lists: { ...store.lists, [key]: { ...(existing ?? { messages: [] }), loading: true, error: null } } });

  try {
    const page = await api.mail.messages({
      accountId: options.accountId,
      mailbox: options.mailbox ?? 'inbox',
      category: options.category,
      q: options.query?.trim() || undefined,
      unread: options.unread ? '1' : undefined,
      limit: PAGE_SIZE,
      pageToken: more ? existing.nextPageToken : undefined,
      refresh: refresh ? '1' : undefined,
    });

    const messages = more ? dedupe([...(existing?.messages ?? []), ...page.messages]) : page.messages;
    setStore({
      lists: {
        ...store.lists,
        [key]: {
          messages,
          nextPageToken: page.nextPageToken ?? null,
          accounts: page.accounts ?? [],
          connected: page.connected !== false,
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      },
      reachable: true,
    });
    persist();
    return store.lists[key];
  } catch (error) {
    // Keep whatever is on screen; say what went wrong beside it.
    setStore({
      lists: {
        ...store.lists,
        [key]: {
          ...(existing ?? { messages: [], nextPageToken: null }),
          loading: false,
          error: error?.message ?? 'Could not read your mail.',
        },
      },
      reachable: !error?.offline,
    });
    throw error;
  }
}

/* ── Staying fresh ────────────────────────────────────────────────────────── */

let watchers = 0;
let pollTimer = null;
let watchedLists = new Set();

function refreshIfStale() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (inFlight) return;
  if (Date.now() - store.fetchedAt < STALE_AFTER) return;
  void refreshCore();
  // Only the listings actually on screen, so a background tab with six
  // mailboxes open in its history doesn't re-read all of them every minute.
  for (const key of watchedLists) {
    const parsed = parseKey(key);
    if (parsed) void fetchList(parsed).catch(() => {});
  }
}

function watchMail() {
  watchers += 1;
  if (watchers === 1) {
    pollTimer = window.setInterval(refreshIfStale, POLL_EVERY);
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
  }
  return () => {
    watchers -= 1;
    if (watchers > 0) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
    window.removeEventListener('focus', refreshIfStale);
    document.removeEventListener('visibilitychange', refreshIfStale);
  };
}

/** Warm the store on launch, so the Life Hub card is never a skeleton. */
export function warmMail() {
  if (store.fetchedAt && Date.now() - store.fetchedAt < STALE_AFTER) return Promise.resolve();
  return refreshCore();
}

/** The mail state right now, for code outside React — the assistant's tools. */
export const getMailState = () => store;

/* ── Actions, usable from anywhere ───────────────────────────────────────── */

export const mailActions = {
  refresh: () => Promise.all([refreshCore({ refresh: true }), ...[...watchedLists].map((key) => {
    const parsed = parseKey(key);
    return parsed ? fetchList(parsed, { refresh: true }).catch(() => {}) : null;
  })]),

  list: (options, opts) => fetchList(options, opts),

  /** A full message. Held in memory for the tab; never written to disk. */
  async open(message, { images = false } = {}) {
    const cacheKey = `${message.accountId}:${message.id}:${images ? 'img' : ''}`;
    if (openBodies.has(cacheKey)) return openBodies.get(cacheKey);
    const full = await api.mail.message(message.id, {
      accountId: message.accountId,
      images: images ? '1' : undefined,
    });
    openBodies.set(cacheKey, full);
    // A cap, so a long session reading a lot of mail doesn't grow without end.
    if (openBodies.size > 40) openBodies.delete(openBodies.keys().next().value);
    return full;
  },

  thread: (message) => api.mail.thread(message.threadId, { accountId: message.accountId }),

  /**
   * Flag changes, applied to what's on screen first.
   *
   * Marking something read has to feel instant — waiting on a round trip to dim
   * a row is the difference between an inbox that responds and one that lags.
   * The provider is then told, and a failure puts the row back.
   */
  async setFlags(message, changes) {
    applyFlags(message, changes);
    try {
      await api.mail.patch(message.id, { accountId: message.accountId, ...changes });
      void refreshCore({ refresh: true });
    } catch (error) {
      applyFlags(message, revert(changes, message));
      throw error;
    }
  },

  /** Archive, bin, spam, or back to the inbox. Removed from the list at once. */
  async move(message, mailbox) {
    const removed = takeOut(message);
    try {
      const result = await api.mail.move(message.id, { accountId: message.accountId, mailbox });
      void refreshCore({ refresh: true });
      return result;
    } catch (error) {
      putBack(removed, message);
      throw error;
    }
  },

  async send({ accountId, ...draft }) {
    setStore({ sending: true });
    try {
      const result = await api.mail.send({ accountId, ...draft });
      void refreshCore({ refresh: true });
      return result;
    } finally {
      setStore({ sending: false });
    }
  },

  async saveDraft({ accountId, ...draft }) {
    const result = await api.mail.saveDraft({ accountId, ...draft });
    void refreshCore({ refresh: true });
    return result;
  },

  async discardDraft({ accountId, draftId }) {
    const result = await api.mail.deleteDraft(draftId, accountId);
    void refreshCore({ refresh: true });
    return result;
  },

  async connect(provider) {
    const { url } = await api.mail.connectUrl(provider);
    window.open(url, 'pulse-mail-oauth', 'width=560,height=720');
  },

  async disconnect(accountId) {
    await api.mail.disconnect(accountId);
    // Drop that account's mail from memory and from disk straight away.
    for (const key of [...openBodies.keys()]) if (key.startsWith(`${accountId}:`)) openBodies.delete(key);
    setStore({
      lists: Object.fromEntries(
        Object.entries(store.lists).map(([key, page]) => [
          key,
          { ...page, messages: (page.messages ?? []).filter((m) => m.accountId !== accountId) },
        ]),
      ),
    });
    persist();
    await refreshCore({ refresh: true });
  },
};

/* ── The hook ─────────────────────────────────────────────────────────────── */

/**
 * @param {object} [options] which listing this component wants kept fresh.
 *   Omit it to read only the status and the Life Hub summary.
 */
export function useMail(options = null) {
  const [snap, setSnap] = useState(store);
  const key = options ? listKey(options) : null;

  useEffect(() => {
    subscribers.add(setSnap);
    setSnap(store);
    return () => subscribers.delete(setSnap);
  }, []);

  // Status and the summary: read if stale, then keep fresh while mounted.
  useEffect(() => {
    if (!store.fetchedAt || Date.now() - store.fetchedAt >= STALE_AFTER) void refreshCore();
    return watchMail();
  }, []);

  // Reconnect the moment the OAuth window reports success.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.data === 'pulse:mail-connected') void refreshCore({ refresh: true });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // The listing this component is showing.
  useEffect(() => {
    if (!key) return undefined;
    watchedLists.add(key);
    const page = store.lists[key];
    const connected = (store.status?.accounts ?? []).length > 0;
    if (connected && (!page || Date.now() - (page.fetchedAt ?? 0) >= STALE_AFTER)) {
      void fetchList(parseKey(key)).catch(() => {});
    }
    return () => {
      watchedLists.delete(key);
    };
    // The key is the whole identity of the request.
  }, [key, snap.status]);

  const page = key ? snap.lists[key] : null;

  const accounts = useMemo(() => snap.status?.accounts ?? [], [snap.status]);
  const capabilities = useMemo(() => mergeCapabilities(accounts), [accounts]);

  const loadMore = useCallback(() => (key ? fetchList(parseKey(key), { more: true }) : Promise.resolve()), [key]);

  /**
   * One message as the store holds it NOW, given one picked up earlier.
   *
   * A view that remembers which message is open remembers the object it was
   * handed, and that copy stops being true the moment a flag changes: the row
   * in the list went dim but the reader above it still offered "Mark as read"
   * and still showed it unstarred. This hands back the live row where there is
   * one, falling back to what the caller had when it has scrolled out of the
   * page or lives in another mailbox.
   */
  const live = useCallback(
    (message) => {
      if (!message) return null;
      const id = `${message.accountId}:${message.id}`;
      for (const list of Object.values(snap.lists)) {
        const found = (list.messages ?? []).find((m) => `${m.accountId}:${m.id}` === id);
        if (found) return { ...message, ...found };
      }
      return message;
    },
    [snap.lists],
  );

  return {
    live,
    // Connection
    status: snap.status,
    accounts,
    connected: accounts.length > 0,
    configured: snap.status?.configured ?? null,
    providers: snap.status?.providers ?? [],
    unavailable: snap.status?.unavailable ?? [],
    capabilities,
    backendReachable: snap.reachable,

    // Figures for the Life Hub
    summary: snap.summary,

    // Mailboxes, with counts folded across accounts
    mailboxes: snap.mailboxes,
    unreadFor: (mailbox) => unreadFor(snap.mailboxes, mailbox, options?.accountId),

    // The listing
    messages: page?.messages ?? [],
    hasMore: Boolean(page?.nextPageToken),
    listLoading: Boolean(page?.loading),
    listError: page?.error ?? null,
    listAccounts: page?.accounts ?? [],
    loading: snap.loading,
    sending: snap.sending,
    lastFetchedAt: snap.fetchedAt,
    loadMore,

    ...mailActions,
  };
}


/* ── The store's own writes, built on the pure reducers in services/mail ──── */

/**
 * A flag change, applied to the listings, the Life Hub's figure and the
 * sidebar's badge — the three places a read count is shown.
 *
 * All three move together or the view contradicts itself: a row that has gone
 * dim beside a badge that still says 12.
 */
function applyFlags(message, changes) {
  const delta = unreadDelta(message, changes);
  setStore({
    lists: patchLists(store.lists, message, changes),
    summary: bumpUnread(store.summary, message.accountId, delta),
    mailboxes: bumpMailboxes(store.mailboxes, message.accountId, delta, 'inbox'),
  });
}

/** Out of every listing it appears in, remembering where for a failed move. */
function takeOut(message) {
  const { lists, removed } = removeFromLists(store.lists, message);
  // Gone from the inbox, so its unread no longer counts towards it.
  const delta = message.unread ? -1 : 0;
  setStore({
    lists,
    summary: bumpUnread(store.summary, message.accountId, delta),
    mailboxes: bumpMailboxes(store.mailboxes, message.accountId, delta, 'inbox'),
  });
  return removed;
}

/** Back where they were, with the unread figures restored too. */
function putBack(removed, message) {
  const delta = message?.unread ? 1 : 0;
  setStore({
    lists: restoreLists(store.lists, removed),
    summary: bumpUnread(store.summary, message?.accountId, delta),
    mailboxes: bumpMailboxes(store.mailboxes, message?.accountId, delta, 'inbox'),
  });
}
