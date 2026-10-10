import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAPH_FOLDER_ROUTE, graphMessage, mockFetch, withFetch } from './helpers.js';
import { microsoftProvider } from '../microsoft.provider.js';
import { forgetAccount, readAccount, saveAccount } from '../accounts.js';

const ID = 'microsoft-work-example-com';

function account() {
  // A fresh id each run would leave the folder cache keyed to a stale account.
  forgetAccount('microsoft', ID);
  const id = saveAccount({
    provider: 'microsoft',
    email: 'work@example.com',
    name: 'Eeliya at Work',
    tokens: { access_token: 'ms-access', refresh_token: 'ms-refresh', expires_at: Date.now() + 3_600_000 },
  });
  return readAccount('microsoft', id);
}
const cleanup = () => forgetAccount('microsoft', ID);

const folderRoute = GRAPH_FOLDER_ROUTE;

test('listMessages: a real folder is a path, a flag is a filter', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    folderRoute,
    { match: (url) => url.includes('/messages'), reply: { value: [graphMessage({ id: 'g1' })] } },
  ]);

  await withFetch(fetchMock, async () => {
    await microsoftProvider.listMessages(acct, { mailbox: 'inbox' });
    assert.match(decodeURIComponent(fetchMock.to('/messages')[0].url), /mailFolders\/inbox\/messages/);

    fetchMock.reset();
    await microsoftProvider.listMessages(acct, { mailbox: 'starred' });
    const starred = decodeURIComponent(fetchMock.to('/messages')[0].url);
    // Flagged mail is scattered across folders, so it cannot be a folder path.
    assert.match(starred, /\/me\/messages/);
    assert.doesNotMatch(starred, /mailFolders/);
    assert.match(starred, /flag\/flagStatus eq 'flagged'/);

    fetchMock.reset();
    await microsoftProvider.listMessages(acct, { mailbox: 'important' });
    assert.match(decodeURIComponent(fetchMock.to('/messages')[0].url), /importance eq 'high'/);

    fetchMock.reset();
    await microsoftProvider.listMessages(acct, { mailbox: 'trash' });
    assert.match(decodeURIComponent(fetchMock.to('/messages')[0].url), /mailFolders\/deleteditems\/messages/);
  });
  cleanup();
});

test('listMessages: search never carries a filter, which Graph rejects', async () => {
  const acct = account();
  const fetchMock = mockFetch([folderRoute, { match: (url) => url.includes('/messages'), reply: { value: [] } }]);
  await withFetch(fetchMock, async () => {
    await microsoftProvider.listMessages(acct, { mailbox: 'inbox', q: 'report', unread: true });
    const url = decodeURIComponent(fetchMock.to('/messages')[0].url);
    assert.match(url, /\$search="report"/);
    assert.doesNotMatch(url, /\$filter/, '$search and $filter together are a 400 from Graph');
    assert.doesNotMatch(url, /\$orderby/, 'and so are $search and $orderby');
  });
  cleanup();
});

test('listMessages: unread without a search does use a filter', async () => {
  const acct = account();
  const fetchMock = mockFetch([folderRoute, { match: (url) => url.includes('/messages'), reply: { value: [] } }]);
  await withFetch(fetchMock, async () => {
    await microsoftProvider.listMessages(acct, { mailbox: 'inbox', unread: true });
    const url = decodeURIComponent(fetchMock.to('/messages')[0].url);
    assert.match(url, /\$filter=isRead eq false/);
    assert.match(url, /\$orderby=receivedDateTime desc/);
  });
  cleanup();
});

test('paging follows the whole URL Graph hands back', async () => {
  const acct = account();
  const next = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=ABC123';
  const fetchMock = mockFetch([
    folderRoute,
    { match: (url) => url.includes('$skiptoken'), reply: { value: [graphMessage({ id: 'page2' })] } },
    { match: (url) => url.includes('/messages'), reply: { value: [], '@odata.nextLink': next } },
  ]);

  await withFetch(fetchMock, async () => {
    const first = await microsoftProvider.listMessages(acct, { mailbox: 'inbox' });
    assert.equal(first.nextPageToken, next);
    const second = await microsoftProvider.listMessages(acct, { mailbox: 'inbox', pageToken: next });
    assert.equal(second.messages[0].id, 'page2');
    assert.ok(fetchMock.to('$skiptoken').length, 'the continuation URL is fetched as given');
  });
  cleanup();
});

test('a message knows which folder it is in, by name not by opaque id', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    folderRoute,
    {
      match: (url) => url.includes('/messages'),
      reply: {
        value: [
          graphMessage({ id: 'in', parentFolderId: 'FOLDER_INBOX', flagged: true }),
          graphMessage({ id: 'arch', parentFolderId: 'FOLDER_ARCHIVE', importance: 'high' }),
          graphMessage({ id: 'junk', parentFolderId: 'FOLDER_SPAM' }),
        ],
      },
    },
  ]);

  await withFetch(fetchMock, async () => {
    const page = await microsoftProvider.listMessages(acct, { mailbox: 'inbox' });
    const by = Object.fromEntries(page.messages.map((m) => [m.id, m.mailboxes]));
    assert.deepEqual(by.in, ['inbox', 'starred']);
    assert.deepEqual(by.arch, ['archive', 'important']);
    assert.deepEqual(by.junk, ['spam']);
  });
  cleanup();
});

