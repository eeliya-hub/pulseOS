import { config, integrationStatus } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { createCache } from '../../utils/cache.js';
import {
  accountsFor,
  forgetAccount,
  forgetAllAccounts,
  listAccounts,
  readAccount,
  requireAccount,
  requireNamedAccount,
} from './accounts.js';
import { gmailProvider } from './gmail.provider.js';
import { isCategory, isMailbox, isMoveTarget, NOT_INBOX } from './mailboxes.js';
import { microsoftProvider } from './microsoft.provider.js';
import { htmlToText } from './normalize.js';
import { sanitizeHtml, textToHtml } from './sanitize.js';
import { priority, triage, triaged } from './triage.js';

/**
 * Mail, for the rest of Pulse.
 *
 * Nothing above this file knows which provider an account belongs to. The
 * service resolves accounts, asks the right adapter, normalises what comes
 * back, and holds it just long enough to be quick.
 *
 * Caching follows the decision taken for this feature: a LISTING is cheap to
 * hold and safe to reuse, a BODY is held in memory for as long as it is useful
 * (a message never changes once it has arrived) and NEVER written to disk —
 * there is no persistence layer here at all, by design. The frontend mirrors
 * that rule: it keeps headers in localStorage so the inbox paints instantly and
 * keeps bodies in memory for the session only.
 */

const providers = {
  google: gmailProvider,
  microsoft: microsoftProvider,
  // yahoo: pending Yahoo approving IMAP/SMTP mail scopes for an application —
  // see the note in config/env.js. The interface above is what it would implement.
};

// Three caches rather than one, because the right lifetime is different for
// each and a write to one should not throw away the others.
const lists = createCache(config.mail.listTtlMs);
const bodies = createCache(config.mail.messageTtlMs);
const meta = createCache(60_000);

function providerFor(name) {
  const provider = providers[name];
  if (!provider) throw ApiError.badRequest(`Unknown mail provider "${name}".`);
  return provider;
}

/** Everything a write should invalidate. The body cache survives: it cannot go stale. */
function invalidate(accountId) {
  lists.clear(accountId ? `:${accountId}:` : undefined);
  meta.clear(accountId ? `:${accountId}:` : undefined);
}

/**
 * Throw away everything held for an account, bodies included.
 *
 * What an explicit refresh has to do. Without it, pressing refresh in the mail
 * view re-read a cache up to `listTtlMs` old and showed the same inbox back —
 * which looks exactly like a refresh that does not work.
 */
function evict(accountId) {
  invalidate(accountId);
  bodies.clear(accountId ? `:${accountId}:` : undefined);
}

/** The user's own addresses, which is how triage tells "to me" from "cc'd". */
const ownAddresses = () => listAccounts().map((a) => a.email).filter(Boolean);

