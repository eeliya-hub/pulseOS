import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { siteIconService } from '../siteIcon.service.js';

/**
 * The icon resolver, and the one thing it kept getting wrong: how long to
 * believe a bad answer.
 *
 * Sites refuse servers all the time — Cloudflare's 403, WhatsApp's 400, an
 * empty 202 from Amazon — and all three of those were showing a grey globe on
 * the launchpad while their real icons sat there for the asking. Each case was
 * a cache entry hours old. So what is asserted here is the asymmetry: a good
 * answer is held, a thin one is not.
 *
 * Every test uses its own hostname, because the cache is module-level and a
 * shared host would let one case answer another's question.
 */

/** A fetch that answers from a list of [matcher, reply] pairs. */
function stub(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const hit = routes.find(([match]) => String(url).includes(match));
    if (!hit) return new Response('', { status: 404 });
    const [, reply] = hit;
    return typeof reply === 'function' ? reply() : reply();
  };
  fn.calls = calls;
  return fn;
}

const html = (body) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const image = () => new Response('x', { status: 206, headers: { 'content-type': 'image/png' } });
const gone = () => new Response('nope', { status: 403, headers: { 'content-type': 'text/html' } });

async function withFetch(fn, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('a declared icon is found, and the second ask is free', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.after(() => mock.timers.reset());

  const fetchMock = stub([
    ['https://declared.test/apple-touch-icon.png', image],
    ['https://declared.test', html('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')],
  ]);

  await withFetch(fetchMock, async () => {
    const first = await siteIconService.resolve('declared.test');
    assert.equal(first.best, 'https://declared.test/apple-touch-icon.png');

    const before = fetchMock.calls.length;
    const second = await siteIconService.resolve('https://declared.test/some/page');
    assert.equal(second.best, first.best);
    assert.equal(fetchMock.calls.length, before, 'a held answer should not go back out');

    // And well past the few minutes a thin answer gets: a real icon is kept.
    t.mock.timers.tick(90 * 60 * 1000);
    const later = await siteIconService.resolve('declared.test');
    assert.equal(later.best, first.best);
    assert.equal(fetchMock.calls.length, before, 'a good answer is worth a day');
  });
});

test('a page that refuses us is not believed for a day', async (t) => {
  // The clock, so the five minutes can pass in no time at all.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.after(() => mock.timers.reset());

  // Nothing readable, nothing serving: all this site leaves behind is Google's
  // upscaled favicon, which is the shape of every tile that was stuck grey.
  const refusing = stub([
    ['google.com/s2/favicons', image],
    ['https://sulking.test', gone],
  ]);

  await withFetch(refusing, async () => {
    const thin = await siteIconService.resolve('sulking.test');
    assert.match(thin.best, /google\.com\/s2\/favicons/);
  });

  // Now it answers. The next look has to actually look.
  const answering = stub([
    ['https://sulking.test/icon-512.png', image],
    ['https://sulking.test', html('<link rel="icon" sizes="512x512" href="/icon-512.png">')],
  ]);

  t.mock.timers.tick(6 * 60 * 1000);

  await withFetch(answering, async () => {
    const good = await siteIconService.resolve('sulking.test');
    assert.equal(good.best, 'https://sulking.test/icon-512.png');
  });
});

test('an icon from a held answer is still reachable through the proxy', async () => {
  const fetchMock = stub([
    ['https://held.test/touch.png', image],
    ['https://held.test', html('<link rel="apple-touch-icon" href="/touch.png">')],
  ]);

  await withFetch(fetchMock, async () => {
    await siteIconService.resolve('held.test');
    await siteIconService.resolve('held.test'); // served from the cache
    // The image route only fetches addresses resolve() has handed out, and a
    // cache hit hands them out too.
    const bytes = await siteIconService.image('https://held.test/touch.png');
    assert.match(bytes.type, /^image\//);
  });
});

/** A PNG header that says it is w×h, which is all `serves` reads. */
function png(w, h) {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(w, 16);
  head.writeUInt32BE(h, 20);
  return () => new Response(head, { status: 200, headers: { 'content-type': 'image/png' } });
}

test('the bytes are believed over the markup', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.after(() => mock.timers.reset());

  // Reddit's shape: an apple-touch-icon claiming 180 and serving 57, next to a
  // smaller-sounding one that is actually sharper.
  const fetchMock = stub([
    ['https://liar.test/touch.png', png(57, 57)],
    ['https://liar.test/small.png', png(64, 64)],
    ['google.com/s2/favicons', png(32, 32)],
    ['https://liar.test', html(
      '<link rel="apple-touch-icon" sizes="180x180" href="/touch.png">'
      + '<link rel="icon" sizes="64x64" href="/small.png">',
    )],
  ]);

  await withFetch(fetchMock, async () => {
    const found = await siteIconService.resolve('liar.test');
    assert.equal(found.best, 'https://liar.test/small.png', 'the sharper one wins');
    assert.deepEqual(found.icons.map((i) => i.size), [64, 57, 32]);
  });
});

test("a site's own small icon loses to a bigger one held elsewhere", async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.after(() => mock.timers.reset());

  // google.com's shape: it serves 32 pixels of itself, and Google's own favicon
  // service has 144. The tile wants the 144, so last resort is about standing
  // rather than quality.
  const fetchMock = stub([
    ['https://modest.test/icon.png', png(32, 32)],
    ['google.com/s2/favicons', png(144, 144)],
    ['https://modest.test', html('<link rel="icon" href="/icon.png">')],
  ]);

  await withFetch(fetchMock, async () => {
    const found = await siteIconService.resolve('modest.test');
    assert.match(found.best, /google\.com\/s2\/favicons/);
  });
});
