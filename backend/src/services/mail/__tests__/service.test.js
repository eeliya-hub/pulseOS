import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAPH_FOLDER_ROUTE, gmailMessage, graphMessage, mockFetch, withFetch } from './helpers.js';
import { mailService } from '../mail.service.js';
import { forgetAccount, listAccounts, saveAccount } from '../accounts.js';

/*
 * The service holds listings and bodies in memory on purpose, so each case has
 * to start from nothing — otherwise the second test is answered by the cache
 * the first one filled, and a test of a failing account quietly passes on the
 * previous test's successful read.
 */
test.beforeEach(() => {
  // Accounts as well as caches. A case that fails never reaches its own
  // cleanup, so without this the NEXT run starts with a stray account still in
  // the token file — and a test that means to read Gmail silently reads Outlook.
  mailService.forgetAll();
  mailService.evict();
});

const GOOGLE_ID = 'google-personal-example-com';
const MS_ID = 'microsoft-work-example-com';

function connectBoth() {
  mailService.evict();
  forgetAccount('google', GOOGLE_ID);
  forgetAccount('microsoft', MS_ID);
  saveAccount({
    provider: 'google',
    email: 'personal@example.com',
    name: 'Personal',
    tokens: { access_token: 'g', refresh_token: 'gr', expires_at: Date.now() + 3_600_000 },
  });
  saveAccount({
    provider: 'microsoft',
    email: 'work@example.com',
    name: 'Work',
    tokens: { access_token: 'm', refresh_token: 'mr', expires_at: Date.now() + 3_600_000 },
  });
}
function cleanup() {
  forgetAccount('google', GOOGLE_ID);
  forgetAccount('microsoft', MS_ID);
}

const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const epoch = (hoursAgo) => String(Date.now() - hoursAgo * 3_600_000);

/** Both providers answering, so the service's own behaviour is what's on test. */
function bothProviders({ gmail = [], graph = [], gmailFails = false } = {}) {
  return mockFetch([
    GRAPH_FOLDER_ROUTE,
    { match: (url) => url.includes('graph.microsoft.com') && url.includes('/messages'), reply: { value: graph } },
    {
      match: (url) => url.includes('gmail.googleapis.com') && /\/messages\?/.test(url),
      status: gmailFails ? 500 : 200,
      reply: gmailFails
        ? { error: { message: 'Gmail is having a moment' } }
        : { messages: gmail.map((m) => ({ id: m.id, threadId: m.threadId })), resultSizeEstimate: gmail.length },
    },
    {
      match: (url) => url.includes('gmail.googleapis.com') && /\/labels/.test(url),
      reply: ({ url }) =>
        url.endsWith('/labels')
          ? { labels: [{ id: 'INBOX' }, { id: 'DRAFT' }] }
          : { messagesUnread: 9, messagesTotal: 300 },
    },
    {
      match: (url) => url.includes('gmail.googleapis.com') && /\/messages\/[^/?]+/.test(url),
      reply: ({ url }) => gmail.find((m) => url.includes(`/messages/${m.id}`)) ?? gmailMessage({}),
    },
  ]);
}

test('two accounts interleave by date, newest first, each tagged with its own', async () => {
  connectBoth();
  const fetchMock = bothProviders({
    gmail: [
      gmailMessage({ id: 'g-old', subject: 'Gmail older', date: epoch(10) }),
      gmailMessage({ id: 'g-new', subject: 'Gmail newest', date: epoch(1) }),
    ],
    graph: [graphMessage({ id: 'm-mid', subject: 'Outlook middle', received: iso(5) })],
  });

  await withFetch(fetchMock, async () => {
    const page = await mailService.list({ mailbox: 'inbox' });
    assert.equal(page.connected, true);
    assert.deepEqual(
      page.messages.map((m) => m.subject),
      ['Gmail newest', 'Outlook middle', 'Gmail older'],
      'one stream in date order, not one provider after the other',
    );
    assert.deepEqual(
      page.messages.map((m) => m.accountId),
      [GOOGLE_ID, MS_ID, GOOGLE_ID],
      'every row says which mailbox it came from',
    );
    // Triage runs over the merged page, so the UI can show signals on any row.
    assert.ok(page.messages.every((m) => m.triage));
  });
  cleanup();
});

