/**
 * Turning a provider's idea of a message into Pulse's one shape.
 *
 * Everything above this file — the list, the reader, the Life Hub card, the
 * assistant's tools — reads the shape built here and never sees a Gmail label
 * or a Graph `flagStatus`. Provider quirks stop at this line.
 */

/* ── Header text ──────────────────────────────────────────────────────────── */

/**
 * Decode RFC 2047 encoded words, which is how any non-ASCII subject or sender
 * name actually arrives: `=?UTF-8?B?...?=` or `=?UTF-8?Q?...?=`.
 *
 * Without this a Persian subject line reads as `=?UTF-8?B?2LPZhNin2YU=?=` in
 * the inbox, which is exactly the sort of thing that makes an email client feel
 * broken. Adjacent encoded words are joined with no space between them, per the
 * spec, so a long subject split across several doesn't gain gaps.
 */
export function decodeHeader(value) {
  if (!value) return '';
  const text = String(value);
  if (!text.includes('=?')) return text;

  return text
    // Whitespace BETWEEN two encoded words is not part of the text.
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset, encoding, payload) => {
      try {
        const bytes =
          encoding.toUpperCase() === 'B'
            ? Buffer.from(payload, 'base64')
            : Buffer.from(
                // Q encoding: `_` is a space, `=XX` is a byte.
                payload.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
                  String.fromCharCode(parseInt(hex, 16)),
                ),
                'binary',
              );
        return decodeBytes(bytes, charset);
      } catch {
        return whole; // undecodable — show it as it came rather than losing it
      }
    });
}

/** Decode bytes in whatever charset the message declared, falling back to UTF-8. */
export function decodeBytes(bytes, charset = 'utf-8') {
  const label = String(charset || 'utf-8').toLowerCase().replace(/['"]/g, '');
  try {
    return new TextDecoder(label === 'us-ascii' ? 'utf-8' : label).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

/** One header's value out of Gmail's `[{ name, value }]` list, case-insensitively. */
export function headerValue(headers = [], name) {
  const hit = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return hit ? hit.value : '';
}

/* ── Addresses ────────────────────────────────────────────────────────────── */

/**
 * Split an address header into people.
 *
 * Commas inside a quoted display name — `"Smith, John" <j@x.com>` — are not
 * separators, which a plain `.split(',')` gets wrong and then shows two
 * recipients where there is one. Angle brackets are tracked for the same reason.
 */
export function parseAddressList(value) {
  const text = String(value || '').trim();
  if (!text) return [];

  const parts = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === '<' && !inQuotes) inAngle = true;
    else if (char === '>' && !inQuotes) inAngle = false;
    if (char === ',' && !inQuotes && !inAngle) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);

  return parts.map(parseAddress).filter((a) => a.email || a.name);
}

/** One address: `Jane Doe <jane@x.com>`, `<jane@x.com>` or a bare `jane@x.com`. */
export function parseAddress(value) {
  const text = decodeHeader(String(value || '')).trim();
  if (!text) return { name: '', email: '' };

  const angled = text.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, '$1').trim();
    const email = angled[2].trim();
    return { name: name || emailName(email), email };
  }
  return { name: emailName(text), email: text.replace(/^"(.*)"$/, '$1') };
}

/** Something human to show when a sender gave no display name. */
function emailName(email) {
  const local = String(email || '').split('@')[0] ?? '';
  if (!local) return '';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalize one provider address object into `{ name, email }`. */
export const addressFrom = (person) => ({
  name: decodeHeader(person?.name ?? person?.emailAddress?.name ?? '') || emailName(person?.emailAddress?.address),
  email: (person?.address ?? person?.emailAddress?.address ?? '').toLowerCase(),
});

/* ── Bodies ───────────────────────────────────────────────────────────────── */

/** base64url (Gmail) → Buffer. */
export const fromBase64Url = (data) => Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Quoted-printable, for the rare part that still carries it after the provider
 * has had its turn. Cheap to attempt and it rescues the odd message that would
 * otherwise read as `Hi=20there=0D`.
 */
export function decodeQuotedPrintable(text) {
  return String(text || '')
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Does this look like quoted-printable that nobody decoded? */
const looksQuotedPrintable = (text) => /=[0-9A-F]{2}/.test(text) && /=(?:20|0D|0A|3D|C3|D8)/i.test(text);

export const maybeDecodeQuotedPrintable = (text) =>
  looksQuotedPrintable(text) ? decodeQuotedPrintable(text) : text;

/** A plain-text reading of HTML, for the snippet and for what the model is given. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    // Each dropped tag left a space behind, so lines ended in " \n" and began
    // with " ". Harmless to a reader, but this text is what the model is given
    // and what the preview line is cut from, so it may as well be clean.
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The one-line preview the list shows, from whichever body we have. */
export function previewOf({ text, html, snippet } = {}, length = 180) {
  const source = (snippet || '').trim() || (text || '').trim() || htmlToText(html);
  return source.replace(/\s+/g, ' ').trim().slice(0, length);
}

/* ── The canonical message ────────────────────────────────────────────────── */

/**
 * One message, in the only shape the rest of Pulse knows.
 *
 * `body` and `attachments` are present only on a full read — a list request
 * deliberately carries headers alone, which is both faster and the reason an
 * inbox listing is safe to cache on disk while a body is not.
 */
export function message({
  id,
  accountId,
  provider,
  threadId = null,
  from = { name: '', email: '' },
  to = [],
  cc = [],
  bcc = [],
  replyTo = [],
  subject = '',
  snippet = '',
  date = null,
  unread = false,
  starred = false,
  important = false,
  draft = false,
  hasAttachments = false,
  mailboxes = [],
  categories = [],
  body = null,
  attachments = null,
  messageIdHeader = null,
  references = null,
  webUrl = null,
}) {
  return {
    id,
    accountId,
    provider,
    threadId,
    from,
    to,
    cc,
    bcc,
    replyTo,
    subject: subject || '(no subject)',
    snippet,
    date,
    unread,
    starred,
    important,
    draft,
    hasAttachments,
    mailboxes,
    categories,
    ...(body ? { body } : {}),
    ...(attachments ? { attachments } : {}),
    ...(messageIdHeader ? { messageIdHeader } : {}),
    ...(references ? { references } : {}),
    ...(webUrl ? { webUrl } : {}),
  };
}

/**
 * An ISO date from whatever the provider sent — Gmail's epoch milliseconds as a
 * string, Graph's ISO stamp, or a raw `Date:` header.
 */
export function isoDate(value) {
  if (!value) return null;
  if (/^\d+$/.test(String(value))) return new Date(Number(value)).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
