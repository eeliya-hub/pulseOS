import assert from 'node:assert/strict';
import test from 'node:test';
import { getProjects } from '../../../hooks/useProjects.js';
import { projectTools } from '../tools.js';

/**
 * The assistant's project tools, against the store itself.
 *
 * With no localStorage (as here) the store opens on the seeded Pulse OS
 * board, so these run against a real board of thirty-odd cards in four
 * lists — the same one the app shows on a fresh install.
 */

const board = () => getProjects().projects.find((p) => p.name === 'Pulse OS');
const card = (title) => board().cards.find((c) => c.title === title);
const listOf = (c) => board().columns.find((col) => col.id === c.columnId)?.name;

test('get_projects: every project, and the open one read out', async () => {
  const result = await projectTools.get_projects();
  assert.ok(result.projects.some((p) => p.name === 'Pulse OS'));
  assert.equal(result.board.name, 'Pulse OS');
  assert.deepEqual(result.board.lists.map((l) => l.name), ['Ideas', 'Up next', 'Building', 'Shipped']);
  assert.ok(result.board.lists.at(-1).finishing);
});

test('get_projects: a project that is not there says what is', async () => {
  const result = await projectTools.get_projects({ project: 'Dissertation' });
  assert.match(result.error, /No project called "Dissertation"/);
  assert.ok(result.projects.includes('Pulse OS'));
});

test('add_project_card: lands in the first list, with its date and notes', async () => {
  const result = await projectTools.add_project_card({
    title: 'Send Priya the Q4 deck',
    due: '2026-10-23',
    notes: 'From the email “Design review moved + the Q4 deck”',
  });
  assert.deepEqual(result, { added: true, project: 'Pulse OS', list: 'Ideas', title: 'Send Priya the Q4 deck', due: '2026-10-23' });
  const added = card('Send Priya the Q4 deck');
  assert.equal(listOf(added), 'Ideas');
  assert.equal(added.due, '2026-10-23');
  assert.match(added.notes, /Q4 deck/);
});

test('add_project_card: the same card twice is one card', async () => {
  const before = board().cards.length;
  const again = await projectTools.add_project_card({ title: 'send priya the Q4 deck' });
  assert.equal(again.duplicate, true);
  assert.equal(board().cards.length, before);
});

test('add_project_card: into a named list; a list that is not there is said so', async () => {
  const result = await projectTools.add_project_card({ title: 'Week numbers in the grid', list: 'up next' });
  assert.equal(result.list, 'Up next');
  const missing = await projectTools.add_project_card({ title: 'Anything', list: 'Backlog' });
  assert.match(missing.error, /no list called "Backlog"/);
  assert.deepEqual(missing.lists, ['Ideas', 'Up next', 'Building', 'Shipped']);
  // A date that is not a date is dropped rather than stored.
  const loose = await projectTools.add_project_card({ title: 'Loose date', due: 'next Friday' });
  assert.equal(loose.due, undefined);
  assert.equal(card('Loose date').due, null);
});

test('move_project_card: to "done" is the finishing list, and ticks it off', async () => {
  const result = await projectTools.move_project_card({ card: 'week view for schedule', to: 'done' });
  assert.equal(result.moved, true);
  assert.equal(result.from, 'Up next');
  assert.equal(result.to, 'Shipped');
  assert.equal(result.ticked_off, true);
  const moved = card('A week view for Schedule');
  assert.equal(listOf(moved), 'Shipped');
  assert.equal(moved.done, true, 'the finishing list ticks a card off');

  // And back out un-ticks it.
  await projectTools.move_project_card({ card: 'A week view for Schedule', to: 'building' });
  assert.equal(card('A week view for Schedule').done, false);
});

test('move_project_card: a name that fits two cards moves nothing and asks', async () => {
  const before = JSON.stringify(board().cards.map((c) => c.columnId));
  const result = await projectTools.move_project_card({ card: 'week', to: 'building' });
  assert.match(result.error, /More than one card/);
  assert.ok(result.matches.length >= 2);
  assert.equal(JSON.stringify(board().cards.map((c) => c.columnId)), before, 'nothing moved');
});

test('move_project_card: already there is not a move', async () => {
  const result = await projectTools.move_project_card({ card: 'Send Priya the Q4 deck', to: 'ideas' });
  assert.equal(result.moved, false);
  assert.equal(result.already, true);
});
