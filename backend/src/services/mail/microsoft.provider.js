import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';
import { MAILBOXES } from './mailboxes.js';
import { addressFrom, decodeHeader, htmlToText, isoDate, message, previewOf } from './normalize.js';
import { authed, freshToken, pooled } from './oauth.js';
import { saveAccount } from './accounts.js';

/**
 * Outlook.com and Microsoft 365, over Microsoft Graph.
 *
 * Graph differs from Gmail in three ways that shape this file:
 *
 *  - Mail lives in FOLDERS, not labels, so a message is in exactly one place
 *    and "archive" is a real folder rather than the absence of one.
 *  - Starred and Important are not folders at all — they are a flag and a
 *    priority — so those two mailboxes are filters over everything.
 *  - A message is JSON, not RFC 2822, so nothing here builds MIME. Replies go
 *    through Graph's own `createReply`, which is the only way to get the
 *    threading headers right without hand-writing them.
 *
 * Scopes: Mail.ReadWrite covers reading, flagging, moving to Archive and to
 * Deleted Items; Mail.Send covers sending. There is no permanent-delete call
 * here, so binned mail stays recoverable.
 */
const INTEGRATION = 'Outlook';
const API = 'https://graph.microsoft.com/v1.0';
const PROVIDER = 'microsoft';

