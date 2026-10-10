import assert from 'node:assert/strict';
import test from 'node:test';
import { gmailMessage, mockFetch, withFetch } from './helpers.js';
import { gmailProvider } from '../gmail.provider.js';
import { saveAccount, readAccount, forgetAccount } from '../accounts.js';

/* A connected Gmail account, with a token that is valid for an hour. */
function account({ expired = false } = {}) {
  const id = saveAccount({
    provider: 'google',
    email: 'eeliya@example.com',
    name: 'Eeliya',
    tokens: {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_at: expired ? Date.now() - 1000 : Date.now() + 3_600_000,
    },
  });
  return readAccount('google', id);
}

const cleanup = () => forgetAccount('google', 'google-eeliya-example-com');

const listRoute = (ids) => ({
  match: (url, method) => url.includes('/messages?') && method === 'GET',
  reply: { messages: ids.map((id) => ({ id, threadId: `t-${id}` })), resultSizeEstimate: ids.length, nextPageToken: 'PAGE2' },
});

const getRoute = (byId) => ({
  match: (url, method) => /\/messages\/[^/?]+(\?|$)/.test(url) && method === 'GET',
  reply: ({ url }) => {
    const id = url.match(/\/messages\/([^/?]+)/)[1];
    return byId[id] ?? gmailMessage({ id });
  },
});

test('listMessages: inbox asks for the INBOX label and maps each message', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    listRoute(['m1', 'm2']),
    getRoute({
      m1: gmailMessage({ id: 'm1', labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'], subject: 'Report due' }),
      m2: gmailMessage({ id: 'm2', labelIds: ['INBOX', 'STARRED'], subject: 'Lunch?' }),
    }),
  ]);

  await withFetch(fetchMock, async () => {
    const page = await gmailProvider.listMessages(acct, { mailbox: 'inbox', limit: 25 });

    const list = fetchMock.to('/messages?')[0];
    assert.match(list.url, /labelIds=INBOX/, 'scopes to the INBOX label');
    assert.match(list.url, /maxResults=25/);
    assert.equal(list.headers.authorization, 'Bearer access-1', 'sends the stored token');

    // Headers come from a metadata fetch per row, not from the list call.
    assert.equal(fetchMock.to('format=metadata').length, 2);

    assert.equal(page.messages.length, 2);
    assert.equal(page.nextPageToken, 'PAGE2');
    const [first, second] = page.messages;
    assert.equal(first.subject, 'Report due');
    assert.deepEqual(first.from, { name: 'Jane Doe', email: 'jane@example.com' });
    assert.equal(first.unread, true);
    assert.equal(first.important, true);
    // Important and Starred are overlays on wherever the mail actually lives,
    // the same way they are on Graph — so a flagged inbox message is in both.
    assert.deepEqual(first.mailboxes, ['inbox', 'important']);
    assert.equal(second.starred, true);
    assert.equal(second.unread, false);
    // A listing carries no body — that is what makes it safe to cache on disk.
    assert.equal(second.body, undefined);
  });
  cleanup();
});

test('listMessages: archive is a search, since Gmail has no Archive label', async () => {
  const acct = account();
  const fetchMock = mockFetch([listRoute([]), getRoute({})]);
  await withFetch(fetchMock, async () => {
    await gmailProvider.listMessages(acct, { mailbox: 'archive' });
    const url = decodeURIComponent(fetchMock.to('/messages?')[0].url);
    assert.match(url, /-in:inbox/);
    assert.match(url, /-in:trash/);
    assert.match(url, /-in:spam/);
    assert.doesNotMatch(url, /labelIds/, 'no label is used for archive');
  });
  cleanup();
});

test('listMessages: searching spam says so, or Gmail excludes it', async () => {
  const acct = account();
  const fetchMock = mockFetch([listRoute([]), getRoute({})]);
  await withFetch(fetchMock, async () => {
    await gmailProvider.listMessages(acct, { mailbox: 'spam', q: 'invoice' });
    const url = decodeURIComponent(fetchMock.to('/messages?')[0].url);
    assert.match(url, /in:spam/, 'asks for spam explicitly alongside the query');
    assert.match(url, /invoice/);
  });
  cleanup();
});

