import { decodeBytes, fromBase64Url, maybeDecodeQuotedPrintable } from './normalize.js';

/**
 * Reading and writing RFC 2822, which Gmail speaks and Microsoft Graph does not.
 *
 * Kept apart from either provider because a future IMAP account would need
 * exactly this and nothing else from the Gmail file.
 */

/* ── Reading: Gmail's MIME tree → one body + a list of attachments ────────── */

/**
 * Walk a Gmail payload for the best body and every attachment.
 *
 * A real message is a tree: `multipart/mixed` holding a `multipart/alternative`
 * holding the text and the HTML, with the pictures beside them. Taking
 * `payload.body` alone — which is what a first pass naturally does — yields an
 * empty string for every message that has an attachment, because the top level
 * of such a message holds no text at all.
 */
export function readPayload(payload) {
  const found = { html: '', text: '', attachments: [] };
  walk(payload, found, false);
  return found;
}

function walk(part, found, insideAlternative) {
  if (!part) return;
  const mime = (part.mimeType || '').toLowerCase();
  const disposition = headerOf(part, 'content-disposition');
  const isAttachment = /attachment/i.test(disposition) || Boolean(part.body?.attachmentId && !/inline/i.test(disposition));
  const filename = part.filename || filenameFrom(disposition);

  if (mime.startsWith('multipart/')) {
    for (const child of part.parts ?? []) walk(child, found, insideAlternative || mime === 'multipart/alternative');
    return;
  }

  // An inline image referenced by `cid:` from the HTML, or a real attachment.
  if (part.body?.attachmentId || (isAttachment && filename)) {
    found.attachments.push({
      id: part.body.attachmentId ?? null,
      name: filename || 'attachment',
      mimeType: part.mimeType || 'application/octet-stream',
      size: Number(part.body?.size) || 0,
      inline: /inline/i.test(disposition) || Boolean(headerOf(part, 'content-id')),
      contentId: (headerOf(part, 'content-id') || '').replace(/^<|>$/g, '') || null,
    });
    return;
  }

  if (!part.body?.data) return;
  const charset = (headerOf(part, 'content-type').match(/charset="?([^";\s]+)"?/i) ?? [])[1];
  const decoded = maybeDecodeQuotedPrintable(decodeBytes(fromBase64Url(part.body.data), charset));

  // The richest version wins, but a text part is kept too: it is what the
  // assistant is given to read, and what the preview line comes from.
  if (mime === 'text/html' && !found.html) found.html = decoded;
  else if (mime === 'text/plain' && !found.text) found.text = decoded;
  else if (!found.html && !found.text && mime.startsWith('text/')) found.text = decoded;
}

const headerOf = (part, name) =>
  (part.headers ?? []).find((h) => h.name?.toLowerCase() === name)?.value ?? '';

function filenameFrom(disposition) {
  const quoted = disposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted) return quoted[1];
  const bare = disposition.match(/filename\s*=\s*([^;]+)/i);
  return bare ? bare[1].trim() : '';
}

/* ── Writing: a draft → RFC 2822 ─────────────────────────────────────────── */

const CRLF = '\r\n';

/** Encode a header value that may hold non-ASCII, per RFC 2047. */
function encodeHeaderValue(value) {
  const text = String(value || '');
  if (!text || /^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

/** `Jane Doe <jane@x.com>`, with the display name encoded if it needs to be. */
function formatAddress(person) {
  if (typeof person === 'string') return person;
  const { name, email } = person ?? {};
  if (!email) return '';
  if (!name) return email;
  return `${encodeHeaderValue(name).includes('=?') ? encodeHeaderValue(name) : `"${name.replace(/"/g, '')}"`} <${email}>`;
}

const addressList = (people = []) => people.map(formatAddress).filter(Boolean).join(', ');

// No leading dashes of its own: the delimiter line is `--` plus this value, so a
// boundary that already began with `--` produced `----pulse-…` lines. Legal, but
// strict parsers treat a boundary starting with dashes inconsistently, and there
// is nothing to gain by testing them on it.
const boundary = () => `pulse-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/**
 * Build a complete message.
 *
 * Shape follows what the message actually holds, because a mail client will
 * render a needlessly nested message oddly: plain text alone is a single part,
 * text plus HTML is `multipart/alternative`, and anything with a file is
 * `multipart/mixed` wrapping that.
 *
 * @param {object} draft
 * @param {{name,email}} draft.from
 * @param {Array} draft.to
 * @param {Array} [draft.cc]
 * @param {Array} [draft.bcc]
 * @param {string} draft.subject
 * @param {string} [draft.text]
 * @param {string} [draft.html]
 * @param {Array<{name,mimeType,data}>} [draft.attachments] data is base64
 * @param {string} [draft.inReplyTo] the Message-ID being replied to
 * @param {string} [draft.references]
 * @returns {string} the raw message
 */
export function buildMime(draft) {
  const headers = [
    draft.from ? `From: ${formatAddress(draft.from)}` : null,
    `To: ${addressList(draft.to)}`,
    draft.cc?.length ? `Cc: ${addressList(draft.cc)}` : null,
    draft.bcc?.length ? `Bcc: ${addressList(draft.bcc)}` : null,
    `Subject: ${encodeHeaderValue(draft.subject ?? '')}`,
    // Threading. Without these a reply starts a new conversation in the
    // recipient's client even when the provider files it in the right thread.
    draft.inReplyTo ? `In-Reply-To: ${draft.inReplyTo}` : null,
    draft.references ? `References: ${draft.references}` : null,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  const text = draft.text ?? '';
  const html = draft.html ?? '';
  const files = draft.attachments ?? [];

  const bodyPart = () => {
    if (html && text) {
      const alt = boundary();
      return {
        headers: [`Content-Type: multipart/alternative; boundary="${alt}"`],
        body: [
          `--${alt}`,
          'Content-Type: text/plain; charset="UTF-8"',
          'Content-Transfer-Encoding: base64',
          '',
          wrap(Buffer.from(text, 'utf8').toString('base64')),
          `--${alt}`,
          'Content-Type: text/html; charset="UTF-8"',
          'Content-Transfer-Encoding: base64',
          '',
          wrap(Buffer.from(html, 'utf8').toString('base64')),
          `--${alt}--`,
        ].join(CRLF),
      };
    }
    const only = html || text;
    return {
      headers: [
        `Content-Type: text/${html ? 'html' : 'plain'}; charset="UTF-8"`,
        'Content-Transfer-Encoding: base64',
      ],
      body: wrap(Buffer.from(only, 'utf8').toString('base64')),
    };
  };

  const part = bodyPart();

  if (!files.length) {
    return [...headers, ...part.headers, '', part.body].join(CRLF);
  }

  const mixed = boundary();
  const chunks = [
    `--${mixed}`,
    ...part.headers,
    '',
    part.body,
    ...files.flatMap((file) => [
      `--${mixed}`,
      `Content-Type: ${file.mimeType || 'application/octet-stream'}; name="${(file.name || 'file').replace(/"/g, '')}"`,
      `Content-Disposition: attachment; filename="${(file.name || 'file').replace(/"/g, '')}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap(String(file.data || '')),
    ]),
    `--${mixed}--`,
  ];

  return [...headers, `Content-Type: multipart/mixed; boundary="${mixed}"`, '', ...chunks].join(CRLF);
}

/** base64 in 76-character lines, as the spec requires. */
const wrap = (base64) => (base64.match(/.{1,76}/g) ?? []).join(CRLF);

/** RFC 2822 → base64url, which is how Gmail takes a message. */
export const toBase64Url = (raw) =>
  Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
