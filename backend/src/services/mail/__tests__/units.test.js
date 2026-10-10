import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeHtml, textToHtml } from '../sanitize.js';
import { decodeHeader, htmlToText, parseAddress, parseAddressList } from '../normalize.js';
import { buildMime, readPayload } from '../mime.js';
import { triage } from '../triage.js';
import { trimQuoted } from '../mail.service.js';

/**
 * What a browser would make of an attribute value, so a "pass" here means the
 * markup is safe as rendered rather than merely safe as text. Checking the raw
 * output is how `&#106;avascript:` was waved through the first time.
 */
const asBrowserReads = (html) => {
  const urls = [...html.matchAll(/(?:href|src)="([^"]*)"/gi)].map((m) => m[1]);
  return urls
    .map((url) =>
      url
        .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);?/g, (_m, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&colon;?/gi, ':')
        .replace(/&amp;?/gi, '&')
        .replace(/[\s\u0000-\u001f]/g, '')
        .toLowerCase(),
    )
    .join(' ');
};

test('sanitize: nothing that executes survives', () => {
  const attacks = [
    '<p>hi</p><script>fetch("//evil")</script>',
    '<img src=x onerror=alert(1)>',
    '<div onclick=steal()>click</div>',
    '<div ONMOUSEOVER="x()">y</div>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="&#x6a;avascript:alert(1)">x</a>',
    '<a href="&amp;#106;avascript:alert(1)">x</a>',
    '<a href="&#106avascript:alert(1)">x</a>',
    '<a href="java\nscript:alert(1)">x</a>',
    '<a href="javascript&colon;alert(1)">x</a>',
    '<a href="  javascript:alert(1)">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==">',
    '<a href="view-source:http://x">x</a>',
    '<iframe src="//evil"></iframe>',
    '<iframe srcdoc="<script>x</script>"></iframe>',
    '<svg><script>alert(1)</script></svg>',
    '<object data="//evil"></object>',
    '<embed src="//evil">',
    '<form action="//evil"><input name=pw></form>',
    '<div style="width:expression(alert(1))">x</div>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<style>body{background:url(//evil)}</style>',
    '<!--[if IE]><script>alert(1)</script><![endif]-->',
    '<base href="//evil/">',
    '<math><mtext><script>alert(1)</script></mtext></math>',
  ];

  for (const attack of attacks) {
    const { html } = sanitizeHtml(attack);
    assert.doesNotMatch(html, /<script|<iframe|<object|<embed|<form|<input|<style|<svg|<math|<base/i, attack);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `event handler survived: ${attack}`);
    assert.doesNotMatch(html, /expression\(/i, attack);
    assert.doesNotMatch(html, /srcdoc/i, attack);
    assert.doesNotMatch(asBrowserReads(html), /javascript:|vbscript:|data:text\/html|data:image\/svg|view-source:/, attack);
  }
});

