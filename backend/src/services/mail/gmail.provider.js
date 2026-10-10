import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';
import { CATEGORIES, MAILBOXES } from './mailboxes.js';
import { buildMime, readPayload, toBase64Url } from './mime.js';
import {
  decodeHeader,
  fromBase64Url,
  headerValue,
  isoDate,
  message,
  parseAddress,
  parseAddressList,
  previewOf,
} from './normalize.js';
import { authed, freshToken, pooled } from './oauth.js';
import { saveAccount } from './accounts.js';

/**
 * Gmail, over its REST API.
 *
 * Written against `fetchJson` rather than the `googleapis` package the calendar
 * uses, on purpose: that package is an OPTIONAL dependency here, so the
 * calendar carries a graceful "run npm install googleapis" path for when it is
 * missing. Mail has no reason to inherit that — the REST surface is four
 * endpoints and this way the integration simply works on a bare install.
 *
 * Scope note: `gmail.modify` covers reading, labelling, archiving and moving to
 * bin; `gmail.send` and `gmail.compose` cover sending and drafts. The full
 * `https://mail.google.com/` scope — which would add permanent deletion and raw
 * IMAP — is deliberately not requested.
 */
const INTEGRATION = 'Gmail';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PROVIDER = 'google';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'openid',
  'email',
  'profile',
].join(' ');

/* ── Mailboxes ────────────────────────────────────────────────────────────── */

// Canonical id → the Gmail label that holds it.
const LABEL = {
  inbox: 'INBOX',
  starred: 'STARRED',
  important: 'IMPORTANT',
  sent: 'SENT',
  drafts: 'DRAFT',
  trash: 'TRASH',
  spam: 'SPAM',
};

const CATEGORY_LABEL = {
  primary: 'CATEGORY_PERSONAL',
  social: 'CATEGORY_SOCIAL',
  promotions: 'CATEGORY_PROMOTIONS',
  updates: 'CATEGORY_UPDATES',
};

// Gmail has no Archive label: archived mail is simply mail with no INBOX label
// and nowhere else. It is therefore a search, not a label, and the one mailbox
// whose unread count cannot be read straight off the labels endpoint.
const ARCHIVE_QUERY = '-in:inbox -in:trash -in:spam -in:drafts -in:sent';

const headersWanted = ['From', 'To', 'Cc', 'Bcc', 'Reply-To', 'Subject', 'Date', 'Message-ID', 'References'];

/* ── Requests ─────────────────────────────────────────────────────────────── */

function requireCreds() {
  const { clientId, clientSecret } = config.mail.google;
  if (!clientId || !clientSecret) throw ApiError.notConfigured(INTEGRATION);
}

