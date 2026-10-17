import { getProjects, projectActions } from '../../hooks/useProjects.js';
import { dayKey } from './board.js';
import { boardSummary, findCard, findColumn, findProject, landingColumn, projectsOverview } from './assistant.js';

/**
 * The assistant's half of Projects.
 *
 * The handlers behind the project tool schemas in the backend's
 * services/ai/tools.js. Three of them: read a board, add a card, move one.
 * Nothing here deletes — a card the assistant thought you meant, gone, is not
 * a mistake anyone can see to undo.
 *
 * The matching — which project, which card, which list — is in assistant.js,
 * where it is tested. When a name fits more than one thing, the candidates go
 * back to the model so it can ask, rather than this picking one.
 */

const noProject = (name) => ({
  error: name ? `No project called "${name}".` : 'There are no projects yet.',
  projects: (getProjects().projects ?? []).map((p) => p.name),
});

/** Several things fitted: say which, so the assistant can ask. */
const ambiguous = (what, items, nameOf) => ({
  error: `More than one ${what} fits — ask which.`,
  matches: items.map(nameOf).slice(0, 8),
});

function projectFor(name) {
  const hit = findProject(getProjects(), name);
  if (hit.found) return { project: hit.found };
  if (hit.matches) return { fail: ambiguous('project', hit.matches, (p) => p.name) };
  return { fail: noProject(name) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const projectTools = {
  /** Every project in a line, or one board in full. */
  async get_projects({ project } = {}) {
    const state = getProjects();
    if (!project) {
      const open = findProject(state).found;
      return {
        projects: projectsOverview(state),
        // The one on screen, read out in full: it is usually the one meant.
        ...(open ? { board: boardSummary(open) } : {}),
      };
    }
    const { project: found, fail } = projectFor(project);
    if (fail) return fail;
    return { board: boardSummary(found) };
  },

  async add_project_card({ project, title, list, due, notes } = {}) {
    const text = String(title ?? '').trim();
    if (!text) return { error: 'Say what the card is.' };
    const { project: found, fail } = projectFor(project);
    if (fail) return fail;

    let column = landingColumn(found);
    if (list) {
      const hit = findColumn(found, list);
      if (hit.matches) return ambiguous('list', hit.matches, (c) => c.name);
      if (!hit.found) return { error: `"${found.name}" has no list called "${list}".`, lists: found.columns.map((c) => c.name) };
      column = hit.found;
    }

    // The same card asked for twice is one card.
    const existing = found.cards.find((c) => c.title.trim().toLowerCase() === text.toLowerCase() && !c.done);
    if (existing) {
      return { added: false, duplicate: true, project: found.name, title: existing.title, note: 'That card is already on the board.' };
    }

    const when = DATE.test(String(due ?? '')) ? due : null;
    const card = projectActions.addCard(found.id, column?.id ?? null, text, {
      ...(when ? { due: when } : {}),
      ...(notes ? { notes: String(notes) } : {}),
    });
    if (!card) return noProject(project);
    return { added: true, project: found.name, list: column?.name ?? null, title: text, ...(when ? { due: when } : {}) };
  },

  async move_project_card({ project, card, to } = {}) {
    if (!card) return { error: 'Say which card.' };
    if (!to) return { error: 'Say which list it should go to.' };
    const { project: found, fail } = projectFor(project);
    if (fail) return fail;

    const which = findCard(found, card);
    if (which.matches) return ambiguous('card', which.matches, (c) => c.title);
    if (!which.found) return { error: `No card called "${card}" on ${found.name}.` };

    const lane = findColumn(found, to);
    if (lane.matches) return ambiguous('list', lane.matches, (c) => c.name);
    if (!lane.found) return { error: `"${found.name}" has no list called "${to}".`, lists: found.columns.map((c) => c.name) };

    const from = found.columns.find((c) => c.id === which.found.columnId)?.name ?? null;
    if (which.found.columnId === lane.found.id) return { moved: false, already: true, title: which.found.title, list: lane.found.name };
    // Into the end of the list. Moving into the finishing list ticks it off,
    // and out of it un-ticks it — board.js does that, so this says so.
    projectActions.moveCard(found.id, which.found.id, lane.found.id, null);
    return {
      moved: true,
      project: found.name,
      title: which.found.title,
      from,
      to: lane.found.name,
      ...(lane.found.done ? { ticked_off: true, on: dayKey(new Date()) } : {}),
    };
  },
};