export const mailService = {
  providers,

  /**
   * Forget what is held for an account (or for all of them). Called by an
   * explicit refresh, and by the tests between cases so one does not answer
   * from the cache another filled.
   */
  evict,

  /** Forget every connected account. Tests only — never reached from a route. */
  forgetAll: forgetAllAccounts,

  /* ── Connecting ───────────────────────────────────────────────────────── */

  /** Which providers are set up, which accounts are connected, what each can do. */
  status() {
    const configured = integrationStatus().mail;
    const accounts = listAccounts().map((account) => {
      const stored = readAccount(account.provider, account.id);
      return {
        ...account,
        providerLabel: providers[account.provider]?.label ?? account.provider,
        capabilities: providers[account.provider]?.capabilities() ?? null,
        // A grant can die while its entry is still here; saying so is what lets
        // the UI offer "Reconnect" against the right address instead of the
        // account quietly going silent.
        needsReconnect: Boolean(stored?.deadGrant),
      };
    });
    return {
      configured,
      accounts,
      providers: Object.values(providers).map((p) => ({
        id: p.id,
        label: p.label,
        configured: p.configured(),
        capabilities: p.capabilities(),
      })),
      // Said plainly so the UI can explain it rather than showing a dead button.
      unavailable: [
        {
          id: 'yahoo',
          label: 'Yahoo Mail',
          reason:
            'Yahoo has retired its Mail API. Access is IMAP with OAuth2, and those scopes need Yahoo to approve an application first.',
        },
      ],
    };
  },

  authUrl(providerName, state) {
    return { url: providerFor(providerName).getAuthUrl(state) };
  },

  async connect(providerName, code) {
    const result = await providerFor(providerName).handleCallback(code);
    invalidate();
    return result;
  },

  disconnect(id) {
    const account = listAccounts().find((a) => a.id === id);
    if (!account) throw ApiError.notFound(`No connected mail account "${id}".`);
    forgetAccount(account.provider, id);
    invalidate(id);
    return { disconnected: true, id };
  },

  /* ── Reading ──────────────────────────────────────────────────────────── */

  /** The mailboxes each account offers, with unread counts where it has them. */
  async mailboxes(accountId, { refresh = false } = {}) {
    if (refresh) meta.clear(accountId ? `:${accountId}:` : undefined);
    const accounts = accountsFor(accountId);
    const results = await Promise.all(
      accounts.map(async (account) => {
        const key = `boxes:${account.id}:`;
        try {
          const mailboxes = await meta.wrap(key, () => providerFor(account.provider).listMailboxes(account));
          return { accountId: account.id, provider: account.provider, email: account.account?.email ?? '', mailboxes, ok: true };
        } catch (error) {
          return {
            accountId: account.id,
            provider: account.provider,
            email: account.account?.email ?? '',
            mailboxes: [],
            ok: false,
            reason: error?.statusCode === 401 ? 'auth' : 'error',
            message: error?.message ?? 'Failed',
          };
        }
      }),
    );
    return { accounts: results };
  },

  /**
   * A page of mail.
   *
   * With no `accountId` this reads every connected account and interleaves them
   * by date, which is what makes a unified inbox possible later without the UI
   * changing. Each account pages independently, so the cursor is a map of
   * account id → that provider's own token.
   */
  async list({ accountId, mailbox = 'inbox', category, q, pageToken, limit = 25, unread, refresh = false } = {}) {
    if (mailbox && !isMailbox(mailbox)) throw ApiError.badRequest(`Unknown mailbox "${mailbox}".`);
    if (category && !isCategory(category)) throw ApiError.badRequest(`Unknown category "${category}".`);

    const accounts = accountsFor(accountId);
    // Said outright, because "no mail" and "no mailbox connected" look identical
    // in an empty list and mean entirely different things to whoever is reading.
    if (!accounts.length) {
      return { connected: false, mailbox, category: category ?? null, messages: [], nextPageToken: null, accounts: [] };
    }
    // An explicit refresh must reach the provider, not the cache it just filled.
    if (refresh) invalidate(accountId);
    const cursors = parseCursor(pageToken);

    const pages = await Promise.all(
      accounts.map(async (account) => {
        const provider = providerFor(account.provider);
        // An account already past its last page contributes nothing more.
        if (cursors && cursors[account.id] === null) return { accountId: account.id, messages: [], nextPageToken: null, ok: true };
        const cursor = cursors ? cursors[account.id] : undefined;

        // A category only exists where the provider says it does, rather than
        // being passed on and quietly returning an empty mailbox.
        const supported = provider.capabilities().categories ?? [];
        const useCategory = category && supported.includes(category) ? category : undefined;
        if (category && !useCategory) return { accountId: account.id, messages: [], nextPageToken: null, ok: true, unsupported: 'category' };

        const key = `list:${account.id}:${mailbox}:${useCategory ?? ''}:${q ?? ''}:${cursor ?? ''}:${unread ? 1 : 0}:${limit}`;
        try {
          const page = await lists.wrap(key, () =>
            mailbox === 'drafts'
              ? provider.listDrafts(account, { limit, pageToken: cursor })
              : provider.listMessages(account, { mailbox, category: useCategory, q, pageToken: cursor, limit, unread }),
          );
          return { accountId: account.id, ...page, ok: true };
        } catch (error) {
          // One account failing must never look like an empty inbox: the caller
          // is told which account could not be read and why.
          return {
            accountId: account.id,
            messages: [],
            nextPageToken: null,
            ok: false,
            reason: error?.statusCode === 401 ? 'auth' : 'error',
            message: error?.message ?? 'Failed',
          };
        }
      }),
    );

    const mine = ownAddresses();
    const messages = triaged(
      pages.flatMap((p) => p.messages ?? []),
      mine,
    ).sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0));

    const next = Object.fromEntries(pages.map((p) => [p.accountId, p.nextPageToken ?? null]));
    const anyMore = Object.values(next).some(Boolean);

    return {
      connected: true,
      mailbox,
      category: category ?? null,
      messages,
      nextPageToken: anyMore ? encodeCursor(next) : null,
      accounts: pages.map((p) => ({
        id: p.accountId,
        ok: p.ok,
        ...(p.ok ? {} : { reason: p.reason, message: p.message }),
      })),
    };
  },

  /**
   * One message in full, ready to render.
   *
   * The body is sanitised here rather than in the browser, so no unsanitised
   * email HTML ever crosses the wire. The reader then puts what survives inside
   * a sandboxed frame — two independent defences, because this is the one place
   * in Pulse where someone else chooses the markup.
   */
  async message({ accountId, id, images = false } = {}) {
    if (!id) throw ApiError.badRequest('Provide the message `id`.');
    const account = requireAccount(accountId);
    const raw = await bodies.wrap(`msg:${account.id}:${id}`, () => providerFor(account.provider).getMessage(account, id));

    return { ...dress(raw, { images }), triage: triage(raw, ownAddresses()) };
  },

  /** A whole conversation, for the reader and for the assistant's context. */
  async thread({ accountId, threadId, images = false } = {}) {
    if (!threadId) throw ApiError.badRequest('Provide the `threadId`.');
    const account = requireAccount(accountId);
    const thread = await bodies.wrap(`thread:${account.id}:${threadId}`, () =>
      providerFor(account.provider).getThread(account, threadId),
    );
    return {
      id: threadId,
      messages: (thread.messages ?? []).map((m) => dress(m, { images })),
    };
  },

  async attachment({ accountId, messageId, attachmentId } = {}) {
    if (!messageId || !attachmentId) throw ApiError.badRequest('Provide both `messageId` and `attachmentId`.');
    const account = requireAccount(accountId);
    const message = await bodies.wrap(`msg:${account.id}:${messageId}`, () =>
      providerFor(account.provider).getMessage(account, messageId),
    );
    const info = (message.attachments ?? []).find((a) => a.id === attachmentId);
    if (!info) throw ApiError.notFound('No such attachment on that message.');
    if (info.size > config.mail.maxAttachmentBytes) {
      throw ApiError.badRequest(`That attachment is larger than Pulse will carry (${Math.round(info.size / 1e6)} MB).`);
    }
    const file = await providerFor(account.provider).getAttachment(account, messageId, attachmentId);
    return { name: info.name, mimeType: info.mimeType, size: file.size || info.size, data: file.data };
  },

  /* ── The Life Hub card ────────────────────────────────────────────────── */

  /**
   * What the Life Hub says about mail, in one request.
   *
   * Only real inbox mail is counted. Spam, bin, drafts and sent are excluded
   * outright — the brief's rule, and the reason the count matches what the user
   * would count themselves.
   */
  async summary({ accountId, refresh = false } = {}) {
    if (refresh) invalidate(accountId);
    const accounts = accountsFor(accountId);
    if (!accounts.length) return { connected: false, accounts: [], unread: 0, important: 0, needsAction: 0, deadlines: 0, recent: 0, highlights: [] };

    const mine = ownAddresses();
    const perAccount = await Promise.all(
      accounts.map(async (account) => {
        const key = `summary:${account.id}:`;
        try {
          return await meta.wrap(key, async () => {
            const provider = providerFor(account.provider);
            const [boxes, page] = await Promise.all([
              provider.listMailboxes(account).catch(() => []),
              // One page of the inbox is enough to judge: the counts that must
              // be exact come from the provider's own unread figure, and the
              // signals only need the mail recent enough to still matter.
              provider.listMessages(account, { mailbox: 'inbox', limit: 40 }),
            ]);
            const inbox = boxes.find((b) => b.id === 'inbox');
            return {
              id: account.id,
              provider: account.provider,
              email: account.account?.email ?? '',
              name: account.account?.name ?? '',
              unread: inbox?.unread ?? page.messages.filter((m) => m.unread).length,
              messages: page.messages,
              ok: true,
            };
          });
        } catch (error) {
          return {
            id: account.id,
            provider: account.provider,
            email: account.account?.email ?? '',
            unread: 0,
            messages: [],
            ok: false,
            reason: error?.statusCode === 401 ? 'auth' : 'error',
            message: error?.message ?? 'Failed',
          };
        }
      }),
    );

    const all = perAccount.flatMap((a) =>
      // Belt and braces: a provider should never return spam or bin in the
      // inbox, but the count is the one number the user checks against reality.
      (a.messages ?? []).filter((m) => !(m.mailboxes ?? []).some((box) => NOT_INBOX.has(box))),
    );
    const scored = triaged(all, mine);
    const unreadScored = scored.filter((m) => m.unread);
    const dayAgo = Date.now() - 24 * 3_600_000;

    return {
      connected: true,
      unread: perAccount.reduce((sum, a) => sum + (a.unread ?? 0), 0),
      important: unreadScored.filter((m) => m.important || m.triage.score >= 10).length,
      needsAction: unreadScored.filter((m) => m.triage.needsAction).length,
      deadlines: unreadScored.filter((m) => m.triage.hasDeadline).length,
      meetings: unreadScored.filter((m) => m.triage.meeting).length,
      recent: scored.filter((m) => m.date && new Date(m.date).getTime() > dayAgo).length,
      // The two or three worth naming on the card, headers only.
      highlights: priority(unreadScored.length ? unreadScored : scored, mine, 3).map((m) => ({
        id: m.id,
        accountId: m.accountId,
        provider: m.provider,
        from: m.from,
        subject: m.subject,
        snippet: m.snippet,
        date: m.date,
        unread: m.unread,
        signals: m.triage.signals,
        score: m.triage.score,
      })),
      accounts: perAccount.map((a) => ({
        id: a.id,
        provider: a.provider,
        email: a.email,
        name: a.name,
        unread: a.unread,
        ok: a.ok,
        ...(a.ok ? {} : { reason: a.reason, message: a.message }),
      })),
    };
  },

  /* ── Writing ──────────────────────────────────────────────────────────── */

  async patch({ accountId, id, read, starred, important } = {}) {
    if (!id) throw ApiError.badRequest('Provide the message `id`.');
    const account = requireAccount(accountId);
    const result = await providerFor(account.provider).patchMessage(account, id, { read, starred, important });
    invalidate(account.id);
    bodies.clear(`msg:${account.id}:${id}`);
    return result;
  },

  async move({ accountId, id, mailbox } = {}) {
    if (!id) throw ApiError.badRequest('Provide the message `id`.');
    if (!isMoveTarget(mailbox)) {
      throw ApiError.badRequest(`Mail can be moved to the inbox, archive, spam or trash — not "${mailbox}".`);
    }
    const account = requireAccount(accountId);
    const result = await providerFor(account.provider).moveMessage(account, id, mailbox);
    invalidate(account.id);
    bodies.clear(`msg:${account.id}:${id}`);
    return result;
  },

  /**
   * Send.
   *
   * Reached only from an explicit user action — there is no path from the
   * assistant to here. The AI can fill a composer in; a person presses send.
   */
  async send({ accountId, draft } = {}) {
    const account = requireNamedAccount(accountId, 'this message');
    const clean = validateDraft(draft);
    const result = await providerFor(account.provider).sendMessage(account, clean);
    // If this was a saved draft being sent, it is no longer a draft.
    if (clean.draftId) {
      await providerFor(account.provider)
        .deleteDraft(account, clean.draftId)
        .catch(() => {});
    }
    invalidate(account.id);
    return { sent: true, ...result };
  },

  async saveDraft({ accountId, draft } = {}) {
    const account = requireNamedAccount(accountId, 'this draft');
    const clean = validateDraft(draft, { allowEmpty: true });
    const provider = providerFor(account.provider);
    const result = clean.draftId
      ? await provider.updateDraft(account, clean.draftId, clean)
      : await provider.saveDraft(account, clean);
    invalidate(account.id);
    return result;
  },

  async deleteDraft({ accountId, draftId } = {}) {
    if (!draftId) throw ApiError.badRequest('Provide the `draftId`.');
    const account = requireAccount(accountId);
    const result = await providerFor(account.provider).deleteDraft(account, draftId);
    invalidate(account.id);
    return result;
  },

  /* ── What the assistant is allowed to read ────────────────────────────── */

  /**
   * A bounded piece of email context for the AI.
   *
   * The rule from the brief: never hand the model a mailbox. Each scope has a
   * hard ceiling, bodies arrive as plain text with the quoted history trimmed,
   * and the total is capped — so a thread of forty messages costs the same as a
   * thread of three.
   *
   * @param {'message'|'thread'|'search'|'priority'} scope
   */
  async context({ accountId, messageId, threadId, query, scope = 'message', limit = 5 } = {}) {
    const mine = ownAddresses();

    if (scope === 'message') {
      const full = await mailService.message({ accountId, id: messageId });
      return { scope, message: forModel(full) };
    }

    if (scope === 'thread') {
      const base = threadId
        ? { threadId, accountId }
        : await mailService.message({ accountId, id: messageId }).then((m) => ({ threadId: m.threadId, accountId: m.accountId }));
      if (!base.threadId) {
        const one = await mailService.message({ accountId, id: messageId });
        return { scope: 'message', message: forModel(one) };
      }
      const thread = await mailService.thread({ accountId: base.accountId, threadId: base.threadId });
      // The latest few, which is where anything actionable lives. The oldest
      // message in a long thread is almost never what is being asked about.
      const picked = thread.messages.slice(-3);
      return {
        scope,
        threadId: base.threadId,
        count: thread.messages.length,
        messages: picked.map((m) => forModel(m, { chars: 2500 })),
      };
    }

    if (scope === 'search') {
      if (!query) throw ApiError.badRequest('Searching mail for the assistant needs a `query`.');
      const page = await mailService.list({ accountId, mailbox: 'inbox', q: query, limit: Math.min(10, limit) });
      // Headers and the preview line only. Enough to say what was found and to
      // ask for one of them in full, without shipping ten bodies.
      return { scope, query, count: page.messages.length, messages: page.messages.map(asHeader) };
    }

    if (scope === 'priority') {
      const page = await mailService.list({ accountId, mailbox: 'inbox', unread: true, limit: 40 });
      return {
        scope,
        count: page.messages.length,
        messages: priority(page.messages, mine, Math.min(10, limit)).map(asHeader),
      };
    }

    throw ApiError.badRequest(`Unknown mail context scope "${scope}".`);
  },
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** A message made safe and complete for the reader. */
function dress(raw, { images = false } = {}) {
  const html = raw.body?.html ?? '';
  const text = raw.body?.text ?? '';
  const source = html || textToHtml(text);
  const { html: safe, blockedImages } = sanitizeHtml(source, { blockRemote: !images });
  return {
    ...raw,
    body: {
      html: safe,
      text: text || htmlToText(html),
      // So the reader can offer "show pictures" only when there is something to
      // show, and say how many are being held back.
      blockedImages,
      imagesShown: Boolean(images),
    },
  };
}

