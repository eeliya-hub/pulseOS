import { Check, MessageSquare, MoreHorizontal, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cardsIn, colourOf, dueState, progressOf } from '../../services/projects/board.js';
import { readDate } from '../../services/mail/dates.js';

/**
 * The board: lanes across, cards down them, dragged where you want them.
 *
 * Drag and drop is the browser's own, not a library. A card is draggable, a
 * lane is a drop target, and the gap a card would fall into is worked out from
 * the pointer against the midpoint of each card already there — which is the
 * whole of what a board needs and about forty lines, against a dependency that
 * would be larger than this view.
 *
 * The only subtle part is the index: it counts the cards in the destination
 * WITHOUT the one being dragged, because by the time it lands it has left
 * wherever it came from. `moveCard` in board.js is written to that rule and
 * tested against it.
 */
export default function ProjectBoard({ project, store, cards, filtering, onOpenCard }) {
  const [dragging, setDragging] = useState(null); // card id
  const [over, setOver] = useState(null); // { columnId, index }
  const [addingTo, setAddingTo] = useState(null);

  const visible = new Set(cards.map((c) => c.id));

  const end = () => {
    setDragging(null);
    setOver(null);
  };

  const drop = (columnId, index) => {
    if (dragging) store.moveCard(project.id, dragging, columnId, index);
    end();
  };

  return (
    <div className="proj-board" onDragEnd={end}>
      {project.columns.map((column, columnIndex) => {
        const all = cardsIn(project, column.id);
        const shown = all.filter((card) => visible.has(card.id));
        const hidden = all.length - shown.length;

        return (
          <Lane
            key={column.id}
            column={column}
            project={project}
            store={store}
            cards={shown}
            hidden={hidden}
            filtering={filtering}
            columnIndex={columnIndex}
            dragging={dragging}
            over={over}
            onOverChange={setOver}
            onDrop={drop}
            onDragStart={setDragging}
            onOpenCard={onOpenCard}
            adding={addingTo === column.id}
            onAdding={(on) => setAddingTo(on ? column.id : null)}
          />
        );
      })}

      <button type="button" onClick={() => store.addColumn(project.id)} className="proj-lane-add">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a list
      </button>
    </div>
  );
}