const SCOPES = ['offline_access', 'openid', 'profile', 'email', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'].join(' ');

/** Canonical id → Graph's well-known folder name. */
const FOLDER = {
  inbox: 'inbox',
  sent: 'sentitems',
  drafts: 'drafts',
  archive: 'archive',
  trash: 'deleteditems',
  spam: 'junkemail',
};

/** The two that are a property of the message rather than a place it lives. */
const FILTERED = {
  starred: "flag/flagStatus eq 'flagged'",
  important: "importance eq 'high'",
};

/**
 * The attachment fields a message is opened with.
 *
 * `contentId` carries the full type name in front of it, and that is not
 * decoration. Graph types the `attachments` collection as the BASE
 * `microsoft.graph.attachment`, which has only the fields every kind of
 * attachment shares — id, name, contentType, size, isInline. `contentId`
 * belongs to the derived `microsoft.graph.fileAttachment`, so naming it plainly
 * is asking for a property the collection's declared type does not have, and
 * Graph rejects the whole request:
 *
 *   400 Parsing OData Select and Expand failed: Could not find a property
 *       named 'contentId' on type 'microsoft.graph.attachment'.
 *
 * Which meant no Outlook message would open at all. The cast says "this field,
 * on the attachments that are files", and the ones that are not — an item or a
 * link attachment — simply come back without it.
 *
 * Dropping the `$select` altogether would also have worked, and would have
 * pulled every attachment's `contentBytes` down with the message: a mail with
 * a 10MB file on it becomes a 13MB base64 response, on every open.
 */
const ATTACHMENT_SELECT = [
  'id',
  'name',
  'contentType',
  'size',
  'isInline',
  'microsoft.graph.fileAttachment/contentId',
].join(',');

const SELECT = [
  'id',
  'conversationId',
  'subject',
  'bodyPreview',
  'from',
  'sender',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'replyTo',
  'receivedDateTime',
  'sentDateTime',
  'isRead',
  'isDraft',
  'hasAttachments',
  'flag',
  'importance',
  'internetMessageId',
  'parentFolderId',
  'webLink',
].join(',');

function requireCreds() {
  const { clientId, clientSecret } = config.mail.microsoft;
  if (!clientId || !clientSecret) throw ApiError.notConfigured(INTEGRATION);
}

const tokenUrl = () => `https://login.microsoftonline.com/${config.mail.microsoft.tenant}/oauth2/v2.0/token`;

const exchange = (params) =>
  fetchJson(tokenUrl(), {
    integration: INTEGRATION,
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

const refresh = (refreshToken) =>
  exchange({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.mail.microsoft.clientId,
    client_secret: config.mail.microsoft.clientSecret,
    scope: SCOPES,
  });

/**
 * One Graph request. `path` may also be a full `@odata.nextLink`, which is how
 * Graph pages — it hands back a complete URL rather than a cursor.
 */
async function call(account, path, { method = 'GET', body, params, timeoutMs = 15_000 } = {}) {
  const token = await freshToken({ provider: PROVIDER, id: account.id, refresh });

  /*
   * The query string is built by hand rather than with URLSearchParams.
   *
   * URLSearchParams encodes a space as `+`, which is correct for a form body
   * and ambiguous in an OData query option: `$filter=isRead+eq+false` relies on
   * the server reading `+` as a space, and OData says these values are
   * percent-encoded. encodeURIComponent gives `%20`, which every OData parser
   * reads the same way. An `@odata.nextLink` is already a complete, encoded URL
   * and is used exactly as Graph gave it.
   */
  const base = path.startsWith('http') ? path : `${API}${path}`;
  const query = Object.entries(params ?? {})
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  const url = query ? `${base}${base.includes('?') ? '&' : '?'}${query}` : base;

  return fetchJson(url, {
    integration: INTEGRATION,
    method,
    timeoutMs,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ── Folder identity ─────────────────────────────────────────────────────── */

/**
 * Graph tells you a message's `parentFolderId` — an opaque string — and nothing
 * else about where it is. To say "this is in your inbox" the ids have to be
 * resolved to well-known names once and remembered, or every message in a page
 * would cost a folder lookup.
 */
const folderCache = new Map(); // accountId → { at, byId, byName }
const FOLDER_TTL = 10 * 60_000;

/** A folder Graph says is not there, as against one it would not give us. */
const isMissing = (error) => /\b404\b|ErrorFolderNotFound|ErrorItemNotFound/i.test(error?.message ?? '');

/**
 * The well-known folders, each asked for by name.
 *
 * This used to be one listing of `/me/mailFolders` with `wellKnownName` in the
 * `$select`, which is the obvious way to do it and works on a work or school
 * account. On a PERSONAL Microsoft account — an @outlook.com or @hotmail.com —
 * Graph does not carry that property and rejects the whole request:
 *
 *   400 Parsing OData Select and Expand failed: Could not find a property
 *       named 'wellKnownName' on type 'microsoft.graph.mailFolder'.
 *
 * One 400 on the folder index took out everything downstream, because every
 * listing resolves its `parentFolderId` through here — so a correctly
 * connected Outlook account showed an empty inbox and no mailbox counts.
 *
 * Asking for each folder by its well-known name in the PATH needs no `$select`
 * of a property that may not exist, and that form is supported on both kinds
 * of account. It is six small requests rather than one, cached for ten minutes
 * and run in parallel, which is a fair price for working on the account type
 * most people signing in with Outlook actually have.
 */
async function folders(account) {
  const hit = folderCache.get(account.id);
  if (hit && Date.now() - hit.at < FOLDER_TTL) return hit;

  const wanted = Object.entries(FOLDER);
  const results = await pooled(wanted, 6, async ([canonical, wellKnown]) => {
    try {
      const folder = await call(account, `/me/mailFolders/${wellKnown}`, {
        params: { $select: 'id,displayName,unreadItemCount,totalItemCount' },
      });
      return { canonical, wellKnown, folder };
    } catch (error) {
      // Archive is absent on some mailboxes, and that is not a failure. Any
      // other error is — a 401 especially, which has to reach `authed` so the
      // account is marked as needing to be signed in again rather than
      // quietly reported as having no folders.
      if (isMissing(error)) return null;
      throw error;
    }
  });

  const failed = results.find((r) => r?.error);
  if (failed) throw failed.error;

  const byId = new Map();
  const byName = new Map();
  for (const found of results) {
    if (!found?.folder?.id) continue;
    const entry = {
      id: found.folder.id,
      name: found.folder.displayName,
      wellKnownName: found.wellKnown,
      canonical: found.canonical,
      unread: Number(found.folder.unreadItemCount) || 0,
      total: Number(found.folder.totalItemCount) || 0,
    };
    byId.set(entry.id, entry);
    byName.set(found.wellKnown, entry);
  }
  const next = { at: Date.now(), byId, byName };
  folderCache.set(account.id, next);
  return next;
}

/* ── Mapping ─────────────────────────────────────────────────────────────── */

function toMessage(raw, account, folderIndex, { full = false } = {}) {
  const folder = folderIndex?.byId?.get(raw.parentFolderId);
  const mailboxes = folder?.canonical ? [folder.canonical] : [];
  // Starred and Important are properties, so they ADD to wherever the message
  // actually lives rather than replacing it.
  const starred = raw.flag?.flagStatus === 'flagged';
  const important = raw.importance === 'high';
  if (starred) mailboxes.push('starred');
  if (important) mailboxes.push('important');

  const html = full ? raw.body?.contentType?.toLowerCase() === 'html' ? raw.body.content ?? '' : '' : '';
  const text = full
    ? raw.body?.contentType?.toLowerCase() === 'text'
      ? raw.body.content ?? ''
      : htmlToText(raw.body?.content ?? '')
    : '';

  return message({
    id: raw.id,
    accountId: account.id,
    provider: PROVIDER,
    threadId: raw.conversationId ?? null,
    from: addressFrom(raw.from ?? raw.sender),
    to: (raw.toRecipients ?? []).map(addressFrom),
    cc: (raw.ccRecipients ?? []).map(addressFrom),
    bcc: (raw.bccRecipients ?? []).map(addressFrom),
    replyTo: (raw.replyTo ?? []).map(addressFrom),
    subject: decodeHeader(raw.subject ?? ''),
    snippet: previewOf({ snippet: raw.bodyPreview ?? '', text, html }),
    date: isoDate(raw.receivedDateTime || raw.sentDateTime),
    unread: raw.isRead === false,
    starred,
    important,
    draft: Boolean(raw.isDraft),
    hasAttachments: Boolean(raw.hasAttachments),
    mailboxes,
    categories: [], // Graph has no equivalent of Gmail's inbox categories
    messageIdHeader: raw.internetMessageId ?? null,
    webUrl: raw.webLink ?? null,
    ...(full
      ? {
          body: { html, text },
          attachments: (raw.attachments ?? []).map((a) => ({
            id: a.id,
            name: a.name ?? 'attachment',
            mimeType: a.contentType ?? 'application/octet-stream',
            size: Number(a.size) || 0,
            inline: Boolean(a.isInline),
            contentId: a.contentId ?? null,
          })),
        }
      : {}),
  });
}

/* ── The provider ────────────────────────────────────────────────────────── */

export const microsoftProvider = {
  id: PROVIDER,
  label: 'Outlook',

  configured: () => Boolean(config.mail.microsoft.clientId && config.mail.microsoft.clientSecret),

  capabilities: () => ({
    mailboxes: MAILBOXES.map((m) => m.id),
    // Graph has nothing equivalent to Gmail's Primary/Social/Promotions split,
    // so it says so and the sidebar leaves the section out entirely rather than
    // offering four mailboxes that would always be empty.
    categories: [],
    search: true,
    threads: true,
    drafts: true,
    send: true,
    star: true,
    important: true,
    spam: true,
    permanentDelete: false,
  }),

  getAuthUrl(state) {
    requireCreds();
    const params = new URLSearchParams({
      client_id: config.mail.microsoft.clientId,
      redirect_uri: config.mail.microsoft.redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: SCOPES,
      state: state ?? '',
    });
    return `https://login.microsoftonline.com/${config.mail.microsoft.tenant}/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async handleCallback(code) {
    requireCreds();
    if (!code) throw ApiError.badRequest('Missing `code` from the Outlook OAuth callback.');
    const tokens = await exchange({
      grant_type: 'authorization_code',
      code,
      client_id: config.mail.microsoft.clientId,
      client_secret: config.mail.microsoft.clientSecret,
      redirect_uri: config.mail.microsoft.redirectUri,
      scope: SCOPES,
    });

    const who = await fetchJson(`${API}/me`, {
      integration: INTEGRATION,
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    // A work account often has no `mail`, only a principal name.
    const email = who.mail || who.userPrincipalName;
    if (!email) throw ApiError.upstream(INTEGRATION, 'the account has no email address');

    const id = saveAccount({
      provider: PROVIDER,
      email,
      name: who.displayName || '',
      scopes: tokens.scope ?? SCOPES,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      },
    });
    return { id, email, name: who.displayName || '', provider: PROVIDER };
  },

  async listMailboxes(account) {
    return authed(PROVIDER, account.id, async () => {
      const index = await folders(account);
      return MAILBOXES.map((m) => {
        const folder = FOLDER[m.id] ? index.byName.get(FOLDER[m.id]) : null;
        return {
          id: m.id,
          label: m.label,
          // Starred and Important have no folder and so no count of their own;
          // null means "not counted", which the sidebar renders as no badge
          // rather than as a zero.
          unread: folder ? folder.unread : null,
          total: folder ? folder.total : null,
        };
      });
    });
  },

  async listMessages(account, { mailbox = 'inbox', q, pageToken, limit = 25, unread } = {}) {
    return authed(PROVIDER, account.id, async () => {
      const index = await folders(account);
      const top = Math.min(100, Math.max(1, limit));

      // Paging: Graph hands back a whole URL, so a continuation is simply that
      // URL fetched again — none of the parameters below are re-applied.
      if (pageToken?.startsWith('http')) {
        const page = await call(account, pageToken);
        return {
          messages: (page.value ?? []).map((m) => toMessage(m, account, index)),
          nextPageToken: page['@odata.nextLink'] ?? null,
        };
      }

      const filters = [];
      if (unread) filters.push('isRead eq false');
      if (FILTERED[mailbox]) filters.push(FILTERED[mailbox]);

      const params = { $select: SELECT, $top: top };
      // `$search` cannot be combined with `$filter` or `$orderby` on messages —
      // Graph answers 400 if you try, which is why searching does not also
      // narrow by unread here.
      if (q) {
        params.$search = `"${String(q).replace(/"/g, '')}"`;
      } else {
        if (filters.length) params.$filter = filters.join(' and ');
        params.$orderby = 'receivedDateTime desc';
      }

      // A real folder is scoped by path; a flag or a priority is a filter over
      // everything, because those messages are scattered across folders.
      const scope = FOLDER[mailbox] ? `/me/mailFolders/${FOLDER[mailbox]}/messages` : '/me/messages';
      const page = await call(account, scope, { params });

      return {
        messages: (page.value ?? []).map((m) => toMessage(m, account, index)),
        nextPageToken: page['@odata.nextLink'] ?? null,
      };
    });
  },

  async getMessage(account, id) {
    return authed(PROVIDER, account.id, async () => {
      const index = await folders(account);
      const raw = await call(account, `/me/messages/${id}`, {
        params: { $select: `${SELECT},body`, $expand: `attachments($select=${ATTACHMENT_SELECT})` },
      });
      return toMessage(raw, account, index, { full: true });
    });
  },

  async getThread(account, threadId) {
    return authed(PROVIDER, account.id, async () => {
      const index = await folders(account);
      /*
       * Filtered, but deliberately not sorted.
       *
       * Asking Graph for `$filter=conversationId eq …` AND
       * `$orderby=receivedDateTime` together is refused by the mailbox store:
       *
       *   400 The restriction or sort order is too complex for this operation.
       *
       * Exchange will sort, or it will filter on an unindexed property, and it
       * will not do both in one pass. A conversation is a couple of dozen
       * messages at most and they are already in hand, so the ordering is done
       * here instead — which costs nothing and cannot be refused.
       */
      const page = await call(account, '/me/messages', {
        params: {
          $filter: `conversationId eq '${String(threadId).replace(/'/g, "''")}'`,
          $select: `${SELECT},body`,
          $top: 25,
        },
      });
      const messages = (page.value ?? [])
        .map((m) => toMessage(m, account, index, { full: true }))
        .sort((a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0));
      return { id: threadId, messages };
    });
  },

  async getAttachment(account, messageId, attachmentId) {
    return authed(PROVIDER, account.id, async () => {
      const part = await call(account, `/me/messages/${messageId}/attachments/${attachmentId}`, { timeoutMs: 30_000 });
      if (!part.contentBytes) {
        throw ApiError.upstream(INTEGRATION, 'that attachment is a reference, not a file Pulse can fetch');
      }
      return { data: Buffer.from(part.contentBytes, 'base64'), size: Number(part.size) || 0 };
    });
  },

  async patchMessage(account, id, { read, starred, important } = {}) {
    return authed(PROVIDER, account.id, async () => {
      const body = {};
      if (read != null) body.isRead = Boolean(read);
      if (starred != null) body.flag = { flagStatus: starred ? 'flagged' : 'notFlagged' };
      if (important != null) body.importance = important ? 'high' : 'normal';
      if (!Object.keys(body).length) return { ok: true, unchanged: true };
      await call(account, `/me/messages/${id}`, { method: 'PATCH', body });
      return { ok: true };
    });
  },

  async moveMessage(account, id, mailbox) {
    return authed(PROVIDER, account.id, async () => {
      const destination = FOLDER[mailbox];
      if (!destination) throw ApiError.badRequest(`Cannot move mail to "${mailbox}".`);
      await call(account, `/me/messages/${id}/move`, { method: 'POST', body: { destinationId: destination } });
      // The message is somewhere new, so the cached folder counts are wrong.
      folderCache.delete(account.id);
      return { ok: true, mailbox };
    });
  },

  /** Graph's own message shape, built from a Pulse draft. */
  graphMessage(draft) {
    const people = (list = []) =>
      list.filter((p) => p?.email).map((p) => ({ emailAddress: { address: p.email, name: p.name || undefined } }));
    return {
      subject: draft.subject ?? '',
      body: { contentType: draft.html ? 'HTML' : 'Text', content: draft.html || draft.text || '' },
      toRecipients: people(draft.to),
      ccRecipients: people(draft.cc),
      bccRecipients: people(draft.bcc),
      ...(draft.attachments?.length
        ? {
            attachments: draft.attachments.map((file) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: file.name || 'file',
              contentType: file.mimeType || 'application/octet-stream',
              contentBytes: file.data,
            })),
          }
        : {}),
    };
  },

  async sendMessage(account, draft) {
    return authed(PROVIDER, account.id, async () => {
      /*
       * A reply goes through createReply rather than sendMail.
       *
       * Graph will not let a client set In-Reply-To or References — custom
       * headers must be `x-` prefixed — so a reply sent as a fresh message
       * threads correctly in Outlook and starts a brand-new conversation in
       * every other mail client the recipient might use. createReply builds the
       * draft with those headers already in place; we then put our own text in
       * it and send that.
       */
      if (draft.replyToMessageId) {
        const reply = await call(account, `/me/messages/${draft.replyToMessageId}/${draft.replyAll ? 'createReplyAll' : 'createReply'}`, {
          method: 'POST',
          body: {},
        });
        const patch = microsoftProvider.graphMessage(draft);
        // The recipients createReply worked out are correct; overriding them
        // with an empty list would send the reply to nobody.
        if (!draft.to?.length) delete patch.toRecipients;
        if (!draft.cc?.length) delete patch.ccRecipients;
        if (!draft.bcc?.length) delete patch.bccRecipients;
        await call(account, `/me/messages/${reply.id}`, { method: 'PATCH', body: patch });
        await call(account, `/me/messages/${reply.id}/send`, { method: 'POST', timeoutMs: 30_000 });
        return { id: reply.id, threadId: reply.conversationId ?? draft.threadId ?? null };
      }

      await call(account, '/me/sendMail', {
        method: 'POST',
        timeoutMs: 30_000,
        body: { message: microsoftProvider.graphMessage(draft), saveToSentItems: true },
      });
      // sendMail returns 202 with no body: there is no id to hand back.
      return { id: null, threadId: draft.threadId ?? null };
    });
  },

  async saveDraft(account, draft) {
    return authed(PROVIDER, account.id, async () => {
      const saved = await call(account, '/me/messages', {
        method: 'POST',
        timeoutMs: 30_000,
        body: microsoftProvider.graphMessage(draft),
      });
      folderCache.delete(account.id);
      // On Graph a draft IS a message, so the two ids are the same thing.
      return { id: saved.id, messageId: saved.id };
    });
  },

  async updateDraft(account, draftId, draft) {
    return authed(PROVIDER, account.id, async () => {
      const saved = await call(account, `/me/messages/${draftId}`, {
        method: 'PATCH',
        timeoutMs: 30_000,
        body: microsoftProvider.graphMessage(draft),
      });
      return { id: saved.id ?? draftId, messageId: saved.id ?? draftId };
    });
  },

  async deleteDraft(account, draftId) {
    return authed(PROVIDER, account.id, async () => {
      await call(account, `/me/messages/${draftId}`, { method: 'DELETE' });
      folderCache.delete(account.id);
      return { ok: true };
    });
  },

  /** Drafts are just the messages in the Drafts folder. */
  async listDrafts(account, { limit = 25, pageToken } = {}) {
    const page = await microsoftProvider.listMessages(account, { mailbox: 'drafts', limit, pageToken });
    return { ...page, messages: page.messages.map((m) => ({ ...m, draftId: m.id, draft: true })) };
  },

  /** Sending a draft that already exists, rather than a fresh message. */
  async sendDraft(account, draftId) {
    return authed(PROVIDER, account.id, async () => {
      await call(account, `/me/messages/${draftId}/send`, { method: 'POST', timeoutMs: 30_000 });
      folderCache.delete(account.id);
      return { id: draftId };
    });
  },
};
