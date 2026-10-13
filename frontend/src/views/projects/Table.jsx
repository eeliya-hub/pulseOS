import { ArrowDown, ArrowUp, Check, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { colourOf, dueState, progressOf } from '../../services/projects/board.js';

/**
 * Every card at once, sortable, with the dates editable where they stand.
 *
 * The board answers "what is in flight" and the timeline "when does it land";
 * this answers "what is there", which is the question you ask when a board has
 * grown past one screen. Dates are editable here because this is where you
 * come to give forty cards a deadline, and opening forty cards to do it would
 * be the reason nobody does it.
 */

const COLUMNS = [
  { id: 'title', label: 'Card', width: 'minmax(16rem, 2.2fr)' },
  { id: 'list', label: 'List', width: 'minmax(7rem, 0.8fr)' },
  { id: 'labels', label: 'Labels', width: 'minmax(8rem, 0.9fr)' },
  { id: 'start', label: 'Start', width: '9.5rem' },
  { id: 'due', label: 'Due', width: '9.5rem' },
  { id: 'progress', label: 'Checklist', width: '7rem' },
  { id: 'actions', label: '', width: '2.5rem' },
];

export default function ProjectTable({ project, store, cards, today, onOpenCard }) {
  const [sort, setSort] = useState({ by: 'due', dir: 'asc' });

  const rows = useMemo(() => {
    const value = (card) => {
      switch (sort.by) {
        case 'title': return (card.title ?? '').toLowerCase();
        case 'list': return project.columns.findIndex((c) => c.id === card.columnId);
        case 'labels': return (card.labels ?? []).length;
        case 'start': return card.start ?? '';
        case 'progress': return progressOf(card)?.ratio ?? -1;
        case 'due':
        default: return card.due ?? '';
      }
    };
    return [...cards].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Cards with no date sort to the end whichever way round it is — an empty
      // string would otherwise put them all first on an ascending sort, which
      // is never what anyone means by "sort by due date".
      if (av === '' && bv !== '') return 1;
      if (bv === '' && av !== '') return -1;
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * (sort.dir === 'asc' ? 1 : -1);
    });
  }, [cards, sort, project.columns]);

  const done = cards.filter((card) => card.done).length;

  const toggleSort = (id) =>
    setSort((c) => (c.by === id ? { by: id, dir: c.dir === 'asc' ? 'desc' : 'asc' } : { by: id, dir: 'asc' }));

  if (!cards.length) {
    return (
      <div className="proj-empty">
        <p className="t-title">No cards to show</p>
        <p className="t-meta mt-2">Either this project is empty, or the filter is hiding everything in it.</p>
      </div>
    );
  }

  const template = COLUMNS.map((c) => c.width).join(' ');

  return (
    <div className="proj-table glass-scroll">
      <div className="proj-tr proj-tr--head" style={{ gridTemplateColumns: template }}>
        {COLUMNS.map((column) => (
          <button
            key={column.id}
            type="button"
            onClick={() => column.id !== 'actions' && toggleSort(column.id)}
            className="proj-th"
            aria-sort={sort.by === column.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            {column.label}
            {sort.by === column.id ? (
              sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>

      {rows.map((card) => {
        const progress = progressOf(card);
        const state = dueState(card, today);
        return (
          <div key={card.id} className={`proj-tr ${card.done ? 'is-done' : ''}`} style={{ gridTemplateColumns: template }}>
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => store.toggleCard(project.id, card.id)}
                aria-label={card.done ? 'Mark as not done' : 'Mark as done'}
                className={`proj-tick ${card.done ? 'is-on' : ''}`}
              >
                {card.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
              </button>
              <button type="button" onClick={() => onOpenCard(card.id)} className="proj-td-title">
                {card.title || 'Untitled'}
              </button>
            </div>

            <select
              value={card.columnId}
              onChange={(event) => store.moveCard(project.id, card.id, event.target.value, null)}
              aria-label={`Which list ${card.title} is in`}
              className="proj-td-select"
            >
              {project.columns.map((c) => (
                <option key={c.id} value={c.id} className="bg-ink text-moon">{c.name}</option>
              ))}
            </select>

            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {(card.labels ?? []).map((id) => {
                const label = project.labels.find((l) => l.id === id);
                if (!label) return null;
                const hex = colourOf(label.colour).hex;
                return (
                  <span key={id} className="proj-chip" style={{ color: hex, background: `color-mix(in srgb, ${hex} 16%, transparent)` }}>
                    {label.name}
                  </span>
                );
              })}
              {!card.labels?.length ? <span className="t-micro">—</span> : null}
            </div>

            <input
              type="date"
              value={card.start ?? ''}
              onChange={(event) => store.patchCard(project.id, card.id, { start: event.target.value || null })}
              aria-label={`Start date for ${card.title}`}
              className="proj-td-date"
            />
            <input
              type="date"
              value={card.due ?? ''}
              onChange={(event) => store.patchCard(project.id, card.id, { due: event.target.value || null })}
              aria-label={`Due date for ${card.title}`}
              className={`proj-td-date proj-due--${state ?? 'plain'}`}
            />

            <span className="t-micro">
              {progress ? `${progress.done}/${progress.total}` : '—'}
            </span>

            <button
              type="button"
              onClick={() => store.removeCard(project.id, card.id)}
              aria-label={`Delete ${card.title || 'this card'}`}
              className="proj-icon"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      <p className="proj-table-foot">
        {rows.length} {rows.length === 1 ? 'card' : 'cards'}
        {done ? ` · ${done} done` : ''}
      </p>
    </div>
  );
}
