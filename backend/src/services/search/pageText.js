import { fetchText } from '../../utils/httpClient.js';

// Pulls the readable text out of a web page, so the assistant can answer from
// what a page actually SAYS rather than from a one-line search snippet.
// Deliberately dependency-free: strip the non-content elements, drop the tags,
// decode the common entities, collapse the whitespace.

const INTEGRATION = 'Web page';

// Never let a URL from a search result point the backend at the local network.
const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i;

// Redirect wrappers (Google News, DDG) resolve to an interstitial, not an
// article — reading them yields nothing useful.
const NO_TEXT_HOST = /(^|\.)(news\.google\.com|duckduckgo\.com|youtube\.com|youtu\.be)$/i;

export function isReadableUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (BLOCKED_HOST.test(u.hostname)) return false;
    if (NO_TEXT_HOST.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
};

export function decodeEntities(text = '') {
  return text
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos|mdash|ndash|hellip|rsquo|lsquo|ldquo|rdquo);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// Tags → text: drop the markup, decode the entities, collapse the whitespace.
function stripTags(html) {
  return decodeEntities(html.replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim();
}

const cap = (text, maxChars) => (text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text);

/**
 * HTML → plain readable text (no markup, no scripts, no page furniture).
 *
 * Prefers the page's paragraphs: article prose lives in <p>, while share
 * buttons, cookie banners and infobox data don't — so harvesting paragraphs
 * gets the story rather than "Share on X (opens in new window)". Falls back to
 * the whole document when there aren't enough of them (or when the input is a
 * fragment, like a search-result snippet).
 */
export function htmlToText(html = '', maxChars = 1200) {
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  const stripped = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const prose = [...stripped.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((t) => t.length >= 60)
    .join('\n');

  return cap(prose.length >= 200 ? prose : stripTags(stripped), maxChars);
}

/**
 * Fetch a page and return its readable text. Resolves to null (never throws) on
 * anything unreadable — a blocked host, a paywall, a timeout — so enriching a
 * batch of search results can never fail the search itself.
 */
export async function readPage(url, { maxChars = 1200, timeoutMs = 7_000 } = {}) {
  if (!isReadableUrl(url)) return null;
  try {
    const html = await fetchText(url, {
      integration: INTEGRATION,
      timeoutMs,
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 PulseOS/0.1',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const text = htmlToText(html, maxChars);
    return text.length > 120 ? text : null; // too little to be worth sending
  } catch {
    return null;
  }
}