test('Graph reports no Gmail-style categories, rather than four empty ones', () => {
  assert.deepEqual(microsoftProvider.capabilities().categories, []);
  assert.equal(microsoftProvider.capabilities().permanentDelete, false);
});

test('patchMessage: flags map to Graph properties', async () => {
  const acct = account();
  const fetchMock = mockFetch([{ match: (url, method) => method === 'PATCH', reply: {} }]);
  await withFetch(fetchMock, async () => {
    await microsoftProvider.patchMessage(acct, 'g1', { read: true });
    assert.deepEqual(fetchMock.calls.at(-1).body, { isRead: true });

    await microsoftProvider.patchMessage(acct, 'g1', { starred: true });
    assert.deepEqual(fetchMock.calls.at(-1).body, { flag: { flagStatus: 'flagged' } });

    await microsoftProvider.patchMessage(acct, 'g1', { starred: false, important: true });
    assert.deepEqual(fetchMock.calls.at(-1).body, { flag: { flagStatus: 'notFlagged' }, importance: 'high' });
  });
  cleanup();
});

test('moveMessage names a well-known folder, and refuses anything else', async () => {
  const acct = account();
  const fetchMock = mockFetch([{ match: (url) => url.includes('/move'), reply: {} }]);
  await withFetch(fetchMock, async () => {
    await microsoftProvider.moveMessage(acct, 'g1', 'archive');
    assert.deepEqual(fetchMock.calls.at(-1).body, { destinationId: 'archive' });

    await microsoftProvider.moveMessage(acct, 'g1', 'trash');
    assert.deepEqual(fetchMock.calls.at(-1).body, { destinationId: 'deleteditems' });

    await microsoftProvider.moveMessage(acct, 'g1', 'spam');
    assert.deepEqual(fetchMock.calls.at(-1).body, { destinationId: 'junkemail' });

    await assert.rejects(() => microsoftProvider.moveMessage(acct, 'g1', 'nowhere'), /Cannot move mail/);
  });
  cleanup();
});

test('a fresh message goes through sendMail', async () => {
  const acct = account();
  const fetchMock = mockFetch([{ match: (url) => url.includes('/sendMail'), reply: {} }]);
  await withFetch(fetchMock, async () => {
    await microsoftProvider.sendMessage(acct, {
      to: [{ name: 'Jane', email: 'jane@example.com' }],
      subject: 'Hello',
      html: '<p>Hi</p>',
    });
    const sent = fetchMock.calls.at(-1);
    assert.match(sent.url, /\/me\/sendMail$/);
    assert.equal(sent.body.saveToSentItems, true, 'so it appears in Sent, as the user expects');
    assert.equal(sent.body.message.body.contentType, 'HTML');
    assert.deepEqual(sent.body.message.toRecipients[0].emailAddress, { address: 'jane@example.com', name: 'Jane' });
  });
  cleanup();
});

test('a reply goes through createReply, so it threads for the recipient too', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    { match: (url) => url.includes('/createReply'), reply: { id: 'reply-draft', conversationId: 'c1' } },
    { match: (url, method) => method === 'PATCH', reply: { id: 'reply-draft' } },
    { match: (url) => url.includes('/send'), reply: {} },
  ]);

  await withFetch(fetchMock, async () => {
    const result = await microsoftProvider.sendMessage(acct, {
      replyToMessageId: 'g1',
      subject: 'Re: Hello',
      text: 'Friday works.',
      to: [],
    });

    const urls = fetchMock.calls.map((c) => `${c.method} ${c.url.replace('https://graph.microsoft.com/v1.0', '')}`);
    assert.deepEqual(urls, [
      'POST /me/messages/g1/createReply',
      'PATCH /me/messages/reply-draft',
      'POST /me/messages/reply-draft/send',
    ]);

    // Graph forbids setting In-Reply-To directly, so createReply must build the
    // draft — and its recipients must survive our patch.
    const patch = fetchMock.calls[1].body;
    assert.equal(patch.toRecipients, undefined, 'an empty To would send the reply to nobody');
    assert.equal(patch.body.content, 'Friday works.');
    assert.equal(result.threadId, 'c1');
  });
  cleanup();
});

test('replyAll uses createReplyAll', async () => {
  const acct = account();
  const fetchMock = mockFetch([
    { match: (url) => url.includes('/createReplyAll'), reply: { id: 'ra', conversationId: 'c1' } },
    { match: (url, method) => method === 'PATCH', reply: { id: 'ra' } },
    { match: (url) => url.includes('/send'), reply: {} },
  ]);
  await withFetch(fetchMock, async () => {
    await microsoftProvider.sendMessage(acct, { replyToMessageId: 'g1', replyAll: true, text: 'ok', to: [] });
    assert.ok(fetchMock.to('/createReplyAll').length === 1);
  });
  cleanup();
});

