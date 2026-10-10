import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bumpMailboxes,
  bumpUnread,
  dedupe,
  flagFields,
  listKey,
  mergeCapabilities,
  parseKey,
  patchLists,
  removeFromLists,
  restoreLists,
  revert,
  strip,
  unreadDelta,
  unreadFor,
} from '../store.js';

const msg = (over = {}) => ({ id: 'm1', accountId: 'acct-a', subject: 'Hi', unread: true, date: '2026-10-07T09:00:00Z', ...over });

const lists = () => ({
  'all:inbox:::': { messages: [msg(), msg({ id: 'm2', unread: false })] },
  'acct-a:inbox:::': { messages: [msg()] },
  'all:starred:::': { messages: [msg({ id: 'm9' })] },
});

const summary = () => ({ unread: 9, accounts: [{ id: 'acct-a', unread: 6 }, { id: 'acct-b', unread: 3 }] });

test('a body can never reach the thing that gets written to disk', () => {
  const headers = strip({ ...msg(), body: { html: '<p>secret</p>', text: 'secret' }, attachments: [{ id: 'a1' }] });
  assert.equal(headers.body, undefined);
  assert.equal(headers.attachments, undefined);
  assert.equal(headers.subject, 'Hi', 'the headers themselves survive, which is what makes the first paint instant');
  assert.ok(!JSON.stringify(headers).includes('secret'));
});

test('a listing key round-trips', () => {
  for (const options of [
    { mailbox: 'inbox' },
    { accountId: 'acct-a', mailbox: 'starred' },
    { mailbox: 'inbox', category: 'promotions' },
    { mailbox: 'inbox', query: 'Report', unread: true },
  ]) {
    const back = parseKey(listKey(options));
    assert.equal(back.mailbox, options.mailbox);
    assert.equal(back.accountId, options.accountId);
    assert.equal(back.category, options.category);
    assert.equal(back.unread, Boolean(options.unread));
    // The query is lower-cased into the key, which is right: it is a cache key,
    // and searching for "Report" and "report" is the same search.
    assert.equal(back.query, options.query?.toLowerCase());
  }
});

test('unreadDelta moves only when the state actually changes', () => {
  assert.equal(unreadDelta(msg({ unread: true }), { read: true }), -1, 'reading an unread message');
  assert.equal(unreadDelta(msg({ unread: false }), { read: false }), 1, 'marking a read one unread');
  assert.equal(unreadDelta(msg({ unread: false }), { read: true }), 0, 'already read — no change');
  assert.equal(unreadDelta(msg({ unread: true }), { read: false }), 0, 'already unread — no change');
  // The bug this file exists for: a star is not a read state and must not move
  // the unread figure at all.
  assert.equal(unreadDelta(msg({ unread: true }), { starred: true }), 0);
  assert.equal(unreadDelta(msg(), {}), 0);
  assert.equal(unreadDelta(msg(), null), 0);
});

test('bumpUnread moves the whole and the one account, and never below zero', () => {
  const read = bumpUnread(summary(), 'acct-a', -1);
  assert.equal(read.unread, 8);
  assert.equal(read.accounts.find((a) => a.id === 'acct-a').unread, 5);
  assert.equal(read.accounts.find((a) => a.id === 'acct-b').unread, 3, 'the other account is untouched');

  assert.equal(bumpUnread({ unread: 0, accounts: [{ id: 'acct-a', unread: 0 }] }, 'acct-a', -1).unread, 0, 'never below zero');

  // A zero delta hands back the very same object, so a render that had nothing
  // to change is not given a new one to diff.
  const same = summary();
  assert.equal(bumpUnread(same, 'acct-a', 0), same);
  assert.equal(bumpUnread(null, 'acct-a', -1), null);

  // An account id that is not in the summary changes the total and nothing else.
  const unknown = bumpUnread(summary(), 'acct-zzz', -1);
  assert.equal(unknown.unread, 8);
  assert.deepEqual(unknown.accounts, summary().accounts);
});

test('a flag change reaches every listing the message appears in', () => {
  const next = patchLists(lists(), msg(), { read: true, unread: false });
  assert.equal(next['all:inbox:::'].messages[0].unread, false);
  assert.equal(next['acct-a:inbox:::'].messages[0].unread, false, 'the per-account listing too');
  assert.equal(next['all:inbox:::'].messages[1].unread, false, 'a different message is left alone');
  assert.equal(next['all:starred:::'].messages[0].unread, true, 'and so is a different id');
});

