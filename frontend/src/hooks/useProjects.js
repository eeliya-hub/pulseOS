import { useEffect, useState } from 'react';
import {
  emptyCard,
  emptyProject,
  fromLifeProjects,
  moveCard,
  moveColumn,
  uid,
} from '../services/projects/board.js';
import { landingColumn } from '../services/projects/assistant.js';
import { SEED_VERSION, withPulseBoard } from '../services/projects/pulseSeed.js';

/**
 * Projects, as boards.
 *
 * Built on the same shape as useLifeData: a module-level store, a set of
 * subscribers, every change written straight to localStorage, and plain action
 * functions that work the same from a component, the assistant or voice mode.
 * There is no server — a board is yours and lives in this browser, like
 * everything else you make in Pulse.
 *
 * The arithmetic — where a dragged card lands, what a checklist adds up to,
 * what a filter leaves — is in services/projects/board.js, where it is tested.
 * This file is the store and nothing more.
 */

const KEY = 'pulse.projects.v1';
/* Where the Life Hub used to keep them, read once so nothing is left behind. */
const LIFE_KEY = 'pulse.life.v1';

/*
 * A board that is already a board. An empty one teaches nothing, and the first
 * thing anybody does with a Trello-shaped thing is look for what the columns
 * are for — so what is seeded is the project's own three months, everything it
 * is in the middle of, and everything it might be next.
 */
const seed = () => withPulseBoard([]);

/**
 * What is on disk, or what the Life Hub had, or a seed — in that order.
 *
 * The migration runs once and leaves the Life Hub's own copy alone: this reads
 * it, it does not move it. If this turns out to be a bad idea the old projects
 * are still exactly where they were.
 */
function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    const stored = (parsed?.projects ?? []).map(normalise).filter(Boolean);

    // The ordinary case: this browser already has the board it was given.
    if (parsed?.seeded === SEED_VERSION && stored.length) {
      const activeId = stored.some((p) => p.id === parsed.activeId) ? parsed.activeId : stored[0].id;
      return { ...parsed, projects: stored, activeId };
    }

    /*
     * Once: the Pulse OS board arrives, beside whatever is already here.
     *
     * Written straight back, so the one time really is one time. Without that
     * the migration runs again on every load until something else happens to
     * save, which is the same trap the tab arrangement fell into.
     */
    const life = JSON.parse(localStorage.getItem(LIFE_KEY) || 'null');
    const carried = stored.length ? stored : fromLifeProjects(life?.projects ?? []);
    const next = withPulseBoard(carried);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage disabled or full — the board is still right for this session */
    }
    return next;
  } catch {
    /* unreadable — a fresh board beats a crashed view */
  }
  return seed();
}

/** Whatever was stored, filled out to the shape the views expect. */
function normalise(project) {
  if (!project || typeof project !== 'object') return null;
  const base = emptyProject();
  const columns = (project.columns ?? []).length ? project.columns : base.columns;
  return {
    ...base,
    ...project,
    columns,
    labels: project.labels ?? base.labels,
    cards: (project.cards ?? []).map((card) => ({
      ...emptyCard(),
      ...card,
      // A card whose lane was deleted would otherwise vanish from every view
      // while still counting towards the totals.
      columnId: columns.some((c) => c.id === card.columnId) ? card.columnId : columns[0].id,
      labels: card.labels ?? [],
      checklist: card.checklist ?? [],
      comments: card.comments ?? [],
      links: card.links ?? [],
    })),
  };
}

let state = load();
const subscribers = new Set();

function patch(updater) {
  state = { ...state, ...updater(state) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage disabled or full — non-fatal, the session still works */
  }
  subscribers.forEach((fn) => fn(state));
}

/** One project changed, the rest left exactly as they were. */
const onProject = (id, change) => (current) => ({
  projects: current.projects.map((p) => (p.id === id ? change(p) : p)),
});

/** One card changed, within one project. */
const onCard = (projectId, cardId, change) =>
  onProject(projectId, (project) => ({
    ...project,
    cards: project.cards.map((card) => (card.id === cardId ? change(card) : card)),
  }));

// Another tab saved: follow it rather than overwrite it with the next change.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue);
      state = { projects: (next.projects ?? []).map(normalise).filter(Boolean), activeId: next.activeId };
      subscribers.forEach((fn) => fn(state));
    } catch {
      /* unreadable — keep what we have */
    }
  });
}

/** The boards as they are right now, for code outside React. */
export const getProjects = () => state;

