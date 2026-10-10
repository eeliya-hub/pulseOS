import { mailService } from '../services/mail/mail.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * HTTP glue for mail. Thin, like every other controller here: read the request,
 * call the service, send what it returns.
 */

/**
 * The page an OAuth callback lands on — tells the app it worked and closes
 * itself, exactly as the calendar and Spotify callbacks do, so the three
 * connection flows behave identically.
 */
const connectedPage = (title, detail) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;background:#0a0d1c;color:#eef0fa;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
  <p style="font-size:20px;font-weight:300">${title}</p>
  <p style="opacity:.6;font-size:13px">${detail}</p>
</div>
<script>
  try { window.opener && window.opener.postMessage('pulse:mail-connected', '*'); } catch (e) {}
  setTimeout(() => window.close(), 1200);
</script></body>`;

const html = (res, body) => res.set('Content-Type', 'text/html').send(body);

export const mailController = {
  // GET /api/mail/status
  status: asyncHandler(async (_req, res) => {
    res.json(mailService.status());
  }),

  // GET /api/mail/:provider/auth → { url }
  auth: asyncHandler(async (req, res) => {
    res.json(mailService.authUrl(req.params.provider));
  }),

  // GET /api/mail/:provider/callback?code=…
  callback: asyncHandler(async (req, res) => {
    // The provider reports a refusal in the query string, not as a failure —
    // showing the real reason beats a blank window that just closes itself.
    if (req.query.error) {
      return html(
        res,
        connectedPage(
          'That didn’t connect',
          String(req.query.error_description ?? req.query.error).slice(0, 300),
        ),
      );
    }
    const account = await mailService.connect(req.params.provider, req.query.code);
    return html(res, connectedPage(`${account.email} connected`, 'You can close this window.'));
  }),

  // POST /api/mail/accounts/:id/disconnect
  disconnect: asyncHandler(async (req, res) => {
    res.json(mailService.disconnect(req.params.id));
  }),

  // GET /api/mail/summary?accountId=
  summary: asyncHandler(async (req, res) => {
    res.json(await mailService.summary({ accountId: req.query.accountId }));
  }),

  // GET /api/mail/mailboxes?accountId=
  mailboxes: asyncHandler(async (req, res) => {
    res.json(await mailService.mailboxes(req.query.accountId));
  }),

  // GET /api/mail/messages?accountId=&mailbox=&category=&q=&pageToken=&limit=&unread=
  list: asyncHandler(async (req, res) => {
    res.json(
      await mailService.list({
        accountId: req.query.accountId,
        mailbox: req.query.mailbox || 'inbox',
        category: req.query.category,
        q: req.query.q,
        pageToken: req.query.pageToken,
        limit: Number(req.query.limit) || 25,
        unread: req.query.unread === '1' || req.query.unread === 'true',
      }),
    );
  }),

  // GET /api/mail/messages/:id?accountId=&images=1
  message: asyncHandler(async (req, res) => {
    res.json(
      await mailService.message({
        accountId: req.query.accountId,
        id: req.params.id,
        images: req.query.images === '1' || req.query.images === 'true',
      }),
    );
  }),

  // GET /api/mail/threads/:threadId?accountId=&images=1
  thread: asyncHandler(async (req, res) => {
    res.json(
      await mailService.thread({
        accountId: req.query.accountId,
        threadId: req.params.threadId,
        images: req.query.images === '1' || req.query.images === 'true',
      }),
    );
  }),

  /*
   * GET /api/mail/messages/:id/attachments/:attachmentId?accountId=
   *
   * Sent as bytes with its own content type, and always as a download:
   * `Content-Disposition: attachment` means a stray HTML or SVG attachment is
   * saved rather than rendered in the app's own origin, where it would be able
   * to read everything the app can.
   */
  attachment: asyncHandler(async (req, res) => {
    const file = await mailService.attachment({
      accountId: req.query.accountId,
      messageId: req.params.id,
      attachmentId: req.params.attachmentId,
    });
    res.set('Content-Type', file.mimeType);
    res.set('Content-Length', String(file.data.length));
    res.set('Content-Disposition', `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=300');
    res.send(file.data);
  }),

  // PATCH /api/mail/messages/:id  { accountId, read?, starred?, important? }
  patch: asyncHandler(async (req, res) => {
    const { accountId, read, starred, important } = req.body ?? {};
    res.json(await mailService.patch({ accountId, id: req.params.id, read, starred, important }));
  }),

  // POST /api/mail/messages/:id/move  { accountId, mailbox }
  move: asyncHandler(async (req, res) => {
    const { accountId, mailbox } = req.body ?? {};
    res.json(await mailService.move({ accountId, id: req.params.id, mailbox }));
  }),

  // POST /api/mail/send  { accountId, draft }
  send: asyncHandler(async (req, res) => {
    const { accountId, ...draft } = req.body ?? {};
    res.json(await mailService.send({ accountId, draft: draft.draft ?? draft }));
  }),

  // POST /api/mail/drafts  { accountId, draft }
  saveDraft: asyncHandler(async (req, res) => {
    const { accountId, ...draft } = req.body ?? {};
    res.status(201).json(await mailService.saveDraft({ accountId, draft: draft.draft ?? draft }));
  }),

  // DELETE /api/mail/drafts/:draftId  { accountId }
  deleteDraft: asyncHandler(async (req, res) => {
    res.json(await mailService.deleteDraft({ accountId: req.body?.accountId ?? req.query.accountId, draftId: req.params.draftId }));
  }),

  /*
   * GET /api/mail/context?scope=&accountId=&messageId=&threadId=&query=
   *
   * The only door between mail and the assistant, and a deliberately narrow
   * one: every scope has a hard ceiling on how much it will return, so there is
   * no request shape that hands a model the mailbox.
   */
  context: asyncHandler(async (req, res) => {
    res.json(
      await mailService.context({
        scope: req.query.scope || 'message',
        accountId: req.query.accountId,
        messageId: req.query.messageId,
        threadId: req.query.threadId,
        query: req.query.query,
        limit: Number(req.query.limit) || 5,
      }),
    );
  }),
};
