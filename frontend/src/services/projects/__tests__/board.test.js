import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays,
  cardsIn,
  dayKey,
  dueState,
  emptyCard,
  emptyProject,
  filterCards,
  fromLifeProjects,
  moveCard,
  moveColumn,
  progressOf,
  projectProgress,
  timelineOf,
} from '../board.js';
import { OLD_SEED_TITLES, SEED_VERSION, isDemoBoard, pulseProject, withPulseBoard } from '../pulseSeed.js';

/** A board with three lanes and three cards in the first, in a known order. */
function board() {
  const project = emptyProject({ name: 'Test' });
  const [todo, doing, done] = project.columns.map((c) => c.id);
  project.cards = ['A', 'B', 'C'].map((title) => emptyCard({ title, columnId: todo }));
  return { project, todo, doing, done };
}

const titles = (project, columnId) => cardsIn(project, columnId).map((c) => c.title);

test('a new project has three lanes, the last of them the finishing one', () => {
  const project = emptyProject();
  assert.equal(project.columns.length, 3);
  assert.deepEqual(project.columns.map((c) => c.name), ['To do', 'Doing', 'Done']);
  assert.equal(project.columns.at(-1).done, true);
});

test('a card moves to another lane, at the place it was dropped', () => {
  const { project, todo, doing } = board();
  const b = cardsIn(project, todo)[1];
  const after = moveCard(project, b.id, doing, 0);
  assert.deepEqual(titles(after, todo), ['A', 'C']);
  assert.deepEqual(titles(after, doing), ['B']);
});

test('reordering inside one lane counts positions with the card already lifted out', () => {
  // A B C, dragging A to the end. With A still counted the target index is 3;
  // with it lifted out first — which is what a drag actually is — it is 2.
  const { project, todo } = board();
  const a = cardsIn(project, todo)[0];
  assert.deepEqual(titles(moveCard(project, a.id, todo, 2), todo), ['B', 'C', 'A']);
  assert.deepEqual(titles(moveCard(project, a.id, todo, 1), todo), ['B', 'A', 'C']);
  assert.deepEqual(titles(moveCard(project, a.id, todo, 0), todo), ['A', 'B', 'C']);
});

test('an index past the end lands at the end rather than throwing it away', () => {
  const { project, todo } = board();
  const a = cardsIn(project, todo)[0];
  assert.deepEqual(titles(moveCard(project, a.id, todo, 99), todo), ['B', 'C', 'A']);
  assert.deepEqual(titles(moveCard(project, a.id, todo, null), todo), ['B', 'C', 'A']);
  assert.deepEqual(titles(moveCard(project, a.id, todo, -5), todo), ['A', 'B', 'C']);
});

test('the finishing lane ticks a card off, and leaving it un-ticks', () => {
  const { project, todo, done } = board();
  const a = cardsIn(project, todo)[0];
  const finished = moveCard(project, a.id, done, 0);
  assert.equal(cardsIn(finished, done)[0].done, true);
  const back = moveCard(finished, a.id, todo, 0);
  assert.equal(cardsIn(back, todo)[0].done, false);
});

test('moving a card that is not there changes nothing', () => {
  const { project, doing } = board();
  assert.equal(moveCard(project, 'nope', doing, 0), project);
});

test('cards in untouched lanes stay where they were', () => {
  const { project, todo, doing } = board();
  const withDoing = moveCard(project, cardsIn(project, todo)[0].id, doing, 0);
  const after = moveCard(withDoing, cardsIn(withDoing, todo)[0].id, todo, 1);
  assert.deepEqual(titles(after, doing), ['A'], 'the other lane is undisturbed');
  assert.deepEqual(titles(after, todo), ['C', 'B']);
});

test('columns reorder, and a bad index is clamped', () => {
  const project = emptyProject();
  const [, doing] = project.columns.map((c) => c.id);
  assert.deepEqual(moveColumn(project, doing, 0).columns.map((c) => c.name), ['Doing', 'To do', 'Done']);
  assert.deepEqual(moveColumn(project, doing, 99).columns.map((c) => c.name), ['To do', 'Done', 'Doing']);
  assert.equal(moveColumn(project, 'nope', 0), project);
});

test('a checklist reads as a fraction, and nothing when there is none', () => {
  assert.equal(progressOf(emptyCard()), null);
  const card = emptyCard({ checklist: [{ done: true }, { done: false }, { done: true }] });
  assert.deepEqual(progressOf(card), { done: 2, total: 3, ratio: 2 / 3 });
});

test('a project reads as a fraction of its cards', () => {
  const { project, todo } = board();
  assert.deepEqual(projectProgress(project), { done: 0, total: 3, ratio: 0 });
  const done = moveCard(project, cardsIn(project, todo)[0].id, project.columns.at(-1).id, 0);
  assert.equal(projectProgress(done).done, 1);
  assert.deepEqual(projectProgress(emptyProject()), { done: 0, total: 0, ratio: 0 });
});