export const projectActions = {
  /* ── Projects ─────────────────────────────────────────────────────────── */
  select(id) {
    patch(() => ({ activeId: id }));
  },

  addProject(name = 'New project') {
    const project = emptyProject({ name });
    patch((c) => ({ projects: [...c.projects, project], activeId: project.id }));
    return project;
  },

  patchProject(id, changes) {
    patch(onProject(id, (p) => ({ ...p, ...changes })));
  },

  removeProject(id) {
    patch((c) => {
      const projects = c.projects.filter((p) => p.id !== id);
      return { projects, activeId: c.activeId === id ? (projects[0]?.id ?? null) : c.activeId };
    });
  },

  /* ── Columns ──────────────────────────────────────────────────────────── */
  addColumn(projectId, name = 'New list') {
    patch(onProject(projectId, (p) => ({ ...p, columns: [...p.columns, { id: uid('col'), name }] })));
  },

  patchColumn(projectId, columnId, changes) {
    patch(onProject(projectId, (p) => ({
      ...p,
      columns: p.columns.map((c) => (c.id === columnId ? { ...c, ...changes } : c)),
    })));
  },

  /**
   * A lane, and what was in it.
   *
   * Its cards move to the lane before it rather than being deleted with it —
   * removing a column is a change of shape, not a decision to throw away work,
   * and a board that quietly eats eight cards is not one anybody will trust.
   */
  removeColumn(projectId, columnId) {
    patch(onProject(projectId, (p) => {
      if (p.columns.length <= 1) return p;
      const index = p.columns.findIndex((c) => c.id === columnId);
      const fallback = p.columns[index - 1] ?? p.columns[index + 1];
      return {
        ...p,
        columns: p.columns.filter((c) => c.id !== columnId),
        cards: p.cards.map((card) => (card.columnId === columnId ? { ...card, columnId: fallback.id } : card)),
      };
    }));
  },

  moveColumn(projectId, columnId, index) {
    patch(onProject(projectId, (p) => moveColumn(p, columnId, index)));
  },

  /* ── Cards ────────────────────────────────────────────────────────────── */
  /**
   * A new card. With no list named it lands in the first one that is not the
   * finishing list, which is where anything arriving from elsewhere in Pulse —
   * an email, the assistant — belongs: on the board, not already ticked off.
   * `extra` carries whatever else it arrives with: notes, a date, labels.
   */
  addCard(projectId, columnId, title, extra = {}) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const lane = columnId ?? landingColumn(project)?.id ?? null;
    const card = emptyCard({ ...extra, title, columnId: lane });
    patch(onProject(projectId, (p) => ({ ...p, cards: [...p.cards, card] })));
    return card;
  },

  patchCard(projectId, cardId, changes) {
    patch(onCard(projectId, cardId, (card) => ({ ...card, ...changes })));
  },

  removeCard(projectId, cardId) {
    patch(onProject(projectId, (p) => ({ ...p, cards: p.cards.filter((c) => c.id !== cardId) })));
  },

  moveCard(projectId, cardId, columnId, index) {
    patch(onProject(projectId, (p) => moveCard(p, cardId, columnId, index)));
  },

  /** Ticking a card off puts it in the finishing lane, if the board has one. */
  toggleCard(projectId, cardId) {
    patch(onProject(projectId, (p) => {
      const card = p.cards.find((c) => c.id === cardId);
      if (!card) return p;
      const done = !card.done;
      const finishing = p.columns.find((c) => c.done);
      if (done && finishing && card.columnId !== finishing.id) {
        return moveCard({ ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, done } : c)) }, cardId, finishing.id, null);
      }
      return { ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, done } : c)) };
    }));
  },

  /* ── Inside a card ────────────────────────────────────────────────────── */
  addChecklistItem(projectId, cardId, label) {
    patch(onCard(projectId, cardId, (card) => ({
      ...card,
      checklist: [...card.checklist, { id: uid('chk'), label, done: false }],
    })));
  },

  toggleChecklistItem(projectId, cardId, itemId) {
    patch(onCard(projectId, cardId, (card) => ({
      ...card,
      checklist: card.checklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
    })));
  },

  removeChecklistItem(projectId, cardId, itemId) {
    patch(onCard(projectId, cardId, (card) => ({
      ...card,
      checklist: card.checklist.filter((i) => i.id !== itemId),
    })));
  },

  addComment(projectId, cardId, text) {
    patch(onCard(projectId, cardId, (card) => ({
      ...card,
      comments: [...card.comments, { id: uid('cmt'), text, at: new Date().toISOString() }],
    })));
  },

  removeComment(projectId, cardId, commentId) {
    patch(onCard(projectId, cardId, (card) => ({
      ...card,
      comments: card.comments.filter((c) => c.id !== commentId),
    })));
  },

  toggleCardLabel(projectId, cardId, labelId) {
    patch(onCard(projectId, cardId, (card) => ({
      ...card,
      labels: card.labels.includes(labelId)
        ? card.labels.filter((id) => id !== labelId)
        : [...card.labels, labelId],
    })));
  },

  /* ── Labels ───────────────────────────────────────────────────────────── */
  addLabel(projectId, name, colour) {
    patch(onProject(projectId, (p) => ({ ...p, labels: [...p.labels, { id: uid('lab'), name, colour }] })));
  },

  patchLabel(projectId, labelId, changes) {
    patch(onProject(projectId, (p) => ({
      ...p,
      labels: p.labels.map((l) => (l.id === labelId ? { ...l, ...changes } : l)),
    })));
  },

  /** A label goes from the board and from every card that wore it. */
  removeLabel(projectId, labelId) {
    patch(onProject(projectId, (p) => ({
      ...p,
      labels: p.labels.filter((l) => l.id !== labelId),
      cards: p.cards.map((card) => ({ ...card, labels: card.labels.filter((id) => id !== labelId) })),
    })));
  },
};

export function useProjects() {
  const [snap, setSnap] = useState(state);

  useEffect(() => {
    subscribers.add(setSnap);
    setSnap(state); // in case it changed between render and mount
    return () => subscribers.delete(setSnap);
  }, []);

  const active = snap.projects.find((p) => p.id === snap.activeId) ?? snap.projects[0] ?? null;
  return { ...snap, active, ...projectActions };
}
