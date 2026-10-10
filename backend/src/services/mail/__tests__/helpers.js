/**
 * A stand-in for Gmail and Microsoft Graph.
 *
 * The mail providers can only be exercised against a live mailbox, which a test
 * cannot have — so the thing under test here is what they SEND: the URL, the
 * method and the body for every operation. That is where provider integrations
 * actually go wrong (a label added instead of removed, a reply sent as a new
 * message), and it is checkable without an account.
 */

/** Records every request and answers from a routing table. */
export function mockFetch(routes) {
  const calls = [];
  const handler = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string' && init.headers?.['content-type'] === 'application/json') {
      try {
        body = JSON.parse(body);
      } catch {
        /* leave as text */
      }
    }
    calls.push({ url, method, body, headers: init.headers ?? {} });

    const route = routes.find((r) => r.match(url, method, body));
    if (!route) {
      return new Response(JSON.stringify({ error: { message: `no mock for ${method} ${url}` } }), {
        status: 501,
        headers: { 'content-type': 'application/json' },
      });
    }
    const reply = typeof route.reply === 'function' ? route.reply({ url, method, body }) : route.reply;
    return new Response(JSON.stringify(reply ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  handler.calls = calls;
  /** Requests whose URL contains `fragment`. */
  handler.to = (fragment) => calls.filter((c) => c.url.includes(fragment));
  handler.reset = () => {
    calls.length = 0;
  };
  return handler;
}

/** Install a mock for the duration of one test. */
export function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = original;
  });
}

/** A Gmail message as its API returns it, with headers and a MIME tree. */
export function gmailMessage({
  id = 'm1',
  threadId = 't1',
  labelIds = ['INBOX', 'UNREAD'],
  from = 'Jane Doe <jane@example.com>',
  to = 'eeliya@example.com',
  cc,
  subject = 'Hello',
  date = '1767225600000',
  snippet = 'A preview line',
  text = 'Body text',
  html,
  attachments = [],
} = {}) {
  const headers = [
    { name: 'From', value: from },
    { name: 'To', value: to },
    ...(cc ? [{ name: 'Cc', value: cc }] : []),
    { name: 'Subject', value: subject },
    { name: 'Message-ID', value: `<${id}@mail>` },
  ];
  const textPart = { mimeType: 'text/plain', body: { data: Buffer.from(text).toString('base64url'), size: text.length } };
  const htmlPart = html
    ? { mimeType: 'text/html', body: { data: Buffer.from(html).toString('base64url'), size: html.length } }
    : null;
  const bodyParts = htmlPart ? [{ mimeType: 'multipart/alternative', parts: [textPart, htmlPart] }] : [textPart];
  const fileParts = attachments.map((a, i) => ({
    mimeType: a.mimeType ?? 'application/pdf',
    filename: a.name ?? `file${i}.pdf`,
    body: { attachmentId: a.id ?? `att${i}`, size: a.size ?? 100 },
    headers: [{ name: 'Content-Disposition', value: `attachment; filename="${a.name ?? `file${i}.pdf`}"` }],
  }));

  return {
    id,
    threadId,
    labelIds,
    snippet,
    internalDate: date,
    payload: fileParts.length
      ? { mimeType: 'multipart/mixed', headers, parts: [...bodyParts, ...fileParts] }
      : { ...bodyParts[0], headers },
  };
}

/** A Graph message as its API returns it. */
export function graphMessage({
  id = 'g1',
  conversationId = 'c1',
  subject = 'Hello',
  from = { name: 'Jane Doe', address: 'jane@example.com' },
  to = [{ name: 'Eeliya', address: 'eeliya@example.com' }],
  received = '2026-10-07T09:00:00Z',
  isRead = false,
  isDraft = false,
  flagged = false,
  importance = 'normal',
  hasAttachments = false,
  parentFolderId = 'FOLDER_INBOX',
  bodyPreview = 'A preview line',
  body,
} = {}) {
  return {
    id,
    conversationId,
    subject,
    bodyPreview,
    from: { emailAddress: from },
    toRecipients: to.map((address) => ({ emailAddress: address })),
    ccRecipients: [],
    bccRecipients: [],
    replyTo: [],
    receivedDateTime: received,
    isRead,
    isDraft,
    hasAttachments,
    flag: { flagStatus: flagged ? 'flagged' : 'notFlagged' },
    importance,
    internetMessageId: `<${id}@mail>`,
    parentFolderId,
    webLink: `https://outlook.office.com/mail/${id}`,
    ...(body ? { body } : {}),
  };
}

/**
 * Graph's well-known folders, as the provider now asks for them: one at a time,
 * by name in the path.
 *
 * It used to list `/me/mailFolders` and read `wellKnownName` off each entry,
 * which personal Microsoft accounts reject outright — so the mock serves the
 * per-folder shape, which is the shape the real thing answers on both kinds of
 * account. `GRAPH_FOLDER_ROUTE` below is what every test should use.
 */
export const GRAPH_FOLDERS = {
  value: [
    { id: 'FOLDER_INBOX', displayName: 'Inbox', wellKnownName: 'inbox', unreadItemCount: 7, totalItemCount: 120 },
    { id: 'FOLDER_SENT', displayName: 'Sent Items', wellKnownName: 'sentitems', unreadItemCount: 0, totalItemCount: 40 },
    { id: 'FOLDER_DRAFTS', displayName: 'Drafts', wellKnownName: 'drafts', unreadItemCount: 2, totalItemCount: 2 },
    { id: 'FOLDER_ARCHIVE', displayName: 'Archive', wellKnownName: 'archive', unreadItemCount: 0, totalItemCount: 900 },
    { id: 'FOLDER_TRASH', displayName: 'Deleted Items', wellKnownName: 'deleteditems', unreadItemCount: 1, totalItemCount: 12 },
    { id: 'FOLDER_SPAM', displayName: 'Junk Email', wellKnownName: 'junkemail', unreadItemCount: 30, totalItemCount: 30 },
  ],
};

/** One folder, looked up the way the provider looks it up. */
export const GRAPH_FOLDER_ROUTE = {
  match: (url) => /\/me\/mailFolders\/[a-z]+(\?|$)/i.test(url) && !url.includes('/messages'),
  reply: ({ url }) => {
    const name = decodeURIComponent(url).match(/\/me\/mailFolders\/([a-z]+)/i)?.[1]?.toLowerCase();
    const folder = GRAPH_FOLDERS.value.find((f) => f.wellKnownName === name);
    if (!folder) return { error: { code: 'ErrorFolderNotFound', message: 'folder not found' } };
    // The real call selects only these; `wellKnownName` is deliberately absent,
    // because asking for it is what broke personal accounts.
    const { id, displayName, unreadItemCount, totalItemCount } = folder;
    return { id, displayName, unreadItemCount, totalItemCount };
  },
};
