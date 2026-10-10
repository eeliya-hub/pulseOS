/**
 * Making an email body safe to put on the screen.
 *
 * An email is the one piece of data in Pulse that an attacker chooses the
 * contents of, so it gets two independent defences and not one:
 *
 *   1. here — every element that can execute, fetch or navigate is removed
 *      from the HTML before it ever leaves the backend;
 *   2. in the reader — what survives is rendered inside an iframe with an
 *      empty `sandbox` attribute, where scripts cannot run at all.
 *
 * Either alone would probably do. Both together mean a mistake in this file is
 * not a cross-site-scripting hole, which is the right trade for a regex-based
 * cleaner that is not a full HTML parser.
 *
 * Remote images are held back separately (see `blockRemote`): loading one tells
 * the sender the mail was opened, and which address opened it. The reader offers
 * a one-tap "show pictures" for the message in front of you.
 */

// Elements removed along with everything inside them.
const WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'noscript', 'template', 'svg', 'math'];
// Elements removed, keeping what was inside them.
const UNWRAP = ['html', 'head', 'body', 'meta', 'link', 'base', 'form', 'input', 'button', 'select', 'textarea'];

const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * URLs that must never reach the document.
 *
 * Two shapes, deliberately, because they are not the same test: a bare scheme
 * that wants a colon after it, and a `data:` media type that already carries
 * its own. Written as one alternation, the media types were handed a second
 * colon — `data:image/svg:` — which no URL has, so an SVG data URI sailed
 * straight through. SVG is markup and can carry script, so it belongs here with
 * the rest of them.
 */
const DANGEROUS_URL = /^(?:(?:javascript|vbscript|livescript|mocha|jscript|file|about|blob|view-source):|data:(?:text\/html|text\/xml|image\/svg|application))/;

/**
 * @param {string} html raw body from the provider
 * @param {object} [opts]
 * @param {boolean} [opts.blockRemote=true] swap remote images for a placeholder
 * @returns {{ html: string, blockedImages: number }}
 */
export function sanitizeHtml(html, { blockRemote = true } = {}) {
  let out = String(html || '');
  let blockedImages = 0;

  // Comments first: a conditional comment can hide markup from this pass and
  // still be parsed by a browser.
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  for (const tag of WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '');
    // An unclosed one would otherwise leave its opening tag behind.
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }
  for (const tag of UNWRAP) {
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }

  // Every event handler, however it is spelled or spaced.
  out = out.replace(/\son[a-z-]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son[a-z-]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son[a-z-]+\s*=\s*[^\s>]+/gi, '');

  // Attributes that can pull in or run code.
  out = out.replace(/\s(?:srcdoc|formaction|xlink:href|data-[a-z-]*src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Any URL scheme that executes, tested against what a BROWSER will see.
  //
  // The entities have to be decoded rather than removed. Stripping them turned
  // `&#106;avascript:alert(1)` into `avascript:…`, which matched nothing and was
  // waved through — and a browser decodes that entity back to a `j` when it
  // parses the attribute, so the link worked. Whitespace and control characters
  // inside a scheme are ignored by browsers too, so they come out before testing.
  out = out.replace(/\s(href|src|action|background|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (whole, _attr, _q, dq, sq, bare) => {
    const raw = dq ?? sq ?? bare ?? '';
    const scheme = decodeEntities(raw).replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
    if (DANGEROUS_URL.test(scheme)) return '';
    return whole;
  });

  // CSS that fetches or executes, inside the style attributes that survive.
  out = out.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (whole, _q, dq, sq) => {
    const css = dq ?? sq ?? '';
    if (/(expression|javascript:|@import|behavior\s*:|-moz-binding)/i.test(css)) return '';
    // `position: fixed` in a mail body can cover the app's own interface.
    const safe = css.replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, '');
    return ` style="${safe.replace(/"/g, '&quot;')}"`;
  });

  if (blockRemote) {
    out = out.replace(/<img\b([^>]*)>/gi, (whole, attrs) => {
      const src = attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const url = src ? (src[2] ?? src[3] ?? src[4] ?? '') : '';
      // `cid:` points at an attachment of this message; `data:` is already here.
      if (!url || /^(cid:|data:image\/)/i.test(url)) return whole;
      blockedImages += 1;
      const stripped = attrs.replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
      return `<img${stripped} src="${PLACEHOLDER}" data-blocked-src="${escapeAttr(url)}" alt="">`;
    });
    // A tracking pixel hidden in a stylesheet-less background attribute.
    out = out.replace(/\sbackground\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }

  // Links open outside the app, and never get to name the window they open.
  out = out.replace(/<a\b([^>]*)>/gi, (whole, attrs) => {
    const cleaned = attrs.replace(/\s(target|rel)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<a${cleaned} target="_blank" rel="noopener noreferrer nofollow">`;
  });

  return { html: out.trim(), blockedImages };
}

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', tab: '\t', newline: '\n', colon: ':' };

/**
 * What a browser will read an attribute value as: numeric and named character
 * references resolved, with or without their closing semicolon (browsers accept
 * both). Used only to decide whether a URL's scheme is dangerous — never to
 * build the markup that gets sent.
 */
function decodeEntities(value) {
  let out = String(value);
  // Repeat, because `&amp;#106;` decodes to `&#106;` and then to `j`.
  for (let pass = 0; pass < 3; pass += 1) {
    const before = out;
    out = out
      .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => safeChar(parseInt(hex, 16)))
      .replace(/&#(\d+);?/g, (_m, dec) => safeChar(Number(dec)))
      .replace(/&([a-z]+);?/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
    if (out === before) break;
  }
  return out;
}

const safeChar = (code) => (Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '');

/**
 * A plain-text body as HTML, so the reader has one rendering path.
 * Bare URLs become links; quoted reply levels are marked so they can be dimmed.
 */
export function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\r?\n/)
    .map((line) => {
      const quoted = /^\s*&gt;/.test(line);
      const linked = line.replace(
        /\b(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
      );
      return quoted ? `<div class="pulse-quote">${linked || '&nbsp;'}</div>` : `<div>${linked || '&nbsp;'}</div>`;
    })
    .join('');
}
