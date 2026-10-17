import { cardsIn, dayKey, dueState, progressOf } from './board.js';

/**
 * The projects, as the assistant reads and changes them.
 *
 * A person names things loosely — "the Pulse board", "the week view one",
 * "move it to done" — and a board names them exactly. Everything here is the
 * translation between the two, kept pure so the rules can be tested: which
 * project they meant, which card, which list, and what a board says when it is
 * read out rather than looked at.
 *
 * When a name fits more than one thing, nothing is guessed: the caller gets the
 * candidates back and asks. Moving the wrong card is worse than asking.
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The best match for `wanted` among `items`, by `nameOf`.
 *
 * Exact first. Then any name with a word that starts with it — anywhere in the
 * name, not just at the front, because "week" is as much about "A week view
 * for Schedule" as about "Week numbers in the grid", and letting the one that
 * happens to lead with it win would be the quiet guess this file exists not to
 * make. Then, last, a name it merely contains or that contains it: "the week
 * view card" contains "week view". Ties at the best tier come back as
 * `matches` rather than a pick.
 */
export function pick(items, wanted, nameOf) {
  const needle = norm(wanted);
  if (!needle) return { error: 'empty' };
  const named = (items ?? []).map((item) => ({ item, name: norm(nameOf(item)) }));
  const tiers = [
    (n) => n === needle,
    (n) => n.startsWith(needle) || n.includes(` ${needle}`),
    (n) => n.includes(needle) || (n.length > 3 && needle.includes(n)),
  ];
  for (const test of tiers) {
    const hits = named.filter(({ name }) => name && test(name));
    if (hits.length === 1) return { found: hits[0].item };
    if (hits.length > 1) return { matches: hits.map((h) => h.item) };
  }
  return { error: 'none' };
}

/** The project they meant, or the open one when they did not say. */
export function findProject(state, wanted) {
  const projects = (state?.projects ?? []).filter((p) => !p.archived);
  if (!wanted) {
    const open = projects.find((p) => p.id === state?.activeId) ?? projects[0];
    return open ? { found: open } : { error: 'none' };
  }
  return pick(projects, wanted, (p) => p.name);
}

const DONE_WORDS = /^(done|finished|complete|completed|shipped|closed|ticked off)$/;

/**
 * The list they meant.
 *
 * "Done" and its relatives mean the board's finishing list whatever it is
 * called — the Pulse board's is "Shipped", a fresh board's is "Done" — because
 * that is what a person means by "move it to done".
 */
export function findColumn(project, wanted) {
  const columns = project?.columns ?? [];
  if (DONE_WORDS.test(norm(wanted))) {
    const finishing = [...columns].reverse().find((c) => c.done);
    if (finishing) return { found: finishing };
  }
  return pick(columns, wanted, (c) => c.name);
}

/**
 * Where something new on a board goes: the first list that is not the
 * finishing one. A card arriving already in "Done" would be a card nobody
 * meant to tick off.
 */
export function landingColumn(project) {
  const columns = project?.columns ?? [];
  return columns.find((c) => !c.done) ?? columns[0] ?? null;
}

/** A card, as it is worth saying out loud. */
function describe(card, today) {
  const checklist = progressOf(card);
  const state = dueState(card, today);
  return {
    title: card.title,
    ...(card.due ? { due: card.due } : {}),
    ...(card.start ? { start: card.start } : {}),
    ...(state === 'overdue' ? { overdue: true } : {}),
    ...(state === 'today' ? { due_today: true } : {}),
    ...(card.done ? { done: true } : {}),
    ...(checklist ? { checklist: `${checklist.done}/${checklist.total}` } : {}),
  };
}

/**
 * A board, read out.
 *
 * Every list with its cards, and the overdue ones pulled out on their own —
 * because "what's late" is the question most often asked of a board and the
 * one least easy to see on it. Capped, so a board of hundreds does not drown
 * everything else the assistant needs to keep in mind.
 */
export function boardSummary(project, { today = dayKey(new Date()), limit = 60 } = {}) {
  let left = limit;
  const lists = (project.columns ?? []).map((column) => {
    const all = cardsIn(project, column.id);
    const shown = all.slice(0, Math.max(0, left));
    left -= shown.length;
    return {
      name: column.name,
      ...(column.done ? { finishing: true } : {}),
      count: all.length,
      cards: shown.map((card) => describe(card, today)),
    };
  });
  const open = (project.cards ?? []).filter((c) => !c.done);
  const overdue = open.filter((c) => dueState(c, today) === 'overdue').map((c) => c.title);
  return {
    name: project.name,
    ...(project.description ? { description: project.description } : {}),
    total: project.cards?.length ?? 0,
    done: (project.cards?.length ?? 0) - open.length,
    overdue,
    lists,
    ...(left < 0 || lists.some((l) => l.cards.length < l.count) ? { truncated: true } : {}),
  };
}

/** Every project, one line each. */
export function projectsOverview(state, { today = dayKey(new Date()) } = {}) {
  return (state?.projects ?? [])
    .filter((p) => !p.archived)
    .map((p) => {
      const open = (p.cards ?? []).filter((c) => !c.done);
      return {
        name: p.name,
        cards: p.cards?.length ?? 0,
        open: open.length,
        overdue: open.filter((c) => dueState(c, today) === 'overdue').length,
        ...(p.id === state.activeId ? { open_now: true } : {}),
      };
    });
}

/** The card they meant, in one project. */
export const findCard = (project, wanted) => pick(project?.cards ?? [], wanted, (c) => c.title);
