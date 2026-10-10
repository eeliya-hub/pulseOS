import { api } from '../api/backendClient.js';
import { getMailState } from '../../hooks/useMail.js';
import { goToView } from '../ui/navigation.js';
import { splitAddresses } from './addresses.js';

/**
 * The assistant's half of the email integration.
 *
 * These are the handlers behind the mail tool schemas in the backend's
 * services/ai/tools.js, executed here like every other Pulse tool. They are
 * deliberately lopsided: four of them read, one opens a view, and one fills in
 * the composer. None of them sends, archives, bins or flags anything.
 *
 * That is not enforced by a prompt. It is enforced by there being no function
 * here that calls mailService.send, and no tool schema that would reach one —
 * so a model that decides to send an email finds it has nothing to do it with.
 */

/** Asking for a mailbox is not something these tools can do: scopes are capped. */
const context = (params) => api.mail.context(params);

/** Where the composer gets opened from, set by the Mail view while it is mounted. */
let composer = null;

/**
 * Let the Mail view handle a draft itself while it is open.
 *
 * Without this the assistant's draft would land in a view that is not on
 * screen. With it, "reply to Maya" from the chat opens Mail with the composer
 * already filled.
 */
export function registerComposer(open) {
  composer = open;
  return () => {
    if (composer === open) composer = null;
  };
}

/**
 * Work handed to the Mail view for when it mounts.
 *
 * The assistant can be asked to draft or open an email from anywhere — the chat
 * popover, voice, another view entirely — and Mail may not be on screen. These
 * hold the one thing it should do on arrival, and are collected once.
 */
let pendingDraft = null;
let pendingOpen = null;

/** A draft the Mail view should open as soon as it mounts. */
export const takePendingDraft = () => {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
};

/** A message the assistant asked to open. */
export const takePendingOpen = () => {
  const open = pendingOpen;
  pendingOpen = null;
  return open;
};


const connected = () => (getMailState().status?.accounts ?? []).length > 0;

const notConnected = {
  error: 'No mail account is connected. The user can connect Gmail or Outlook in Settings → Mail.',
};

/** Which account a tool call means, when the user has more than one. */
function resolveAccount(accountId) {
  const accounts = getMailState().status?.accounts ?? [];
  if (accountId) return accounts.find((a) => a.id === accountId || a.email === accountId)?.id ?? accountId;
  return accounts.length === 1 ? accounts[0].id : undefined;
}

export const mailTools = {
  async get_mail_summary() {
    if (!connected()) return notConnected;
    const summary = await api.mail.summary();
    return {
      unread: summary.unread,
      look_important: summary.important,
      appear_to_need_a_reply: summary.needsAction,
      mention_a_deadline: summary.deadlines,
      mention_a_meeting: summary.meetings,
      arrived_in_last_day: summary.recent,
      accounts: (summary.accounts ?? []).map((a) => ({ email: a.email, unread: a.unread, ok: a.ok })),
      // Enough to name one and to read it next, and no more.
      worth_attention: (summary.highlights ?? []).map((h) => ({
        id: h.id,
        account_id: h.accountId,
        from: h.from?.name ? `${h.from.name} <${h.from.email}>` : h.from?.email,
        subject: h.subject,
        preview: h.snippet,
        date: h.date,
        unread: h.unread,
        signals: h.signals,
      })),
      note: 'These signals are read off the subject and preview line, not a certainty. Read a message before telling the user what it requires.',
    };
  },

  async list_unread_mail({ limit } = {}) {
    if (!connected()) return notConnected;
    const found = await context({ scope: 'priority', limit: Math.min(10, Math.max(1, limit || 8)) });
    return { count: found.count, messages: found.messages, note: 'Headers only. Use read_mail with an id to read one.' };
  },

  async search_mail({ query, limit } = {}) {
    if (!connected()) return notConnected;
    if (!(query || '').trim()) return { error: 'Searching mail needs something to search for.' };
    const found = await context({ scope: 'search', query, limit: Math.min(10, Math.max(1, limit || 5)) });
    return {
      query,
      count: found.count,
      messages: found.messages,
      note: found.count ? 'Headers only. Use read_mail with an id to read one properly.' : 'Nothing matched.',
    };
  },

  async read_mail({ id, account_id, thread } = {}) {
    if (!connected()) return notConnected;
    if (!id) return { error: 'read_mail needs the id of the message to read.' };
    try {
      const found = await context({
        scope: thread ? 'thread' : 'message',
        messageId: id,
        accountId: resolveAccount(account_id),
      });
      return thread && found.messages
        ? { thread_length: found.count, showing: found.messages.length, messages: found.messages }
        : { message: found.message };
    } catch (error) {
      return { error: error?.message ?? 'That message could not be read.' };
    }
  },

  /**
   * Fill in the composer. The user sends it.
   *
   * Returns `sent: false` explicitly, because a model that gets back a bare
   * success will tell the user their email has gone.
   */
  async draft_email({ to, cc, subject, body, reply_to_id, reply_all, account_id } = {}) {
    if (!connected()) return notConnected;
    if (!(body || '').trim() && !reply_to_id) {
      return { error: 'A draft needs a body — write the message out in full.' };
    }

    let draft = {
      accountId: resolveAccount(account_id),
      to: to ?? '',
      cc: cc ?? '',
      subject: subject ?? '',
      text: body ?? '',
    };

    // A reply has to carry the threading references, or it starts a new
    // conversation in the recipient's client.
    if (reply_to_id) {
      try {
        const found = await context({ scope: 'message', messageId: reply_to_id, accountId: resolveAccount(account_id) });
        const source = found.message;
        draft = {
          ...draft,
          accountId: source.accountId ?? draft.accountId,
          to: to ?? source.from,
          subject: subject ?? (/^re:/i.test(source.subject) ? source.subject : `Re: ${source.subject}`),
          threadId: source.threadId,
          replyToMessageId: reply_to_id,
          replyAll: Boolean(reply_all),
        };
      } catch {
        // Still worth opening with what we have rather than failing outright.
        draft.replyToMessageId = reply_to_id;
        draft.replyAll = Boolean(reply_all);
      }
    }

    const recipients = splitAddresses(draft.to).length + splitAddresses(draft.cc).length;

    if (composer) {
      composer(draft);
    } else {
      // Mail is not on screen: stash it and go there, where it opens on arrival.
      pendingDraft = draft;
      goToView('mail');
    }

    return {
      drafted: true,
      sent: false,
      recipients: recipients || null,
      subject: draft.subject || null,
      note: 'The composer is open with this in it. Pulse cannot send email — tell the user it is ready for them to read and send.',
    };
  },

  async open_mail({ id, account_id } = {}) {
    goToView('mail');
    if (!id) return { opened: 'mail' };
    try {
      const found = await context({ scope: 'message', messageId: id, accountId: resolveAccount(account_id) });
      pendingOpen = { id, accountId: found.message?.accountId ?? resolveAccount(account_id) };
      return { opened: 'mail', message: found.message?.subject ?? id };
    } catch {
      return { opened: 'mail' };
    }
  },
};