const exchange = (params) =>
  fetchJson('https://oauth2.googleapis.com/token', {
    integration: INTEGRATION,
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

const refresh = (refreshToken) =>
  exchange({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.mail.google.clientId,
    client_secret: config.mail.google.clientSecret,
  });

async function call(account, path, { method = 'GET', body, params, raw = false } = {}) {
  const token = await freshToken({ provider: PROVIDER, id: account.id, refresh });
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v));
    else url.searchParams.set(key, String(value));
  }
  return fetchJson(url.toString(), {
    integration: INTEGRATION,
    method,
    // A message with a large attachment takes longer than the 10s default.
    timeoutMs: raw ? 30_000 : 15_000,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/* ── Mapping ──────────────────────────────────────────────────────────────── */

/** Gmail's labelIds → the canonical mailboxes and categories a message is in. */
function placesFor(labelIds = []) {
  const set = new Set(labelIds);
  const mailboxes = Object.entries(LABEL)
    .filter(([, label]) => set.has(label))
    .map(([id]) => id);
  // Nowhere else and not a draft: archived.
  if (!mailboxes.some((m) => ['inbox', 'trash', 'spam', 'drafts', 'sent'].includes(m))) mailboxes.push('archive');
  const categories = Object.entries(CATEGORY_LABEL)
    .filter(([, label]) => set.has(label))
    .map(([id]) => id);
  return { mailboxes, categories };
}

/** One Gmail message (metadata or full) → the canonical shape. */
function toMessage(raw, account, { full = false } = {}) {
  const headers = raw.payload?.headers ?? [];
  const labelIds = raw.labelIds ?? [];
  const { mailboxes, categories } = placesFor(labelIds);
  const parsed = full ? readPayload(raw.payload) : null;

  return message({
    id: raw.id,
    accountId: account.id,
    provider: PROVIDER,
    threadId: raw.threadId ?? null,
    from: parseAddress(headerValue(headers, 'From')),
    to: parseAddressList(headerValue(headers, 'To')),
    cc: parseAddressList(headerValue(headers, 'Cc')),
    bcc: parseAddressList(headerValue(headers, 'Bcc')),
    replyTo: parseAddressList(headerValue(headers, 'Reply-To')),
    subject: decodeHeader(headerValue(headers, 'Subject')),
    snippet: previewOf({ snippet: decodeHeader(raw.snippet ?? ''), text: parsed?.text, html: parsed?.html }),
    date: isoDate(raw.internalDate || headerValue(headers, 'Date')),
    unread: labelIds.includes('UNREAD'),
    starred: labelIds.includes('STARRED'),
    important: labelIds.includes('IMPORTANT'),
    draft: labelIds.includes('DRAFT'),
    hasAttachments: full
      ? (parsed.attachments ?? []).some((a) => !a.inline)
      : Boolean(raw.payload?.parts?.some((p) => p.filename)),
    mailboxes,
    categories,
    messageIdHeader: headerValue(headers, 'Message-ID') || null,
    references: headerValue(headers, 'References') || null,
    ...(full
      ? {
          body: { html: parsed.html, text: parsed.text },
          attachments: parsed.attachments,
        }
      : {}),
  });
}

/* ── The provider ─────────────────────────────────────────────────────────── */

export const gmailProvider = {
  id: PROVIDER,
  label: 'Gmail',

  configured: () => Boolean(config.mail.google.clientId && config.mail.google.clientSecret),

  /**
   * What Gmail can answer for. Every standard mailbox, plus the inbox
   * categories, which only Gmail has.
   */
  capabilities: () => ({
    mailboxes: MAILBOXES.map((m) => m.id),
    categories: CATEGORIES.map((c) => c.id),
    search: true,
    threads: true,
    drafts: true,
    send: true,
    star: true,
    important: true,
    spam: true,
    // `gmail.modify` can bin a message but never destroy one.
    permanentDelete: false,
  }),

  getAuthUrl(state) {
    requireCreds();
    const params = new URLSearchParams({
      client_id: config.mail.google.clientId,
      redirect_uri: config.mail.google.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      // A refresh token only ever comes back with both of these.
      access_type: 'offline',
      prompt: 'consent',
      // Deliberately NOT include_granted_scopes: this grant stays mail-only
      // rather than quietly widening to whatever the calendar was given.
      state: state ?? '',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async handleCallback(code) {
    requireCreds();
    if (!code) throw ApiError.badRequest('Missing `code` from the Gmail OAuth callback.');
    const tokens = await exchange({
      grant_type: 'authorization_code',
      code,
      client_id: config.mail.google.clientId,
      client_secret: config.mail.google.clientSecret,
      redirect_uri: config.mail.google.redirectUri,
    });
    if (!tokens.refresh_token) {
      throw ApiError.badRequest(
        'Google did not return a refresh token. Remove Pulse from your Google account permissions and connect again.',
      );
    }

    // Who this is. The address is the account's identity everywhere in the app.
    const who = await fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      integration: INTEGRATION,
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });

    const id = saveAccount({
      provider: PROVIDER,
      email: who.email,
      name: who.name || '',
      scopes: tokens.scope ?? SCOPES,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      },
    });
    return { id, email: who.email, name: who.name || '', provider: PROVIDER };
  },

  async listMailboxes(account) {
    return authed(PROVIDER, account.id, async () => {
      const { labels = [] } = await call(account, '/labels');
      const byName = new Map(labels.map((l) => [l.id, l]));

      // Unread counts come from the label itself — one request for all of them,
      // rather than a count query per mailbox.
      const detailed = await pooled(
        MAILBOXES.filter((m) => m.counts).map((m) => m.id),
        4,
        async (id) => {
          const label = byName.get(LABEL[id]);
          if (!label) return { id, unread: 0, total: 0 };
          const info = await call(account, `/labels/${LABEL[id]}`);
          return { id, unread: Number(info.messagesUnread) || 0, total: Number(info.messagesTotal) || 0 };
        },
      );
      const counts = new Map(detailed.filter((d) => d && !d.error).map((d) => [d.id, d]));

      return MAILBOXES.map((m) => ({
        id: m.id,
        label: m.label,
        unread: counts.get(m.id)?.unread ?? null,
        total: counts.get(m.id)?.total ?? null,
      }));
    });
  },

  async listMessages(account, { mailbox = 'inbox', category, q, pageToken, limit = 25, unread } = {}) {
    return authed(PROVIDER, account.id, async () => {
      const params = { maxResults: Math.min(100, Math.max(1, limit)), pageToken };
      const queries = [];

      if (mailbox === 'archive') queries.push(ARCHIVE_QUERY);
      else if (LABEL[mailbox]) params.labelIds = [LABEL[mailbox]];

      if (category && CATEGORY_LABEL[category]) {
        params.labelIds = [...(params.labelIds ?? []), CATEGORY_LABEL[category]];
      }
      if (unread) queries.push('is:unread');
      if (q) queries.push(q);
      // Gmail excludes spam and bin from a search unless asked; when the user IS
      // looking at one of those, say so explicitly or the search returns nothing.
      if (q && ['spam', 'trash'].includes(mailbox)) queries.push(`in:${mailbox}`);
      if (queries.length) params.q = queries.join(' ');

      const list = await call(account, '/messages', { params });
      const ids = (list.messages ?? []).map((m) => m.id);
      if (!ids.length) return { messages: [], nextPageToken: null, estimate: Number(list.resultSizeEstimate) || 0 };

      // Gmail's list gives ids only, so the headers are a fetch per row —
      // bounded, because a 50-row page all at once trips its rate limit.
      const fetched = await pooled(ids, 8, (id) =>
        call(account, `/messages/${id}`, { params: { format: 'metadata', metadataHeaders: headersWanted } }),
      );

      return {
        messages: fetched.filter((m) => m && !m.error).map((m) => toMessage(m, account)),
        nextPageToken: list.nextPageToken ?? null,
        estimate: Number(list.resultSizeEstimate) || 0,
      };
    });
  },

  async getMessage(account, id) {
    return authed(PROVIDER, account.id, async () => {
      const raw = await call(account, `/messages/${id}`, { params: { format: 'full' } });
      return toMessage(raw, account, { full: true });
    });
  },

  async getThread(account, threadId) {
    return authed(PROVIDER, account.id, async () => {
      const thread = await call(account, `/threads/${threadId}`, { params: { format: 'full' } });
      return { id: threadId, messages: (thread.messages ?? []).map((m) => toMessage(m, account, { full: true })) };
    });
  },

  async getAttachment(account, messageId, attachmentId) {
    return authed(PROVIDER, account.id, async () => {
      const part = await call(account, `/messages/${messageId}/attachments/${attachmentId}`, { raw: true });
      return { data: fromBase64Url(part.data), size: Number(part.size) || 0 };
    });
  },

  /** Read/unread, starred, important — all of them label changes in Gmail. */
  async patchMessage(account, id, { read, starred, important } = {}) {
    return authed(PROVIDER, account.id, async () => {
      const add = [];
      const remove = [];
      if (read === true) remove.push('UNREAD');
      if (read === false) add.push('UNREAD');
      if (starred === true) add.push('STARRED');
      if (starred === false) remove.push('STARRED');
      if (important === true) add.push('IMPORTANT');
      if (important === false) remove.push('IMPORTANT');
      if (!add.length && !remove.length) return { ok: true, unchanged: true };

      const raw = await call(account, `/messages/${id}/modify`, {
        method: 'POST',
        body: { addLabelIds: add, removeLabelIds: remove },
      });
      return { ok: true, mailboxes: placesFor(raw.labelIds).mailboxes };
    });
  },

  /**
   * Move a message. In Gmail every one of these is a label change, including
   * archiving, which is the removal of INBOX and nothing else.
   */
  async moveMessage(account, id, mailbox) {
    return authed(PROVIDER, account.id, async () => {
      if (mailbox === 'trash') {
        await call(account, `/messages/${id}/trash`, { method: 'POST' });
        return { ok: true, mailbox };
      }
      const moves = {
        archive: { addLabelIds: [], removeLabelIds: ['INBOX'] },
        inbox: { addLabelIds: ['INBOX'], removeLabelIds: ['SPAM', 'TRASH'] },
        spam: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
      };
      const change = moves[mailbox];
      if (!change) throw ApiError.badRequest(`Cannot move mail to "${mailbox}".`);
      await call(account, `/messages/${id}/modify`, { method: 'POST', body: change });
      return { ok: true, mailbox };
    });
  },

  async sendMessage(account, draft) {
    return authed(PROVIDER, account.id, async () => {
      const raw = buildMime({ ...draft, from: draft.from ?? { email: account.account?.email } });
      const body = { raw: toBase64Url(raw) };
      // Replying: Gmail files it in the same conversation only if told the thread.
      if (draft.threadId) body.threadId = draft.threadId;
      const sent = await call(account, '/messages/send', { method: 'POST', body, raw: true });
      return { id: sent.id, threadId: sent.threadId ?? null };
    });
  },

  async saveDraft(account, draft) {
    return authed(PROVIDER, account.id, async () => {
      const raw = buildMime({ ...draft, from: draft.from ?? { email: account.account?.email } });
      const body = { message: { raw: toBase64Url(raw), ...(draft.threadId ? { threadId: draft.threadId } : {}) } };
      const saved = await call(account, '/drafts', { method: 'POST', body, raw: true });
      return { id: saved.id, messageId: saved.message?.id ?? null };
    });
  },

  async updateDraft(account, draftId, draft) {
    return authed(PROVIDER, account.id, async () => {
      const raw = buildMime({ ...draft, from: draft.from ?? { email: account.account?.email } });
      const body = { message: { raw: toBase64Url(raw), ...(draft.threadId ? { threadId: draft.threadId } : {}) } };
      const saved = await call(account, `/drafts/${draftId}`, { method: 'PUT', body, raw: true });
      return { id: saved.id, messageId: saved.message?.id ?? null };
    });
  },

  async deleteDraft(account, draftId) {
    return authed(PROVIDER, account.id, async () => {
      await call(account, `/drafts/${draftId}`, { method: 'DELETE' });
      return { ok: true };
    });
  },

  /**
   * Drafts, listed with both ids.
   *
   * A draft has a draft id and a message id, and they are not the same: the
   * message id is what you read it with, the draft id is what you update or
   * send it with. Listing by the DRAFT label alone gives only the message id,
   * and then saving an edit creates a second draft instead of changing the one
   * on screen.
   */
  async listDrafts(account, { limit = 25, pageToken } = {}) {
    return authed(PROVIDER, account.id, async () => {
      const list = await call(account, '/drafts', { params: { maxResults: Math.min(100, limit), pageToken } });
      const drafts = list.drafts ?? [];
      if (!drafts.length) return { messages: [], nextPageToken: null };

      const fetched = await pooled(drafts, 8, async (d) => {
        const raw = await call(account, `/messages/${d.message.id}`, {
          params: { format: 'metadata', metadataHeaders: headersWanted },
        });
        return { ...toMessage(raw, account), draftId: d.id, draft: true };
      });
      return {
        messages: fetched.filter((m) => m && !m.error),
        nextPageToken: list.nextPageToken ?? null,
      };
    });
  },
};