/** Headers only — what a listing or a search result hands the model. */
const asHeader = (m) => ({
  id: m.id,
  accountId: m.accountId,
  from: m.from?.name ? `${m.from.name} <${m.from.email}>` : m.from?.email,
  subject: m.subject,
  preview: m.snippet,
  date: m.date,
  unread: m.unread,
  starred: m.starred,
  important: m.important,
  hasAttachments: m.hasAttachments,
  ...(m.triage ? { signals: m.triage.signals, needsAction: m.triage.needsAction } : {}),
});

/**
 * One message as the model should see it: the facts, and a bounded plain-text
 * body with the quoted reply history cut off.
 *
 * Trimming the quote is not just economy. A long thread repeats itself at every
 * level, and a model given all of it will answer about the oldest copy of a
 * question as readily as the newest.
 */
function forModel(m, { chars = 6000 } = {}) {
  const body = trimQuoted(m.body?.text || htmlToText(m.body?.html)).slice(0, chars);
  return {
    id: m.id,
    accountId: m.accountId,
    from: m.from?.name ? `${m.from.name} <${m.from.email}>` : m.from?.email,
    to: (m.to ?? []).map((p) => p.email).join(', '),
    cc: (m.cc ?? []).map((p) => p.email).join(', ') || undefined,
    subject: m.subject,
    date: m.date,
    threadId: m.threadId,
    unread: m.unread,
    attachments: (m.attachments ?? []).filter((a) => !a.inline).map((a) => `${a.name} (${a.mimeType})`),
    body,
    truncated: (m.body?.text || '').length > chars,
  };
}