test('sanitize: what should survive, does', () => {
  const { html } = sanitizeHtml(
    '<p>Hello <b>there</b></p><a href="https://example.com/report">report</a><a href="mailto:j@x.com">mail</a><img src="data:image/png;base64,iVBORw0KGgo="><img src="cid:logo1">',
  );
  assert.match(html, /<b>there<\/b>/);
  assert.match(html, /href="https:\/\/example\.com\/report"/);
  assert.match(html, /href="mailto:j@x\.com"/);
  assert.match(html, /src="data:image\/png/, 'an inline picture is already here — nothing to leak');
  assert.match(html, /src="cid:logo1"/, 'and a cid: image is part of this message');
});

test('sanitize: links open outside the app and cannot name its window', () => {
  const { html } = sanitizeHtml('<a href="https://x.com" target="pulse-main" rel="opener">x</a>');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
  assert.doesNotMatch(html, /pulse-main/, 'a mail must not be able to retarget the app\'s own window');
});

test('sanitize: remote images are held back, and can be let through', () => {
  const pixel = '<p>hi</p><img src="https://track.io/p.gif?u=me"><img src="https://cdn.x/logo.png">';
  const blocked = sanitizeHtml(pixel);
  assert.equal(blocked.blockedImages, 2);
  // The live `src` must be the placeholder. Matched with a boundary before it,
  // because `data-blocked-src="` ends in `src="` and would satisfy a loose test.
  const liveSrcs = [...blocked.html.matchAll(/(?:^|[\s"])src="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(liveSrcs.length === 2 && liveSrcs.every((src) => src.startsWith('data:image/gif')), 'both images point at the placeholder');
  assert.match(blocked.html, /data-blocked-src="https:\/\/track\.io/, 'the real address is kept, so it can be shown on request');

  const shown = sanitizeHtml(pixel, { blockRemote: false });
  assert.equal(shown.blockedImages, 0);
  assert.match(shown.html, /src="https:\/\/track\.io/);
});

test('sanitize: a mail cannot cover the app with a fixed overlay', () => {
  const { html } = sanitizeHtml('<div style="position:fixed;top:0;left:0;width:100vw">gotcha</div>');
  assert.doesNotMatch(html, /position:\s*fixed/i);
  assert.match(html, /top:0/, 'the rest of the styling is left alone');
});

test('headers: RFC 2047 encoded words decode, in both encodings', () => {
  assert.equal(decodeHeader('=?UTF-8?B?2LPZhNin2YU=?='), 'سلام');
  assert.equal(decodeHeader('=?iso-8859-1?Q?Caf=E9_meeting?='), 'Café meeting');
  assert.equal(decodeHeader('Plain subject'), 'Plain subject');
  // Adjacent encoded words join with no space, per the spec.
  assert.equal(decodeHeader('=?UTF-8?B?SGVsbG8g?= =?UTF-8?B?d29ybGQ=?='), 'Hello world');
  assert.equal(decodeHeader(''), '');
});

test('addresses: a comma inside a quoted name is not a separator', () => {
  assert.deepEqual(parseAddressList('"Smith, John" <j@x.com>, jane@y.com'), [
    { name: 'Smith, John', email: 'j@x.com' },
    { name: 'Jane', email: 'jane@y.com' },
  ]);
  assert.deepEqual(parseAddress('<solo@x.com>'), { name: 'Solo', email: 'solo@x.com' });
  assert.deepEqual(parseAddress(''), { name: '', email: '' });
  assert.equal(parseAddressList('').length, 0);
});

test('mime: a body is found however deeply it is nested', () => {
  const tree = {
    mimeType: 'multipart/mixed',
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('plain').toString('base64url') } },
          { mimeType: 'text/html', body: { data: Buffer.from('<p>rich</p>').toString('base64url') } },
        ],
      },
      {
        mimeType: 'application/pdf',
        filename: 'a.pdf',
        body: { attachmentId: 'att1', size: 10 },
        headers: [{ name: 'Content-Disposition', value: 'attachment; filename="a.pdf"' }],
      },
    ],
  };
  const read = readPayload(tree);
  assert.equal(read.text, 'plain');
  assert.equal(read.html, '<p>rich</p>');
  assert.equal(read.attachments.length, 1);
});

test('mime: a built message is well formed, and encodes a unicode subject', () => {
  const raw = buildMime({
    from: { name: 'اعلیا', email: 'e@x.com' },
    to: [{ name: 'Jane', email: 'j@y.com' }],
    subject: 'سلام',
    text: 'plain',
    html: '<p>rich</p>',
  });
  assert.match(raw, /^Subject: =\?UTF-8\?B\?/m);
  const boundary = raw.match(/boundary="([^"]+)"/)[1];
  assert.doesNotMatch(boundary, /^-/, 'a boundary starting with dashes confuses strict parsers');
  assert.ok(raw.includes(`--${boundary}--`), 'the final delimiter is present');
  assert.match(raw, /Content-Type: multipart\/alternative/);
});

test('triage: marketing urgency is not a deadline', () => {
  const me = ['me@x.com'];
  const promo = triage(
    {
      subject: 'LAST CHANCE: 50% off ends today!',
      snippet: 'Shop now. Unsubscribe here.',
      from: { email: 'promo@shop.com' },
      to: [{ email: 'me@x.com' }],
      unread: true,
      categories: ['promotions'],
      date: new Date().toISOString(),
    },
    me,
  );
  assert.equal(promo.needsAction, false);
  assert.equal(promo.hasDeadline, false, 'otherwise every sale becomes a deadline on the card');
  assert.equal(promo.bulk, true);

  const real = triage(
    {
      subject: 'Final report',
      snippet: 'Please send the final report by Friday.',
      from: { email: 'tutor@uni.ac.uk' },
      to: [{ email: 'me@x.com' }],
      unread: true,
      date: new Date().toISOString(),
    },
    me,
  );
  assert.equal(real.needsAction, true);
  assert.equal(real.hasDeadline, true);
  assert.ok(real.score > promo.score);
});

test('triage: being cc\'d does not make something yours to do', () => {
  const direct = triage(
    { subject: 'Can you review this?', snippet: 'Please review the draft.', from: { email: 'a@x.com' }, to: [{ email: 'me@x.com' }], unread: true, date: new Date().toISOString() },
    ['me@x.com'],
  );
  const copied = triage(
    { subject: 'Can you review this?', snippet: 'Please review the draft.', from: { email: 'a@x.com' }, to: [{ email: 'someone@x.com' }], cc: [{ email: 'me@x.com' }], unread: true, date: new Date().toISOString() },
    ['me@x.com'],
  );
  assert.ok(direct.score > copied.score);
});

test('quoted reply history is trimmed before the model sees it', () => {
  assert.equal(
    trimQuoted('Friday works for me.\n\nOn 3 Oct 2026, Jane Doe <j@x.com> wrote:\n> Can you do Thursday?'),
    'Friday works for me.',
  );
  assert.equal(trimQuoted('No quote here.'), 'No quote here.');
  assert.equal(trimQuoted('Top line\n-----Original Message-----\nold'), 'Top line');
});

test('plain text renders as HTML with quotes marked and links live', () => {
  const html = textToHtml('Hi\n> old reply\nSee https://x.com');
  assert.match(html, /class="pulse-quote"/);
  assert.match(html, /<a href="https:\/\/x\.com"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

test('html to text keeps the words and drops the markup', () => {
  const text = htmlToText('<p>Send by <b>Friday</b></p><br><div>Thanks&nbsp;!</div>');
  assert.match(text, /Send by Friday/);
  assert.match(text, /Thanks\s*!/);
  assert.doesNotMatch(text, /[<>]|&nbsp;/, 'no markup or entities left for the model to read');
  // The line break between the paragraph and the div survives, which is what
  // keeps a model from running two sentences together.
  assert.ok(text.indexOf('Friday') < text.indexOf('Thanks'));
  // The paragraph break survives, and carries no stray spaces around it.
  assert.equal(text, 'Send by Friday\n\nThanks !');
});
