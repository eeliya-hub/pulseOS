/**
 * The arithmetic a board runs on, with nothing around it.
 *
 * Kept apart from the store for the same reason the mail store's reducers are:
 * this is the code that decides where a card lands when it is dragged, what a
 * checklist's progress is, and which cards a filter leaves behind. All of it is
 * the kind of thing that is wrong by one and looks right until you look twice,
 * so it is written where it can be tested without a browser.
 *
 * Pure functions over plain objects. No React, no storage, no dates beyond
 * comparing the ones it is given.
 */

export const uid = (prefix = 'c') => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

/** A local YYYY-MM-DD, which is what every date field here holds. */
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ── What a board is made of ───────────────────────────────────────────── */

export const LABEL_COLOURS = [
  { id: 'sky', name: 'Sky', hex: '#7aa2ff' },
  { id: 'mint', name: 'Mint', hex: '#4fd6a0' },
  { id: 'amber', name: 'Amber', hex: '#ffb340' },
  { id: 'rose', name: 'Rose', hex: '#ff6b8a' },
  { id: 'violet', name: 'Violet', hex: '#b78aff' },
  { id: 'slate', name: 'Slate', hex: '#8d96ad' },
];

export const colourOf = (id) => LABEL_COLOURS.find((c) => c.id === id) ?? LABEL_COLOURS[0];

/** The lanes a brand-new project starts with. */
export const STARTER_COLUMNS = () => [
  { id: uid('col'), name: 'To do' },
  { id: uid('col'), name: 'Doing' },
  { id: uid('col'), name: 'Done', done: true },
];

export const STARTER_LABELS = () => [
  { id: uid('lab'), name: 'Design', colour: 'violet' },
  { id: uid('lab'), name: 'Bug', colour: 'rose' },
  { id: uid('lab'), name: 'Idea', colour: 'amber' },
];

