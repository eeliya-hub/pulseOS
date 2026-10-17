import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCard, emptyProject } from '../board.js';
import { boardSummary, findCard, findColumn, findProject, landingColumn, pick, projectsOverview } from '../assistant.js';
import { pulseProject } from '../pulseSeed.js';

const TODAY = '2026-10-17';

function board() {
  const project = emptyProject({ name: 'Pulse OS' });
  const [todo, doing, done] = project.columns.map((c) => c.id);
  project.cards = [
    emptyCard({ title: 'A week view for Schedule', columnId: todo, due: '2026-10-24' }),
    emptyCard({ title: 'Week numbers in the grid', columnId: todo }),
    emptyCard({ title: 'Projects, as boards', columnId: doing, due: '2026-10-12', checklist: [{ id: 'a', label: 'x', done: true }, { id: 'b', label: 'y', done: false }] }),
    emptyCard({ title: 'Website icons stopped loading', columnId: done, done: true, due: '2026-10-14' }),
  ];
  return { project, todo, doing, done };
}

test('pick: exact beats a prefix beats a mention, and a tie is not a pick', () => {
  const items = ['Week numbers in the grid', 'A week view for Schedule', 'Weekly review'];
  assert.equal(pick(items, 'weekly review', (x) => x).found, 'Weekly review');
  assert.equal(pick(items, 'week numbers', (x) => x).found, 'Week numbers in the grid');
  // "week" is in all three — that is a question, not an answer.
  assert.equal(pick(items, 'week', (x) => x).matches.length, 3);
  // A loose name with the card's name inside it still finds it.
  assert.equal(pick(['Week view'], 'the week view card', (x) => x).found, 'Week view');
  assert.equal(pick(items, 'holiday', (x) => x).error, 'none');
  assert.equal(pick(items, '   ', (x) => x).error, 'empty');
});

test('findProject: by name, or the one that is open', () => {
  const a = emptyProject({ name: 'Pulse OS' });
  const b = emptyProject({ name: 'Dissertation' });
  const state = { projects: [a, b], activeId: b.id };
  assert.equal(findProject(state, 'pulse').found, a);
  assert.equal(findProject(state).found, b, 'not naming one means the one on screen');
  assert.equal(findProject({ projects: [], activeId: null }).error, 'none');
  // An archived project is not a candidate.
  assert.equal(findProject({ projects: [{ ...a, archived: true }, b], activeId: b.id }, 'pulse').error, 'none');
});

test('findColumn: "done" means the finishing list, whatever it is called', () => {
  const pulse = pulseProject(); // its finishing list is "Shipped"
  assert.equal(findColumn(pulse, 'done').found.name, 'Shipped');
  assert.equal(findColumn(pulse, 'finished').found.name, 'Shipped');
  assert.equal(findColumn(pulse, 'up next').found.name, 'Up next');
  assert.equal(findColumn(pulse, 'building').found.name, 'Building');
  const { project } = board(); // a fresh board's is "Done"
  assert.equal(findColumn(project, 'complete').found.name, 'Done');
});

test('landingColumn: something new never arrives already finished', () => {
  const { project } = board();
  assert.equal(landingColumn(project).name, 'To do');
  assert.equal(landingColumn(pulseProject()).name, 'Ideas');
  const allDone = { ...project, columns: project.columns.map((c) => ({ ...c, done: true })) };
  assert.equal(landingColumn(allDone).name, 'To do', 'with no other choice, the first list');
  assert.equal(landingColumn({ columns: [] }), null);
});

test('findCard: by title, within the project', () => {
  const { project } = board();
  assert.equal(findCard(project, 'week view').found.title, 'A week view for Schedule');
  assert.equal(findCard(project, 'week').matches.length, 2);
  assert.equal(findCard(project, 'holiday').error, 'none');
});

test('boardSummary reads a board out, with what is late pulled to the front', () => {
  const { project } = board();
  const summary = boardSummary(project, { today: TODAY });
  assert.equal(summary.name, 'Pulse OS');
  assert.equal(summary.total, 4);
  assert.equal(summary.done, 1);
  assert.deepEqual(summary.overdue, ['Projects, as boards'], 'a done card is never late');
  assert.deepEqual(summary.lists.map((l) => [l.name, l.count]), [['To do', 2], ['Doing', 1], ['Done', 1]]);
  assert.equal(summary.lists[2].finishing, true);
  const doing = summary.lists[1].cards[0];
  assert.equal(doing.overdue, true);
  assert.equal(doing.checklist, '1/2');
  assert.equal(summary.truncated, undefined);
});

test('boardSummary stops at its limit and says so', () => {
  const summary = boardSummary(pulseProject(), { today: TODAY, limit: 5 });
  assert.equal(summary.lists.reduce((n, l) => n + l.cards.length, 0), 5);
  assert.equal(summary.truncated, true);
  assert.equal(summary.total, pulseProject().cards.length, 'the count is still the whole board');
});

test('projectsOverview: one line a project', () => {
  const { project } = board();
  const other = emptyProject({ name: 'Dissertation' });
  const lines = projectsOverview({ projects: [project, other], activeId: other.id }, { today: TODAY });
  assert.deepEqual(lines, [
    { name: 'Pulse OS', cards: 4, open: 3, overdue: 1 },
    { name: 'Dissertation', cards: 0, open: 0, overdue: 0, open_now: true },
  ]);
});