test('mailbox counts come from the folders, and are null where none exists', async () => {
  const acct = account();
  const fetchMock = mockFetch([folderRoute]);
  await withFetch(fetchMock, async () => {
    const boxes = await microsoftProvider.listMailboxes(acct);
    const by = Object.fromEntries(boxes.map((b) => [b.id, b.unread]));
    assert.equal(by.inbox, 7);
    assert.equal(by.drafts, 2);
    assert.equal(by.spam, 30);
    // No folder behind these two, so no count — and the sidebar shows no badge
    // rather than a misleading zero.
    assert.equal(by.starred, null);
    assert.equal(by.important, null);
  });
  cleanup();
});

/*
 * The bug that made a correctly connected Outlook account look empty.
 *
 * The folder index listed `/me/mailFolders` with `wellKnownName` in the
 * `$select`. That works on a work or school account and is rejected outright
 * on a personal one — @outlook.com, @hotmail.com — with a 400 that took out
 * every listing downstream, because they all resolve `parentFolderId` here.
 *
 * Each of these signs in as a different address on purpose: the folder index
 * is cached for ten minutes against the account id, so two tests sharing one
 * would have the second reading the first's answers.
 */
function personalAccount(email) {
  const id = saveAccount({
    provider: 'microsoft',
    email,
    name: 'Eeliya',
    tokens: { access_token: 'ms-access', refresh_token: 'ms-refresh', expires_at: Date.now() + 3_600_000 },
  });
  return { account: readAccount('microsoft', id), forget: () => forgetAccount('microsoft', id) };
}

test('the folder index never asks for wellKnownName', async () => {
  const { account: acct, forget } = personalAccount('someone@hotmail.com');
  try {
    const fetchMock = mockFetch([folderRoute]);
    await withFetch(fetchMock, () => microsoftProvider.listMailboxes(acct));

    const folderCalls = fetchMock.to('/me/mailFolders');
    assert.ok(folderCalls.length > 0, 'it asks about folders at all');
    for (const call of folderCalls) {
      assert.doesNotMatch(decodeURIComponent(call.url), /wellKnownName/, `asked for wellKnownName: ${call.url}`);
    }
    // And it asks for each by name in the path, which both account types take.
    assert.match(decodeURIComponent(folderCalls[0].url), /\/me\/mailFolders\/[a-z]+/);
  } finally {
    forget();
  }
});

test('a mailbox the account does not have is absent, not fatal', async () => {
  const { account: acct, forget } = personalAccount('nofolder@hotmail.com');
  try {
    // Archive does not exist on every mailbox; a 404 for it must not empty the
    // other five, nor read as a failure of the whole account.
    const fetchMock = mockFetch([
      {
        match: (url) => url.includes('/me/mailFolders/archive'),
        status: 404,
        reply: { error: { code: 'ErrorFolderNotFound', message: 'not found' } },
      },
      folderRoute,
    ]);
    const boxes = await withFetch(fetchMock, () => microsoftProvider.listMailboxes(acct));
    const by = (id) => boxes.find((b) => b.id === id);
    assert.equal(by('inbox').unread, 7, 'the inbox still counts');
    assert.equal(by('archive').unread, null, 'archive is uncounted rather than zero');
  } finally {
    forget();
  }
});

/*
 * The second of the same mistake, and the reason both are pinned.
 *
 * Graph types the `attachments` collection as the base
 * `microsoft.graph.attachment`, which carries only what every attachment kind
 * shares. `contentId` is on the derived `fileAttachment`, so asking for it by
 * its bare name is a 400 — and that 400 meant no Outlook message would open.
 */
test('opening a message asks for contentId on the type that has it', async () => {
  const { account: acct, forget } = personalAccount('attach@hotmail.com');
  try {
    const fetchMock = mockFetch([
      folderRoute,
      {
        match: (url) => /\/me\/messages\/[^/]+\?/.test(url),
        reply: graphMessage({ id: 'm9', body: { contentType: 'html', content: '<p>Hi</p>' } }),
      },
    ]);
    await withFetch(fetchMock, () => microsoftProvider.getMessage(acct, 'm9'));

    const url = decodeURIComponent(fetchMock.to('/me/messages/m9')[0].url);
    assert.match(url, /\$expand=attachments\(/, 'it expands the attachments');
    assert.match(url, /microsoft\.graph\.fileAttachment\/contentId/, 'contentId is cast to the type that declares it');
    assert.doesNotMatch(url, /[,(]contentId/, 'and is never asked for bare');
    // Not selecting at all would drag every attachment's base64 down with it.
    assert.doesNotMatch(url, /\$expand=attachments\)/, 'the expand still selects');
  } finally {
    forget();
  }
});