/** Cut a reply's quoted history: everything from the first "On … wrote:" down. */
export function trimQuoted(text) {
  const lines = String(text || '').split(/\r?\n/);
  const marker = lines.findIndex((line) =>
    /^\s*(?:>|On .{5,80}\b(?:wrote|said):|-{2,}\s*Original Message|_{5,}|From:\s.+@)/.test(line),
  );
  const kept = marker > 0 ? lines.slice(0, marker) : lines;
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A draft, checked before it can be sent. */
function validateDraft(draft, { allowEmpty = false } = {}) {
  if (!draft || typeof draft !== 'object') throw ApiError.badRequest('Provide the message to send.');
  const people = (list) =>
    (Array.isArray(list) ? list : [])
      .map((p) => (typeof p === 'string' ? { email: p.trim(), name: '' } : { email: (p?.email ?? '').trim(), name: p?.name ?? '' }))
      .filter((p) => p.email);

  const to = people(draft.to);
  const cc = people(draft.cc);
  const bcc = people(draft.bcc);

  if (!allowEmpty && !to.length && !cc.length && !bcc.length) {
    throw ApiError.badRequest('A message needs at least one recipient.');
  }
  const bad = [...to, ...cc, ...bcc].find((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
  if (bad) throw ApiError.badRequest(`"${bad.email}" is not an email address.`);

  const size = (draft.attachments ?? []).reduce((sum, f) => sum + Math.ceil((String(f?.data ?? '').length * 3) / 4), 0);
  if (size > config.mail.maxAttachmentBytes) {
    throw ApiError.badRequest('Those attachments are larger than Pulse will send.');
  }

  return {
    to,
    cc,
    bcc,
    subject: String(draft.subject ?? '').slice(0, 500),
    text: typeof draft.text === 'string' ? draft.text : '',
    html: typeof draft.html === 'string' ? draft.html : '',
    attachments: (draft.attachments ?? []).map((f) => ({
      name: String(f?.name ?? 'file').slice(0, 200),
      mimeType: String(f?.mimeType ?? 'application/octet-stream'),
      data: String(f?.data ?? ''),
    })),
    threadId: draft.threadId ?? undefined,
    draftId: draft.draftId ?? undefined,
    inReplyTo: draft.inReplyTo ?? undefined,
    references: draft.references ?? undefined,
    replyToMessageId: draft.replyToMessageId ?? undefined,
    replyAll: Boolean(draft.replyAll),
  };
}

/* A cursor spans several accounts, so it is a map rather than a single token. */
const encodeCursor = (map) => Buffer.from(JSON.stringify(map), 'utf8').toString('base64url');

function parseCursor(token) {
  if (!token) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // A cursor we cannot read means starting again, not failing the request.
    return null;
  }
}