test('an id is only unique within its account', () => {
  const twoAccounts = {
    'all:inbox:::': { messages: [msg({ accountId: 'acct-a' }), msg({ accountId: 'acct-b' })] },
  };
  const next = patchLists(twoAccounts, msg({ accountId: 'acct-a' }), { unread: false });
  assert.equal(next['all:inbox:::'].messages[0].unread, false);
  assert.equal(
    next['all:inbox:::'].messages[1].unread,
    true,
    'the same id in another mailbox is a different message and must not change',
  );
});

test('revert restores the flags as they were, not the opposite of what was asked', () => {
  // Marking an unread message read, then failing: it goes back to unread.
  assert.deepEqual(revert({ read: true }, msg({ unread: true })), { read: false });
  // Marking a read message unread, then failing: it goes back to read.
  assert.deepEqual(revert({ read: false }, msg({ unread: false })), { read: true });
  // A star that failed goes back to however it was, which is the point: the
  // opposite of the request is wrong when the request was already the state.
  assert.deepEqual(revert({ starred: true }, msg({ starred: false })), { starred: false });
  assert.deepEqual(revert({ starred: false }, msg({ starred: true })), { starred: true });
});

test('archiving removes every copy, and a refusal puts them all back', () => {
  const before = lists();
  const { lists: after, removed } = removeFromLists(before, msg());
  assert.equal(after['all:inbox:::'].messages.length, 1, 'gone from the unified inbox');
  assert.equal(after['acct-a:inbox:::'].messages.length, 0, 'and from the account listing');
  assert.equal(after['all:starred:::'].messages.length, 1, 'a different message stays');
  assert.equal(removed.length, 2, 'both copies remembered');

  const restored = restoreLists(after, removed);
  assert.deepEqual(
    restored['all:inbox:::'].messages.map((m) => m.id),
    ['m1', 'm2'],
    'back in its original position, not appended to the end',
  );
  assert.equal(restored['acct-a:inbox:::'].messages.length, 1);
});

test('restoring into a listing that has since shrunk does not throw', () => {
  const { removed } = removeFromLists(lists(), msg());
  const shrunk = { 'all:inbox:::': { messages: [] } };
  const restored = restoreLists(shrunk, removed);
  assert.equal(restored['all:inbox:::'].messages.length, 1);
  // Nothing to put back hands the listings straight back, untouched.
  const untouched = lists();
  assert.equal(restoreLists(untouched, []), untouched);
  assert.equal(restoreLists(untouched, undefined), untouched);

  // A listing that has gone away entirely is skipped rather than recreated.
  const elsewhere = restoreLists({ 'all:starred:::': { messages: [] } }, removed);
  assert.deepEqual(Object.keys(elsewhere), ['all:starred:::']);
});

test('pages that overlap yield one copy of each, newest first', () => {
  const merged = dedupe([
    msg({ id: 'a', date: '2026-10-01T00:00:00Z' }),
    msg({ id: 'c', date: '2026-10-05T00:00:00Z' }),
    msg({ id: 'a', date: '2026-10-01T00:00:00Z' }),
    msg({ id: 'b', date: '2026-10-03T00:00:00Z' }),
    // Same id, different account: two different messages.
    msg({ id: 'a', accountId: 'acct-b', date: '2026-10-07T00:00:00Z' }),
  ]);
  assert.deepEqual(
    merged.map((m) => `${m.accountId}:${m.id}`),
    ['acct-b:a', 'acct-a:c', 'acct-a:b', 'acct-a:a'],
  );
});

test('capabilities are the union, and permanent delete is never in it', () => {
  const merged = mergeCapabilities([
    { capabilities: { mailboxes: ['inbox', 'starred'], categories: ['primary', 'social'], search: true, drafts: true, permanentDelete: false } },
    { capabilities: { mailboxes: ['inbox', 'archive'], categories: [], search: true, send: true, permanentDelete: false } },
  ]);
  assert.deepEqual(merged.mailboxes.sort(), ['archive', 'inbox', 'starred']);
  assert.deepEqual(merged.categories, ['primary', 'social'], "Gmail's categories survive being merged with Outlook's none");
  assert.equal(merged.send, true);
  assert.equal(merged.permanentDelete, false);

  const none = mergeCapabilities([]);
  assert.deepEqual(none.mailboxes, []);
  assert.equal(none.search, false);
});