test('where a card stands against today', () => {
  const today = '2026-10-13';
  assert.equal(dueState(emptyCard({ done: true, due: '2020-01-01' }), today), 'done');
  assert.equal(dueState(emptyCard({ due: '2026-10-12' }), today), 'overdue');
  assert.equal(dueState(emptyCard({ due: '2026-10-13' }), today), 'today');
  assert.equal(dueState(emptyCard({ due: '2026-10-20' }), today), 'soon');
  assert.equal(dueState(emptyCard(), today), null);
});

test('an untouched filter hides nothing', () => {
  const cards = [emptyCard({ title: 'One' }), emptyCard({ title: 'Two', done: true })];
  assert.equal(filterCards(cards, {}).length, 2);
  assert.equal(filterCards(cards).length, 2);
});

test('filters are all AND, and search reaches into the card', () => {
  const today = '2026-10-13';
  const cards = [
    emptyCard({ title: 'Ship the deck', labels: ['l1'], due: '2026-10-12' }),
    emptyCard({ title: 'Book flights', labels: ['l2'], due: '2026-10-13' }),
    emptyCard({ title: 'Idle', notes: 'mentions the deck in passing' }),
    emptyCard({ title: 'Checklisted', checklist: [{ label: 'deck review', done: false }] }),
  ];
  assert.equal(filterCards(cards, { text: 'deck' }, today).length, 3, 'title, notes and checklist all count');
  assert.equal(filterCards(cards, { labels: ['l1'] }, today).length, 1);
  assert.equal(filterCards(cards, { due: 'overdue' }, today).length, 1);
  assert.equal(filterCards(cards, { due: 'today' }, today).length, 1);
  assert.equal(filterCards(cards, { due: 'undated' }, today).length, 2);
  // AND: "deck" and overdue together is only the first.
  assert.equal(filterCards(cards, { text: 'deck', due: 'overdue' }, today).length, 1);
  // A label that nothing carries leaves nothing.
  assert.equal(filterCards(cards, { labels: ['nope'] }, today).length, 0);
});

test('the timeline spans its cards, with a day for the ones that are a point', () => {
  const today = '2026-10-13';
  const cards = [
    emptyCard({ title: 'Span', start: '2026-10-14', due: '2026-10-17' }),
    emptyCard({ title: 'Point', due: '2026-10-20' }),
    emptyCard({ title: 'Nowhere' }),
  ];
  const line = timelineOf(cards, { today, pad: 1 });
  assert.equal(line.undated, 1, 'the undated one is counted, not hidden');
  assert.equal(line.bars.length, 2);

  const span = line.bars.find((b) => b.card.title === 'Span');
  assert.equal(span.length, 4, '14th to 17th inclusive');
  const point = line.bars.find((b) => b.card.title === 'Point');
  assert.equal(point.length, 1, 'a due date alone is one day, not zero');

  assert.equal(line.start, '2026-10-12', 'today is included even when earlier than any card');
  assert.equal(line.end, '2026-10-21');
  assert.equal(line.days, 10);
});

test('a due date before its start is drawn the only way round it can be', () => {
  const line = timelineOf([emptyCard({ start: '2026-10-20', due: '2026-10-17' })], { today: '2026-10-18', pad: 0 });
  assert.equal(line.bars[0].length, 4);
  assert.ok(line.bars[0].offset >= 0, 'and never off the left of the chart');
});

test('a timeline with nothing dated still has a shape to draw', () => {
  const line = timelineOf([emptyCard(), emptyCard()], { today: '2026-10-13', pad: 2 });
  assert.equal(line.bars.length, 0);
  assert.equal(line.undated, 2);
  assert.ok(line.days > 0);
});

test('old Life Hub projects come across with their to-dos as cards', () => {
  const [project] = fromLifeProjects([
    { id: 'p1', name: 'Pulse OS', due: '2026-11-01', todos: [
      { id: 't1', label: 'Weather card polish', done: true },
      { id: 't2', label: 'Life Hub rebuild', done: false },
    ] },
  ]);
  assert.equal(project.id, 'p1');
  assert.equal(project.name, 'Pulse OS');
  assert.equal(project.due, '2026-11-01');
  assert.equal(project.cards.length, 2);

  const first = project.columns[0].id;
  const last = project.columns.at(-1).id;
  assert.deepEqual(titles(project, last), ['Weather card polish'], 'done work starts finished');
  assert.deepEqual(titles(project, first), ['Life Hub rebuild'], 'the rest starts at the beginning');
  assert.equal(project.cards.find((c) => c.title === 'Weather card polish').done, true);
});

