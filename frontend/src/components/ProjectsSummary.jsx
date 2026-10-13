import { KanbanSquare } from 'lucide-react';
import { useProjects } from '../hooks/useProjects.js';
import { colourOf, dayKey, dueState } from '../services/projects/board.js';

/**
 * What the Life Hub says about your boards.
 *
 * It sits where the mail card used to, and holds to the same rule that card was
 * cut down to: a label, one figure set large, one line about it, one way in.
 * The boards themselves are a tab now — this is the glance, not the work.
 *
 * The figure is what is still open across every project, because that is the
 * number you look at a board list to find out. The line is what is late, which
 * is the only thing urgent enough to belong on a screen you read in passing.
 */
export default function ProjectsSummary({ onOpen }) {
  const { projects } = useProjects();
  const today = dayKey();

  const cards = projects.flatMap((project) => project.cards.map((card) => ({ card, project })));
  const open = cards.filter(({ card }) => !card.done);
  const overdue = open.filter(({ card }) => dueState(card, today) === 'overdue');
  const dueToday = open.filter(({ card }) => dueState(card, today) === 'today');

  const line = overdue.length
    ? `${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} past due`
    : dueToday.length
      ? `${dueToday.length} due today`
      : open.length
        ? `across ${projects.length} ${projects.length === 1 ? 'board' : 'boards'}`
        : 'Nothing outstanding';

  return (
    <div className="mail-card">
      <div className="flex items-center justify-between gap-3">
        <p className="t-label flex min-w-0 items-center gap-2">
          <KanbanSquare className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} aria-hidden="true" />
          Projects
        </p>
        {/* One dot per board, in its own colour — which board is which, without
            a list of their names competing with the figure beside them. */}
        {projects.length ? (
          <span className="flex shrink-0 items-center gap-1">
            {projects.slice(0, 5).map((project) => (
              <span
                key={project.id}
                title={project.name}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colourOf(project.colour).hex }}
              />
            ))}
          </span>
        ) : null}
      </div>

      <p className="mt-3 flex items-baseline gap-2.5">
        <span className="display-figures mail-card-figure">{open.length}</span>
        <span className="t-body text-moon/75">{open.length === 1 ? 'card open' : 'cards open'}</span>
      </p>
      <p className={`t-micro mt-1.5 truncate ${overdue.length ? 'text-amber-200/80' : ''}`}>{line}</p>

      <button type="button" onClick={() => onOpen?.()} className="pill pill-lit mt-3.5 h-9 self-start px-4">
        <KanbanSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Open projects
      </button>
    </div>
  );
}