test('an uncounted mailbox reports null, not zero', () => {
  const mailboxes = [
    { accountId: 'acct-a', mailboxes: [{ id: 'inbox', unread: 4 }, { id: 'starred', unread: null }] },
    { accountId: 'acct-b', mailboxes: [{ id: 'inbox', unread: 7 }, { id: 'starred', unread: null }] },
  ];
  assert.equal(unreadFor(mailboxes, 'inbox'), 11, 'summed across accounts');
  assert.equal(unreadFor(mailboxes, 'inbox', 'acct-b'), 7, 'or just the one in view');
  // Outlook keeps no folder behind Starred, so there is no count — and a zero
  // badge would say "nothing unread" rather than "not counted".
  assert.equal(unreadFor(mailboxes, 'starred'), null);
  assert.equal(unreadFor(mailboxes, 'spam'), null, 'a mailbox nobody reported is also null');
  assert.equal(unreadFor([], 'inbox'), null);
});

/*
 * The read/unread bug, pinned down.
 *
 * `setFlags` asks the provider for `{ read: true }`; a message records the
 * opposite field, `unread`. The optimistic patch used to spread the request
 * straight onto the row, setting a `read` property nothing renders and leaving
 * `unread` true — so the row stayed bold until a refresh replaced it with the
 * provider's copy. These are the assertions that fail on that version.
 */
test('a read flag reaches the field the row actually renders', () => {
  assert.deepEqual(flagFields({ read: true }), { unread: false });
  assert.deepEqual(flagFields({ read: false }), { unread: true });
  // Everything else is named the same on both sides.
  assert.deepEqual(flagFields({ starred: true }), { starred: true });
  assert.deepEqual(flagFields({ read: true, starred: false }), { unread: false, starred: false });
  assert.deepEqual(flagFields(undefined), {});
});

test('marking read dims the row without waiting for a refresh', () => {
  const message = { id: 'm1', accountId: 'a', unread: true, starred: false };
  const lists = { 'a:inbox:::': { messages: [message] } };
  const after = patchLists(lists, message, { read: true });
  assert.equal(after['a:inbox:::'].messages[0].unread, false);
  // And back again, for "mark as unread".
  const again = patchLists(after, message, { read: false });
  assert.equal(again['a:inbox:::'].messages[0].unread, true);
});

test('the sidebar badge moves with the row', () => {
  const mailboxes = [
    { accountId: 'a', mailboxes: [{ id: 'inbox', unread: 12 }, { id: 'starred', unread: null }] },
    { accountId: 'b', mailboxes: [{ id: 'inbox', unread: 3 }] },
  ];
  const after = bumpMailboxes(mailboxes, 'a', -1, 'inbox');
  assert.equal(after[0].mailboxes[0].unread, 11);
  // A mailbox nobody counts stays uncounted rather than becoming a zero.
  assert.equal(after[0].mailboxes[1].unread, null);
  // The other account is untouched.
  assert.equal(after[1].mailboxes[0].unread, 3);
  // It never goes below nothing, however many changes race.
  assert.equal(bumpMailboxes(mailboxes, 'b', -9, 'inbox')[1].mailboxes[0].unread, 0);
  // No change asked for, nothing rebuilt.
  assert.equal(bumpMailboxes(mailboxes, 'a', 0, 'inbox'), mailboxes);
});

test('a refused change puts the row back as it was', () => {
  const message = { id: 'm1', accountId: 'a', unread: true, starred: false };
  const lists = { 'a:inbox:::': { messages: [message] } };
  const optimistic = patchLists(lists, message, { read: true });
  assert.equal(optimistic['a:inbox:::'].messages[0].unread, false);
  // What useMail applies when the provider refuses, built from the original.
  const back = patchLists(optimistic, message, revert({ read: true }, message));
  assert.equal(back['a:inbox:::'].messages[0].unread, true);
});