test('dates', () => {
  assert.equal(addDays('2026-10-13', 3), '2026-10-16');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays(null, 1), null);
  assert.equal(dayKey(new Date('2026-10-13T23:30:00')), '2026-10-13', 'local, not UTC');
});

/* ── The Pulse OS board, and when it is allowed to replace what is stored ── */

test('the seeded board is a board: lanes, labels, history and plans', () => {
  const project = pulseProject();
  const lanes = project.columns.map((c) => c.name);
  assert.deepEqual(lanes, ['Ideas', 'Up next', 'Building', 'Shipped']);
  assert.equal(project.columns.at(-1).done, true, 'the last lane ticks things off');

  // Every card lands in a lane that exists and wears labels that exist.
  const columnIds = new Set(project.columns.map((c) => c.id));
  const labelIds = new Set(project.labels.map((l) => l.id));
  for (const card of project.cards) {
    assert.ok(columnIds.has(card.columnId), `${card.title} is in a real lane`);
    for (const id of card.labels) assert.ok(labelIds.has(id), `${card.title} wears a real label`);
    if (card.start && card.due) assert.ok(card.start <= card.due, `${card.title} does not end before it starts`);
  }

  const shipped = cardsIn(project, project.columns.at(-1).id);
  assert.ok(shipped.length >= 15, 'three months of it');
  assert.ok(shipped.every((c) => c.done), 'everything in the finishing lane is done');
  // History is dated where it happened; nothing shipped is dated in the future.
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(shipped.every((c) => !c.due || c.due <= today), 'nothing shipped from the future');

  const ideas = cardsIn(project, project.columns[0].id);
  assert.ok(ideas.length >= 6, 'and somewhere to go next');
  assert.ok(ideas.every((c) => !c.done), 'an idea is not done');
});

test('plans are dated against the day you read them, so none opens overdue', () => {
  const project = pulseProject();
  const planning = [...cardsIn(project, project.columns[1].id), ...cardsIn(project, project.columns[2].id)];
  assert.ok(planning.length >= 5);
  for (const card of planning) {
    if (card.due) assert.notEqual(dueState(card), 'overdue', `${card.title} should not open overdue`);
  }
});

test('the demonstration board is recognised; anybody\'s work is not', () => {
  // The four cards the old seed handed out, and nothing else.
  const demo = emptyProject({ name: 'Pulse OS' });
  demo.cards = [...OLD_SEED_TITLES].map((title) => emptyCard({ title, columnId: demo.columns[0].id }));
  assert.equal(isDemoBoard(demo), true);

  // One card of your own, and it is yours.
  assert.equal(isDemoBoard({ ...demo, cards: [...demo.cards, emptyCard({ title: 'Buy a plant' })] }), false);
  // A card renamed is a card touched.
  assert.equal(isDemoBoard({ ...demo, cards: [emptyCard({ title: 'Projects, as kanban' })] }), false);
  // A project of another name is not it at all.
  assert.equal(isDemoBoard({ ...demo, name: 'Dissertation' }), false);
  // And the real board is never mistaken for the demonstration one.
  assert.equal(isDemoBoard(pulseProject()), false);
  assert.equal(isDemoBoard(null), false);
});

test('the board is added to what is there, not swapped for it', () => {
  const mine = emptyProject({ name: 'Dissertation' });
  mine.cards = [emptyCard({ title: 'Read the Kaplan paper', columnId: mine.columns[0].id })];
  const demo = emptyProject({ name: 'Pulse OS' });
  demo.cards = [...OLD_SEED_TITLES].map((title) => emptyCard({ title, columnId: demo.columns[0].id }));

  const next = withPulseBoard([demo, mine]);
  assert.equal(next.seeded, SEED_VERSION);
  // Pulse OS first and open, the demonstration board gone, the work untouched.
  assert.deepEqual(next.projects.map((p) => p.name), ['Pulse OS', 'Dissertation']);
  assert.equal(next.projects[0].cards.length, pulseProject().cards.length);
  assert.equal(next.activeId, next.projects[0].id);
  assert.deepEqual(next.projects[1], mine);

  // A board of their own sharing the name keeps everything but the ambiguity.
  const theirs = { ...emptyProject({ name: 'Pulse OS' }), cards: [emptyCard({ title: 'My own card' })] };
  const named = withPulseBoard([theirs]);
  assert.deepEqual(named.projects.map((p) => p.name), ['Pulse OS', 'Pulse OS (yours)']);
  assert.deepEqual(named.projects[1].cards, theirs.cards, 'renamed, and nothing else');

  // Nothing stored at all is just the board.
  assert.deepEqual(withPulseBoard([]).projects.map((p) => p.name), ['Pulse OS']);
  assert.deepEqual(withPulseBoard(undefined).projects.map((p) => p.name), ['Pulse OS']);
});