test('listMessages: unread filter and category label combine', async () => {
  const acct = account();
  const fetchMock = mockFetch([listRoute([]), getRoute({})]);
  await withFetch(fetchMock, async () => {
    await gmailProvider.listMessages(acct, { mailbox: 'inbox', category: 'promotions', unread: true });
    const url = decodeURIComponent(fetchMock.to('/messages?')[0].url);
    assert.match(url, /labelIds=INBOX/);
    assert.match(url, /labelIds=CATEGORY_PROMOTIONS/);
    assert.match(url, /is:unread/);
  });
  cleanup();
});

test('getMessage: walks the MIME tree for body and attachments', async () => {
  const acct = account();
  const full = gmailMessage({
    id: 'm9',
    text: 'Send the final report by Friday.',
    html: '<p>Send the <b>final report</b> by Friday.</p>',
    attachments: [{ id: 'att1', name: 'brief.pdf', size: 8421 }],
  });
  const fetchMock = mockFetch([getRoute({ m9: full })]);

  await withFetch(fetchMock, async () => {
    const msg = await gmailProvider.getMessage(acct, 'm9');
    assert.match(fetchMock.to('/messages/m9')[0].url, /format=full/);
    assert.equal(msg.body.html, '<p>Send the <b>final report</b> by Friday.</p>');
    assert.equal(msg.body.text, 'Send the final report by Friday.');
    assert.equal(msg.attachments.length, 1);
    assert.equal(msg.attachments[0].name, 'brief.pdf');
    assert.equal(msg.hasAttachments, true);
  });
  cleanup();
});

test('a message in no mailbox is archived, not nowhere', async () => {
  const acct = account();
  const fetchMock = mockFetch([getRoute({ m5: gmailMessage({ id: 'm5', labelIds: [] }) })]);
  await withFetch(fetchMock, async () => {
    const msg = await gmailProvider.getMessage(acct, 'm5');
    assert.deepEqual(msg.mailboxes, ['archive']);
  });
  cleanup();
});

test('patchMessage: each flag becomes the right label change', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    { match: (url, method) => url.includes('/modify') && method === 'POST', reply: { id: 'm1', labelIds: ['INBOX'] } },
  ]);

  await withFetch(fetchMock, async () => {
    await gmailProvider.patchMessage(acct, 'm1', { read: true });
    assert.deepEqual(fetchMock.calls.at(-1).body, { addLabelIds: [], removeLabelIds: ['UNREAD'] }, 'read removes UNREAD');

    await gmailProvider.patchMessage(acct, 'm1', { read: false });
    assert.deepEqual(fetchMock.calls.at(-1).body, { addLabelIds: ['UNREAD'], removeLabelIds: [] }, 'unread adds it back');

    await gmailProvider.patchMessage(acct, 'm1', { starred: true, important: false });
    assert.deepEqual(fetchMock.calls.at(-1).body, { addLabelIds: ['STARRED'], removeLabelIds: ['IMPORTANT'] });

    const nothing = await gmailProvider.patchMessage(acct, 'm1', {});
    assert.equal(nothing.unchanged, true, 'no flags means no request');
  });
  cleanup();
});

test('moveMessage: archive removes INBOX, trash uses the trash endpoint', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    { match: (url) => url.includes('/trash'), reply: { id: 'm1' } },
    { match: (url) => url.includes('/modify'), reply: { id: 'm1', labelIds: [] } },
  ]);

  await withFetch(fetchMock, async () => {
    await gmailProvider.moveMessage(acct, 'm1', 'archive');
    assert.deepEqual(fetchMock.calls.at(-1).body, { addLabelIds: [], removeLabelIds: ['INBOX'] });

    await gmailProvider.moveMessage(acct, 'm1', 'spam');
    assert.deepEqual(fetchMock.calls.at(-1).body, { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] });

    await gmailProvider.moveMessage(acct, 'm1', 'inbox');
    assert.deepEqual(fetchMock.calls.at(-1).body, { addLabelIds: ['INBOX'], removeLabelIds: ['SPAM', 'TRASH'] });

    await gmailProvider.moveMessage(acct, 'm1', 'trash');
    assert.match(fetchMock.calls.at(-1).url, /\/messages\/m1\/trash$/, 'binning is its own endpoint, and is reversible');

    // The scope granted cannot permanently delete, so nothing may try.
    await assert.rejects(() => gmailProvider.moveMessage(acct, 'm1', 'delete'), /Cannot move mail/);
  });
  cleanup();
});