/** Everything a card can carry, with the empty shape written down once. */
export function emptyCard(patch = {}) {
  return {
    id: uid('card'),
    title: '',
    notes: '',
    columnId: null,
    labels: [],
    checklist: [],
    comments: [],
    links: [],
    start: null,
    due: null,
    done: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

export function emptyProject(patch = {}) {
  const columns = STARTER_COLUMNS();
  return {
    id: uid('proj'),
    name: 'New project',
    description: '',
    colour: 'sky',
    archived: false,
    createdAt: new Date().toISOString(),
    due: null,
    columns,
    labels: STARTER_LABELS(),
    cards: [],
    ...patch,
  };
}

/* ── Moving things ─────────────────────────────────────────────────────── */

/**
 * The cards of one column, in the order they are shown.
 *
 * Order is the array's own, not a number on each card: a card carries no index,
 * so there is no way for two of them to claim the same place or for a gap to
 * open when one is deleted. The cost is that a move rewrites the list, which at
 * board sizes is nothing.
 */
export const cardsIn = (project, columnId) =>
  (project?.cards ?? []).filter((card) => card.columnId === columnId);

/**
 * A card dropped into `columnId` at `index`.
 *
 * `index` is the position among the cards ALREADY in that column, with the
 * dragged card taken out first — which is the part that is easy to get wrong.
 * Dropping a card below itself in its own column would otherwise land it one
 * place short of where it was let go.
 */
export function moveCard(project, cardId, columnId, index = null) {
  const moving = (project.cards ?? []).find((card) => card.id === cardId);
  if (!moving) return project;

  const rest = project.cards.filter((card) => card.id !== cardId);
  const target = rest.filter((card) => card.columnId === columnId);
  const others = rest.filter((card) => card.columnId !== columnId);

  const at = index == null || index > target.length ? target.length : Math.max(0, index);
  const column = project.columns?.find((c) => c.id === columnId);

  const landed = {
    ...moving,
    columnId,
    // A lane marked as the finishing one ticks the card off, and dragging back
    // out un-ticks it — the board and the checkbox cannot disagree.
    done: column?.done ? true : moving.done && !column?.done ? false : moving.done,
  };

  target.splice(at, 0, landed);

  // Keep the untouched columns' cards where they were, with the rebuilt column
  // spliced back in at the first position one of its cards held.
  return { ...project, cards: [...others, ...target] };
}

/** A column dropped at `index` among the others. */
export function moveColumn(project, columnId, index) {
  const columns = [...(project.columns ?? [])];
  const from = columns.findIndex((c) => c.id === columnId);
  if (from < 0) return project;
  const [column] = columns.splice(from, 1);
  columns.splice(Math.max(0, Math.min(index, columns.length)), 0, column);
  return { ...project, columns };
}

/* ── Reading a card ────────────────────────────────────────────────────── */

/** A checklist as a fraction, and null where there is no checklist at all. */
export function progressOf(card) {
  const list = card?.checklist ?? [];
  if (!list.length) return null;
  const done = list.filter((item) => item.done).length;
  return { done, total: list.length, ratio: done / list.length };
}

/** Where a card stands against today: 'done' | 'overdue' | 'today' | 'soon' | null. */
export function dueState(card, today = dayKey()) {
  if (card?.done) return 'done';
  if (!card?.due) return null;
  if (card.due < today) return 'overdue';
  if (card.due === today) return 'today';
  return 'soon';
}

/** How far through a project's cards you are. */
export function projectProgress(project) {
  const cards = project?.cards ?? [];
  if (!cards.length) return { done: 0, total: 0, ratio: 0 };
  const done = cards.filter((card) => card.done).length;
  return { done, total: cards.length, ratio: done / cards.length };
}

/* ── Finding things ────────────────────────────────────────────────────── */

/**
 * The cards a filter leaves behind.
 *
 * Every clause is AND, and an empty clause is not a filter — which sounds
 * obvious and is the thing that makes a filter bar feel broken when it is
 * missed, because an untouched control starts hiding cards.
 */
export function filterCards(cards, { text = '', labels = [], due = null, done = null } = {}, today = dayKey()) {
  const needle = text.trim().toLowerCase();
  return (cards ?? []).filter((card) => {
    if (done === true && !card.done) return false;
    if (done === false && card.done) return false;

    if (labels.length && !labels.some((id) => (card.labels ?? []).includes(id))) return false;

    if (due) {
      const state = dueState(card, today);
      if (due === 'overdue' && state !== 'overdue') return false;
      if (due === 'today' && state !== 'today') return false;
      if (due === 'dated' && !card.due) return false;
      if (due === 'undated' && card.due) return false;
    }

    if (needle) {
      const haystack = [
        card.title,
        card.notes,
        ...(card.checklist ?? []).map((i) => i.label),
        ...(card.comments ?? []).map((c) => c.text),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}

/* ── The timeline ──────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const asDate = (key) => (key ? new Date(`${key}T00:00:00`) : null);
export const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / DAY);

export function addDays(key, n) {
  const date = asDate(key);
  if (!date) return null;
  date.setDate(date.getDate() + n);
  return dayKey(date);
}

/**
 * The span a timeline has to draw, and where each card sits in it.
 *
 * A card with only a due date is a point, not a bar, so it is given a single
 * day — drawing it as a zero-width bar would make it invisible, which is worse
 * than slightly wrong. A card with neither date is not on the timeline at all,
 * and the view says how many of those there are rather than hiding them
 * silently.
 */
export function timelineOf(cards, { today = dayKey(), pad = 2 } = {}) {
  const dated = (cards ?? []).filter((card) => card.start || card.due);
  const undated = (cards ?? []).length - dated.length;

  if (!dated.length) {
    return { start: addDays(today, -pad), end: addDays(today, 14), days: 16 + pad, bars: [], undated };
  }

  /*
   * Each card's pair is put the right way round BEFORE the span is measured.
   * A due date earlier than its start is a typo rather than an instruction, and
   * the bar below is drawn the only way round it can be — so measuring the span
   * from the raw values put that bar at a negative offset, off the left of the
   * chart entirely.
   */
  const spans = dated.map((card) => {
    const from = card.start ?? card.due;
    const to = card.due ?? card.start;
    return from <= to ? { card, a: from, b: to } : { card, a: to, b: from };
  });

  const first = [...spans.map((s) => s.a), today].sort()[0];
  const last = [...spans.map((s) => s.b), today].sort().at(-1);

  const start = addDays(first, -pad);
  const end = addDays(last, pad);
  const days = Math.max(1, daysBetween(start, end) + 1);

  const bars = spans.map(({ card, a, b }) => ({
    card,
    offset: daysBetween(start, a),
    length: Math.max(1, daysBetween(a, b) + 1),
  }));

  return { start, end, days, bars, undated };
}

/* ── Coming from the old shape ─────────────────────────────────────────── */

/**
 * The projects the Life Hub used to hold, as boards.
 *
 * They were `{ name, due, todos: [{ label, done }] }` — a flat list with no
 * lanes. Each becomes a project whose to-dos are cards, the done ones in the
 * finishing lane and the rest in the first, so nothing is lost and nobody has
 * to move their own work across by hand.
 */
export function fromLifeProjects(projects = []) {
  return projects.map((old) => {
    const columns = STARTER_COLUMNS();
    const todo = columns[0];
    const done = columns.at(-1);
    return emptyProject({
      id: old.id ?? uid('proj'),
      name: old.name ?? 'Project',
      due: old.due ?? null,
      columns,
      cards: (old.todos ?? []).map((item) =>
        emptyCard({
          id: item.id ?? uid('card'),
          title: item.label ?? '',
          done: Boolean(item.done),
          columnId: item.done ? done.id : todo.id,
        }),
      ),
    });
  });
}
