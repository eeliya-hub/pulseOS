/**
 * The mail store's arithmetic, with nothing around it.
 *
 * Kept apart from useMail.js so it can be tested, which matters more here than
 * it looks: this is the code that moves the unread figure on the Life Hub card
 * when you mark something read, takes a row out of every listing it appears in
 * when you archive it, and puts it back when the provider refuses. The first
 * version of it got the direction wrong in a way no type would have caught —
 * it compared a boolean against a boolean against `false` — and the bug was
 * invisible because the next poll corrected the number a few seconds later.
 *
 * Pure functions over plain objects. No React, no fetch, no storage.
 */

/** Everything that is not a header, removed. The rule for what may touch disk. */
export function strip(message) {
  const headers = { ...message };
  delete headers.body;
  delete headers.attachments;
  return headers;
}

/** A message's identity: its id is only unique within its own account. */
export const idOf = (message) => (message ? `${message.accountId}:${message.id}` : null);

/** The key a listing is cached under. Its parts are its whole identity. */
export const listKey = ({ accountId, mailbox = 'inbox', category, query, unread } = {}) =>
  `${accountId ?? 'all'}:${mailbox}:${category ?? ''}:${(query ?? '').trim().toLowerCase()}:${unread ? 'unread' : ''}`;

/** The same key, read back into the request it describes. */
export function parseKey(key) {
  const [accountId, mailbox, category, query, unread] = String(key).split(':');
  if (!mailbox) return null;
  return {
    accountId: accountId === 'all' ? undefined : accountId,
    mailbox,
    category: category || undefined,
    query: query || undefined,
    unread: unread === 'unread',
  };
}

/** One copy of each message, newest first, across pages that may overlap. */
export function dedupe(messages) {
  const seen = new Set();
  return messages
    .filter((message) => {
      const id = idOf(message);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));
}

/**
 * Move the unread figures by `delta`, on the whole and on one account.
 *
 * Applies a decision made by the caller; it does not make one. That separation
 * is the fix for the bug above — working out the direction and applying it in
 * one expression is what went wrong.
 */
export function bumpUnread(summary, accountId, delta) {
  if (!summary || !delta) return summary;
  const clamp = (n) => Math.max(0, (n ?? 0) + delta);
  return {
    ...summary,
    unread: clamp(summary.unread),
    accounts: (summary.accounts ?? []).map((a) => (a.id === accountId ? { ...a, unread: clamp(a.unread) } : a)),
  };
}

/**
 * Which way the unread figure should move for a flag change.
 * +1 when something becomes unread, -1 when it stops being, 0 when neither.
 */
export function unreadDelta(message, changes) {
  if (!changes || changes.read === undefined) return 0;
  const wasUnread = Boolean(message.unread);
  const nowUnread = changes.read === false;
  if (wasUnread === nowUnread) return 0;
  return nowUnread ? 1 : -1;
}

/**
 * A flag change as the message itself records it.
 *
 * The provider API is asked to make something `read: true`; a message carries
 * the opposite field, `unread`. Spreading the request straight onto the message
 * — which is what this used to do — set a `read` property that nothing renders
 * and left `unread` exactly as it was. So marking a message read did nothing
 * visible until the next poll overwrote the row with the provider's version,
 * which read as "it only works if I refresh".
 *
 * Every other flag is named the same on both sides and passes straight through.
 */
export function flagFields(changes) {
  const fields = {};
  for (const [name, value] of Object.entries(changes ?? {})) {
    if (name === 'read') fields.unread = !value;
    else fields[name] = value;
  }
  return fields;
}

/** Apply a flag change to this message wherever it appears. */
export function patchLists(lists, message, changes) {
  const fields = flagFields(changes);
  return Object.fromEntries(
    Object.entries(lists).map(([key, page]) => [
      key,
      {
        ...page,
        messages: (page.messages ?? []).map((m) => (idOf(m) === idOf(message) ? { ...m, ...fields } : m)),
      },
    ]),
  );
}

/**
 * The same move applied to the sidebar's own counts.
 *
 * The badge beside Inbox comes from the provider's mailbox listing, not from
 * the rows on screen, so without this it kept the old number until the next
 * refresh — the figure and the list disagreeing about the same mailbox.
 */
export function bumpMailboxes(mailboxes, accountId, delta, mailbox = 'inbox') {
  if (!delta || !Array.isArray(mailboxes)) return mailboxes;
  return mailboxes.map((account) => {
    if (accountId && account.accountId !== accountId) return account;
    return {
      ...account,
      mailboxes: (account.mailboxes ?? []).map((box) =>
        box.id === mailbox && typeof box.unread === 'number'
          ? { ...box, unread: Math.max(0, box.unread + delta) }
          : box,
      ),
    };
  });
}

/** The flags as they were, to put back when a change is refused. */
export function revert(changes, message) {
  return Object.fromEntries(
    Object.entries(changes).map(([field]) => {
      if (field === 'read') return [field, !message.unread];
      return [field, Boolean(message[field])];
    }),
  );
}

/**
 * Take a message out of every listing, remembering where each copy was.
 * Returns the new listings and what to hand `restoreLists` if the move fails.
 */
export function removeFromLists(lists, message) {
  const removed = [];
  const next = Object.fromEntries(
    Object.entries(lists).map(([key, page]) => {
      const index = (page.messages ?? []).findIndex((m) => idOf(m) === idOf(message));
      if (index < 0) return [key, page];
      removed.push({ key, index, message: page.messages[index] });
      return [key, { ...page, messages: page.messages.filter((_, i) => i !== index) }];
    }),
  );
  return { lists: next, removed };
}

/** Put rows back exactly where they were. */
export function restoreLists(lists, removed) {
  if (!removed?.length) return lists;
  const next = { ...lists };
  for (const { key, index, message } of removed) {
    const page = next[key];
    if (!page) continue;
    const messages = [...(page.messages ?? [])];
    messages.splice(Math.min(index, messages.length), 0, message);
    next[key] = { ...page, messages };
  }
  return next;
}

/**
 * What the connected accounts can do between them.
 *
 * A capability is offered when ANY account has it, because the sidebar is
 * shared — but the sidebar also reads it per account, so Gmail's categories
 * never appear for someone who has only connected Outlook.
 */
export function mergeCapabilities(accounts) {
  const list = accounts.map((a) => a.capabilities).filter(Boolean);
  if (!list.length) return { mailboxes: [], categories: [], search: false };
  const union = (field) => [...new Set(list.flatMap((c) => c[field] ?? []))];
  return {
    mailboxes: union('mailboxes'),
    categories: union('categories'),
    search: list.some((c) => c.search),
    threads: list.some((c) => c.threads),
    drafts: list.some((c) => c.drafts),
    send: list.some((c) => c.send),
    // Never true: no provider adapter exposes a permanent delete.
    permanentDelete: list.some((c) => c.permanentDelete),
  };
}

/**
 * The unread count for one mailbox, summed across the accounts in view.
 *
 * `null` where no account keeps a count for it — Starred and Important on
 * Outlook have no folder behind them. The sidebar must show no badge at all
 * there, because a zero would read as "nothing unread" rather than "not
 * counted".
 */
export function unreadFor(mailboxes, mailbox, accountId) {
  const relevant = accountId ? mailboxes.filter((a) => a.accountId === accountId) : mailboxes;
  const counts = relevant
    .flatMap((a) => a.mailboxes ?? [])
    .filter((b) => b.id === mailbox)
    .map((b) => b.unread)
    .filter((n) => typeof n === 'number');
  return counts.length ? counts.reduce((sum, n) => sum + n, 0) : null;
}