function Lane({
  column, project, store, cards, hidden, filtering, columnIndex,
  dragging, over, onOverChange, onDrop, onDragStart, onOpenCard, adding, onAdding,
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [menu, setMenu] = useState(false);
  const listRef = useRef(null);

  useEffect(() => setName(column.name), [column.name]);

  /**
   * Which gap the pointer is in.
   *
   * The card being dragged is skipped, so hovering over its own place does not
   * count it — otherwise dropping a card back where it started would shift it
   * by one, which looks like the board losing track.
   */
  const indexFor = (event) => {
    const rows = [...(listRef.current?.querySelectorAll('[data-card]') ?? [])].filter(
      (el) => el.dataset.card !== dragging,
    );
    const y = event.clientY;
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i].getBoundingClientRect();
      if (y < box.top + box.height / 2) return i;
    }
    return rows.length;
  };

  const onDragOver = (event) => {
    if (!dragging) return;
    event.preventDefault();
    const index = indexFor(event);
    if (over?.columnId !== column.id || over?.index !== index) onOverChange({ columnId: column.id, index });
  };

  const done = cards.filter((c) => c.done).length;

  return (
    <section
      className={`proj-lane ${over?.columnId === column.id ? 'is-target' : ''}`}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(column.id, indexFor(event));
      }}
      aria-label={column.name}
    >
      <header className="proj-lane-head">
        {renaming ? (
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              store.patchColumn(project.id, column.id, { name: name.trim() || column.name });
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                store.patchColumn(project.id, column.id, { name: name.trim() || column.name });
                setRenaming(false);
              }}
              className="field h-7 w-full text-[0.9375rem]"
            />
          </form>
        ) : (
          <button type="button" onClick={() => setRenaming(true)} className="proj-lane-name" title="Rename this list">
            {column.done ? <Check className="h-3.5 w-3.5 text-rise" aria-hidden="true" /> : null}
            {column.name}
          </button>
        )}

        <span className="proj-lane-count">
          {filtering && hidden ? `${cards.length}/${cards.length + hidden}` : cards.length}
          {column.done && cards.length ? '' : done ? ` · ${done} done` : ''}
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label={`${column.name} list options`}
            className="proj-icon"
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {menu ? (
            <>
              <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setMenu(false)} />
              <div className="proj-menu">
                <button type="button" onClick={() => { setRenaming(true); setMenu(false); }}>Rename</button>
                <button
                  type="button"
                  onClick={() => { store.patchColumn(project.id, column.id, { done: !column.done }); setMenu(false); }}
                >
                  {column.done ? 'Not the finishing list' : 'This list means done'}
                </button>
                {columnIndex > 0 ? (
                  <button type="button" onClick={() => { store.moveColumn(project.id, column.id, columnIndex - 1); setMenu(false); }}>
                    Move left
                  </button>
                ) : null}
                {columnIndex < project.columns.length - 1 ? (
                  <button type="button" onClick={() => { store.moveColumn(project.id, column.id, columnIndex + 1); setMenu(false); }}>
                    Move right
                  </button>
                ) : null}
                {project.columns.length > 1 ? (
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => { store.removeColumn(project.id, column.id); setMenu(false); }}
                  >
                    Delete list
                    <span className="proj-menu-note">its cards move left</span>
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </header>

      <div ref={listRef} className="proj-lane-cards glass-scroll">
        {cards.map((card, index) => (
          <div key={card.id} className="contents">
            {over?.columnId === column.id && over.index === index ? <span className="proj-gap" aria-hidden="true" /> : null}
            <Card
              card={card}
              project={project}
              store={store}
              dragging={dragging === card.id}
              onDragStart={onDragStart}
              onOpen={() => onOpenCard(card.id)}
            />
          </div>
        ))}
        {over?.columnId === column.id && over.index >= cards.length ? <span className="proj-gap" aria-hidden="true" /> : null}

        {!cards.length && !adding ? (
          <p className="proj-lane-empty">{hidden ? `${hidden} hidden by the filter` : 'Nothing here yet'}</p>
        ) : null}

        {adding ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const title = new FormData(event.currentTarget).get('title')?.toString().trim();
              if (title) store.addCard(project.id, column.id, title);
              event.currentTarget.reset();
            }}
          >
            <textarea
              name="title"
              autoFocus
              rows={2}
              placeholder="What needs doing?"
              className="proj-new-card"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
                if (event.key === 'Escape') onAdding(false);
              }}
              onBlur={(event) => { if (!event.currentTarget.value.trim()) onAdding(false); }}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button type="submit" className="pill pill-lit h-7 px-3 text-[0.75rem]">Add</button>
              <button type="button" onClick={() => onAdding(false)} className="proj-icon">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {!adding ? (
        <button type="button" onClick={() => onAdding(true)} className="proj-card-add">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add a card
        </button>
      ) : null}
    </section>
  );
}

function Card({ card, project, store, dragging, onDragStart, onOpen }) {
  const progress = progressOf(card);
  const state = dueState(card);
  const labels = (card.labels ?? [])
    .map((id) => project.labels.find((l) => l.id === id))
    .filter(Boolean);

  return (
    <article
      data-card={card.id}
      draggable
      onDragStart={(event) => {
        onDragStart(card.id);
        event.dataTransfer.effectAllowed = 'move';
        // Firefox will not start a drag without something on the transfer.
        event.dataTransfer.setData('text/plain', card.id);
      }}
      className={`proj-card ${dragging ? 'is-dragging' : ''} ${card.done ? 'is-done' : ''}`}
    >
      {labels.length ? (
        <div className="proj-card-labels">
          {labels.map((label) => (
            <span key={label.id} className="proj-card-label" style={{ background: colourOf(label.colour).hex }} title={label.name} />
          ))}
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => store.toggleCard(project.id, card.id)}
          aria-label={card.done ? 'Mark as not done' : 'Mark as done'}
          className={`proj-tick ${card.done ? 'is-on' : ''}`}
        >
          {card.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
        </button>
        <button type="button" onClick={onOpen} className="proj-card-title">
          {card.title || 'Untitled'}
        </button>
      </div>

      {(progress || card.due || card.comments?.length || card.links?.length || card.notes) ? (
        <div className="proj-card-meta">
          {card.due ? (
            <span className={`proj-due proj-due--${state}`}>{readDate(card.due)}</span>
          ) : null}
          {progress ? (
            <span className={progress.ratio === 1 ? 'text-rise' : ''}>
              {progress.done}/{progress.total}
            </span>
          ) : null}
          {card.notes ? <Paperclip className="h-3 w-3" aria-hidden="true" /> : null}
          {card.comments?.length ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              {card.comments.length}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => store.removeCard(project.id, card.id)}
            aria-label={`Delete ${card.title || 'this card'}`}
            className="proj-card-del"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </article>
  );
}