test('sendMessage: posts RFC 2822 as base64url, and threads a reply', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    { match: (url, method) => url.includes('/messages/send') && method === 'POST', reply: { id: 'sent1', threadId: 't1' } },
  ]);

  await withFetch(fetchMock, async () => {
    await gmailProvider.sendMessage(acct, {
      to: [{ name: 'Jane', email: 'jane@example.com' }],
      subject: 'Re: Report',
      text: 'Friday works.',
      threadId: 't1',
      inReplyTo: '<m1@mail>',
      references: '<m1@mail>',
    });

    const sent = fetchMock.calls.at(-1);
    assert.equal(sent.body.threadId, 't1', 'the thread keeps the reply in its conversation');
    const raw = Buffer.from(sent.body.raw, 'base64url').toString('utf8');
    assert.match(raw, /^From: eeliya@example\.com$/m, 'from is the connected account');
    assert.match(raw, /^To: "Jane" <jane@example\.com>$/m);
    assert.match(raw, /^Subject: Re: Report$/m);
    assert.match(raw, /^In-Reply-To: <m1@mail>$/m, 'without this a reply starts a new thread for the recipient');
    assert.match(raw, /^References: <m1@mail>$/m);
    assert.equal(Buffer.from(raw.split('\r\n\r\n')[1].trim(), 'base64').toString('utf8'), 'Friday works.');
  });
  cleanup();
});

test('a draft carries both ids, so editing it does not make a second one', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    { match: (url, method) => /\/drafts(\?|$)/.test(url) && method === 'GET', reply: { drafts: [{ id: 'draft-1', message: { id: 'msg-1' } }] } },
    getRoute({ 'msg-1': gmailMessage({ id: 'msg-1', labelIds: ['DRAFT'], subject: 'Half written' }) }),
  ]);

  await withFetch(fetchMock, async () => {
    const page = await gmailProvider.listDrafts(acct);
    assert.equal(page.messages[0].draftId, 'draft-1', 'the draft id is what updates it');
    assert.equal(page.messages[0].id, 'msg-1', 'the message id is what reads it');
    assert.equal(page.messages[0].draft, true);
  });
  cleanup();
});

test('an expiring token is refreshed before the call, and the new one stored', async () => {
  const acct = account({ expired: true });
  const fetchMock = mockFetch([
    {
      match: (url) => url.includes('oauth2.googleapis.com/token'),
      reply: { access_token: 'access-2', expires_in: 3600, refresh_token: 'refresh-2' },
    },
    getRoute({ m1: gmailMessage({ id: 'm1' }) }),
  ]);

  await withFetch(fetchMock, async () => {
    await gmailProvider.getMessage(acct, 'm1');
    const refreshCall = fetchMock.to('oauth2.googleapis.com/token')[0];
    assert.ok(refreshCall, 'refreshed rather than using the stale token');
    assert.match(refreshCall.body, /grant_type=refresh_token/);
    assert.equal(fetchMock.to('/messages/m1')[0].headers.authorization, 'Bearer access-2');

    const stored = readAccount('google', acct.id);
    assert.equal(stored.access_token, 'access-2');
    assert.equal(stored.refresh_token, 'refresh-2', 'a rotated refresh token must replace the old one');
  });
  cleanup();
});

test('a revoked sign-in is marked dead rather than looking connected', async () => {
  const acct = account({ expired: true });
  const fetchMock = mockFetch([
    {
      match: (url) => url.includes('oauth2.googleapis.com/token'),
      status: 400,
      reply: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
    },
  ]);

  await withFetch(fetchMock, async () => {
    await assert.rejects(() => gmailProvider.getMessage(acct, 'm1'), /expired|reconnect/i);
    const stored = readAccount('google', acct.id);
    assert.equal(stored.deadGrant, true, 'so the UI can offer Reconnect against the right address');
    assert.equal(stored.account.email, 'eeliya@example.com', 'the account itself is not forgotten');
  });
  cleanup();
});

test('one unreadable message does not empty the page', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    listRoute(['ok1', 'broken', 'ok2']),
    {
      match: (url, method) => url.includes('/messages/broken') && method === 'GET',
      status: 500,
      reply: { error: { message: 'boom' } },
    },
    getRoute({ ok1: gmailMessage({ id: 'ok1' }), ok2: gmailMessage({ id: 'ok2' }) }),
  ]);

  await withFetch(fetchMock, async () => {
    const page = await gmailProvider.listMessages(acct, { mailbox: 'inbox' });
    assert.equal(page.messages.length, 2, 'the two that could be read still arrive');
  });
  cleanup();
});