test('one account failing is reported, not shown as an empty inbox', async () => {
  connectBoth();
  const fetchMock = bothProviders({
    gmailFails: true,
    graph: [graphMessage({ id: 'm1', subject: 'Outlook still works', received: iso(1) })],
  });

  await withFetch(fetchMock, async () => {
    const page = await mailService.list({ mailbox: 'inbox' });
    assert.equal(page.messages.length, 1, 'the working account still shows its mail');
    const failed = page.accounts.find((a) => a.id === GOOGLE_ID);
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'error');
    assert.ok(failed.message, 'and says what went wrong, so the UI can explain it');
    assert.equal(page.accounts.find((a) => a.id === MS_ID).ok, true);
  });
  cleanup();
});

test('the cursor carries one token per account, and spent accounts stop', async () => {
  connectBoth();
  const fetchMock = mockFetch([
    GRAPH_FOLDER_ROUTE,
    {
      match: (url) => url.includes('graph.microsoft.com'),
      reply: { value: [graphMessage({ id: 'm1', received: iso(1) })], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' },
    },
    {
      match: (url) => url.includes('gmail.googleapis.com') && /\/messages\?/.test(url),
      // No nextPageToken: Gmail has reached the end.
      reply: { messages: [{ id: 'g1', threadId: 't1' }], resultSizeEstimate: 1 },
    },
    { match: (url) => url.includes('gmail.googleapis.com'), reply: gmailMessage({ id: 'g1', date: epoch(2) }) },
  ]);

  await withFetch(fetchMock, async () => {
    const first = await mailService.list({ mailbox: 'inbox' });
    assert.ok(first.nextPageToken, 'more to come, because Outlook has another page');

    const cursor = JSON.parse(Buffer.from(first.nextPageToken, 'base64url').toString('utf8'));
    assert.equal(cursor[GOOGLE_ID], null, 'Gmail is finished');
    assert.ok(cursor[MS_ID].includes('/next'), 'Outlook carries its own continuation');

    fetchMock.reset();
    await mailService.list({ mailbox: 'inbox', pageToken: first.nextPageToken });
    assert.equal(
      fetchMock.calls.filter((c) => c.url.includes('gmail.googleapis.com')).length,
      0,
      'a finished account is not asked again',
    );
  });
  cleanup();
});

test('an unreadable cursor starts again rather than failing the request', async () => {
  connectBoth();
  const fetchMock = bothProviders({ gmail: [gmailMessage({ id: 'g1', date: epoch(1) })] });
  await withFetch(fetchMock, async () => {
    const page = await mailService.list({ mailbox: 'inbox', pageToken: 'not-a-real-cursor' });
    assert.equal(page.connected, true);
    assert.ok(page.messages.length >= 1);
  });
  cleanup();
});

test('a category is skipped on a provider that has none, not passed on', async () => {
  connectBoth();
  const fetchMock = bothProviders({
    gmail: [gmailMessage({ id: 'g1', date: epoch(1) })],
    graph: [graphMessage({ id: 'm1', received: iso(1) })],
  });

  await withFetch(fetchMock, async () => {
    await mailService.list({ mailbox: 'inbox', category: 'promotions' });
    const graphCalls = fetchMock.calls.filter((c) => c.url.includes('graph.microsoft.com') && c.url.includes('/messages'));
    assert.equal(graphCalls.length, 0, 'Outlook is not asked for a Gmail category');
    const gmailCall = fetchMock.calls.find((c) => c.url.includes('gmail') && c.url.includes('/messages?'));
    assert.match(decodeURIComponent(gmailCall.url), /CATEGORY_PROMOTIONS/);
  });
  cleanup();
});

test('the summary counts real inbox mail and never spam or bin', async () => {
  connectBoth();
  const fetchMock = mockFetch([
    GRAPH_FOLDER_ROUTE,
    {
      match: (url) => url.includes('graph.microsoft.com'),
      reply: {
        value: [
          // Addressed TO the connected account: triage only calls something
          // actionable when it is actually aimed at this user.
          graphMessage({
            id: 'ask',
            subject: 'Could you send the report by Friday?',
            to: [{ name: 'Eeliya at Work', address: 'work@example.com' }],
            received: iso(1),
            parentFolderId: 'FOLDER_INBOX',
          }),
          // Spam must not reach the figures even if a provider leaks it.
          graphMessage({ id: 'junk', subject: 'YOU WON', received: iso(2), parentFolderId: 'FOLDER_SPAM' }),
          graphMessage({ id: 'binned', subject: 'old thing', received: iso(3), parentFolderId: 'FOLDER_TRASH' }),
        ],
      },
    },
    {
      match: (url) => url.includes('gmail.googleapis.com') && /\/messages\?/.test(url),
      reply: { messages: [{ id: 'meet', threadId: 't1' }], resultSizeEstimate: 1 },
    },
    {
      match: (url) => url.includes('gmail.googleapis.com') && /\/labels/.test(url),
      reply: ({ url }) => (url.endsWith('/labels') ? { labels: [{ id: 'INBOX' }, { id: 'DRAFT' }] } : { messagesUnread: 9, messagesTotal: 300 }),
    },
    {
      match: (url) => url.includes('gmail.googleapis.com'),
      reply: gmailMessage({
        id: 'meet',
        subject: 'Project sync Thursday at 2pm',
        snippet: 'Our meeting is Thursday at 2pm at the London office.',
        to: 'personal@example.com',
        date: epoch(1),
      }),
    },
  ]);

  await withFetch(fetchMock, async () => {
    const summary = await mailService.summary();
    assert.equal(summary.connected, true);
    // Unread comes from each provider's own figure: 9 from Gmail's label, 7 from
    // the Outlook inbox folder.
    assert.equal(summary.unread, 16);
    assert.equal(summary.needsAction, 1, 'the "send the report by Friday" one');
    assert.equal(summary.deadlines, 1);
    assert.equal(summary.meetings, 1, 'the Thursday 2pm one');

    const named = summary.highlights.map((h) => h.subject);
    assert.ok(!named.some((s) => /YOU WON|old thing/.test(s)), 'spam and bin are never highlighted');
    assert.ok(summary.highlights.every((h) => h.accountId), 'each highlight says which account it is from');
    // Headers only on the card — no bodies leave the service for the Life Hub.
    assert.ok(summary.highlights.every((h) => !('body' in h)));

    assert.deepEqual(
      summary.accounts.map((a) => a.email).sort(),
      ['personal@example.com', 'work@example.com'],
      'both accounts are listed so the card can show which is which',
    );
  });
  cleanup();
});

test('a body is sanitised and remote images held back before it leaves', async () => {
  forgetAccount('google', GOOGLE_ID);
  saveAccount({
    provider: 'google',
    email: 'personal@example.com',
    name: 'Personal',
    tokens: { access_token: 'g', refresh_token: 'gr', expires_at: Date.now() + 3_600_000 },
  });

  const nasty = '<p>Hi</p><script>steal()</script><img src="https://track.io/p.gif"><a href="javascript:alert(1)">x</a>';
  const fetchMock = mockFetch([
    { match: (url) => url.includes('/messages/m1'), reply: gmailMessage({ id: 'm1', html: nasty, text: 'Hi' }) },
  ]);

  await withFetch(fetchMock, async () => {
    const msg = await mailService.message({ id: 'm1' });
    assert.doesNotMatch(msg.body.html, /<script/i, 'no script reaches the browser');
    assert.doesNotMatch(msg.body.html, /javascript:/i);
    assert.equal(msg.body.blockedImages, 1, 'the tracking pixel is held back');
    assert.equal(msg.body.imagesShown, false);
    assert.ok(msg.triage, 'and the reader gets the signals too');

    const shown = await mailService.message({ id: 'm1', images: true });
    assert.match(shown.body.html, /track\.io/, 'asking for pictures lets them through');
    assert.doesNotMatch(shown.body.html, /<script/i, 'but never the script');
  });
  cleanup();
});

test('AI context is capped per scope, and search hands back headers only', async () => {
  forgetAccount('google', GOOGLE_ID);
  saveAccount({
    provider: 'google',
    email: 'personal@example.com',
    name: 'Personal',
    tokens: { access_token: 'g', refresh_token: 'gr', expires_at: Date.now() + 3_600_000 },
  });

  const long = 'x'.repeat(20_000);
  const thread = Array.from({ length: 12 }, (_, i) =>
    gmailMessage({ id: `t${i}`, threadId: 'th1', subject: `Message ${i}`, text: `Body ${i}` }),
  );

  const fetchMock = mockFetch([
    { match: (url) => url.includes('/threads/th1'), reply: { messages: thread } },
    { match: (url) => /\/messages\?/.test(url), reply: { messages: [{ id: 'm1', threadId: 'th1' }], resultSizeEstimate: 1 } },
    { match: (url) => url.includes('/messages/m1'), reply: gmailMessage({ id: 'm1', threadId: 'th1', text: long }) },
    { match: () => true, reply: gmailMessage({ id: 'other' }) },
  ]);

  await withFetch(fetchMock, async () => {
    const one = await mailService.context({ scope: 'message', messageId: 'm1' });
    assert.ok(one.message.body.length <= 6000, 'a single body is capped');
    assert.equal(one.message.truncated, true, 'and says so, so the model knows there is more');

    const conv = await mailService.context({ scope: 'thread', messageId: 'm1' });
    assert.equal(conv.count, 12, 'it reports the real length');
    assert.equal(conv.messages.length, 3, 'but only the last few are sent');
    assert.deepEqual(conv.messages.map((m) => m.subject), ['Message 9', 'Message 10', 'Message 11']);

    const found = await mailService.context({ scope: 'search', query: 'report' });
    assert.ok(found.messages.every((m) => !('body' in m)), 'a search never ships bodies');
    assert.ok(found.messages.every((m) => 'preview' in m));

    await assert.rejects(() => mailService.context({ scope: 'search' }), /needs a `query`/);
  });
  cleanup();
});

test('disconnecting forgets one account and leaves the other alone', async () => {
  connectBoth();
  assert.equal(listAccounts().length, 2);
  mailService.disconnect(GOOGLE_ID);
  const left = listAccounts();
  assert.equal(left.length, 1);
  assert.equal(left[0].email, 'work@example.com');
  assert.throws(() => mailService.disconnect('nope'), /No connected mail account/);
  cleanup();
});

test('sending will not guess which account when several are connected', async () => {
  connectBoth();
  // The guard that matters: with a personal and a work mailbox both connected,
  // an unnamed send would go out from whichever happened to be first.
  await assert.rejects(
    () => mailService.send({ draft: { to: ['someone@example.com'], subject: 'Hi', text: 'Hi' } }),
    /Say which account this message should come from/,
  );
  await assert.rejects(
    () => mailService.saveDraft({ draft: { to: ['someone@example.com'], subject: 'Hi' } }),
    /Say which account this draft should come from/,
  );
  cleanup();
});

test('one account connected: sending needs no ceremony', async () => {
  mailService.forgetAll();
  saveAccount({
    provider: 'google',
    email: 'personal@example.com',
    name: 'Personal',
    tokens: { access_token: 'g', refresh_token: 'gr', expires_at: Date.now() + 3_600_000 },
  });
  const fetchMock = mockFetch([{ match: (url) => url.includes('/messages/send'), reply: { id: 's1', threadId: 't1' } }]);
  await withFetch(fetchMock, async () => {
    const sent = await mailService.send({ draft: { to: ['someone@example.com'], subject: 'Hi', text: 'Hi' } });
    assert.equal(sent.sent, true);
  });
  cleanup();
});

test('a draft is checked before anything is sent', async () => {
  mailService.forgetAll();
  saveAccount({
    provider: 'google',
    email: 'personal@example.com',
    name: 'Personal',
    tokens: { access_token: 'g', refresh_token: 'gr', expires_at: Date.now() + 3_600_000 },
  });
  const fetchMock = mockFetch([{ match: () => true, reply: { id: 's1' } }]);

  await withFetch(fetchMock, async () => {
    await assert.rejects(() => mailService.send({ draft: { subject: 'Nobody' } }), /at least one recipient/);
    await assert.rejects(
      () => mailService.send({ draft: { to: ['not an address'], subject: 'x' } }),
      /is not an email address/,
    );
    assert.equal(fetchMock.calls.length, 0, 'nothing reached the provider');
  });
  cleanup();
});

test('no route exists to destroy mail permanently', async () => {
  mailService.forgetAll();
  saveAccount({
    provider: 'google',
    email: 'personal@example.com',
    name: 'Personal',
    tokens: { access_token: 'g', refresh_token: 'gr', expires_at: Date.now() + 3_600_000 },
  });
  for (const target of ['delete', 'permanent', 'sent', 'drafts', 'starred', 'important']) {
    await assert.rejects(
      () => mailService.move({ id: 'm1', mailbox: target }),
      /Mail can be moved to/,
      `"${target}" must not be a move target`,
    );
  }
  // And both providers say so, which is what the UI reads to hide the control.
  for (const provider of Object.values(mailService.providers)) {
    assert.equal(provider.capabilities().permanentDelete, false);
  }
  cleanup();
});
