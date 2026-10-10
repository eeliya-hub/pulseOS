/**
 * The mailboxes Pulse knows about, independent of any provider.
 *
 * Gmail has labels, Microsoft has folders, IMAP has something else again. The
 * rest of the app — the list, the Life Hub card, the assistant — only ever
 * names one of these, and each provider says which of them it can answer for.
 *
 * Nothing is faked: a provider that has no notion of "important" reports it
 * unsupported and the sidebar simply doesn't offer it, rather than showing an
 * empty mailbox that looks broken.
 */

/** The standard set, in the order the sidebar reads. */
export const MAILBOXES = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', counts: true },
  { id: 'starred', label: 'Starred', icon: 'star' },
  { id: 'important', label: 'Important', icon: 'bookmark' },
  { id: 'drafts', label: 'Drafts', icon: 'file', counts: true },
  { id: 'sent', label: 'Sent', icon: 'send' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'spam', label: 'Spam', icon: 'shield' },
  { id: 'trash', label: 'Trash', icon: 'trash' },
];

/**
 * Gmail's own sorting of the inbox. Only Gmail has these; they are a view OF
 * the inbox rather than somewhere else mail lives, which is why they are their
 * own list and why their unread counts must never be added to the inbox's.
 */
export const CATEGORIES = [
  { id: 'primary', label: 'Primary' },
  { id: 'social', label: 'Social' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'updates', label: 'Updates' },
];

const MAILBOX_IDS = new Set(MAILBOXES.map((m) => m.id));
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

export const isMailbox = (id) => MAILBOX_IDS.has(id);
export const isCategory = (id) => CATEGORY_IDS.has(id);

/**
 * Mailboxes that are NOT ordinary mail, and must stay out of any inbox figure.
 *
 * The brief's rule, kept in one place so no caller has to remember it: spam and
 * trash are never counted, and a draft is something you wrote, not something
 * that arrived.
 */
export const NOT_INBOX = new Set(['spam', 'trash', 'drafts', 'sent']);

/** Does a mailbox id name somewhere mail can be moved TO? */
export const isMoveTarget = (id) => ['inbox', 'archive', 'spam', 'trash'].includes(id);

/**
 * The label for a mailbox or category id, for messages the user will read.
 */
export function mailboxLabel(id) {
  return (
    MAILBOXES.find((m) => m.id === id)?.label ?? CATEGORIES.find((c) => c.id === id)?.label ?? id
  );
}
