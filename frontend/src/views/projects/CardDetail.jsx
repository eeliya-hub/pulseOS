import { Check, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colourOf, dueState, progressOf } from '../../services/projects/board.js';
import { readDate } from '../../services/mail/dates.js';

/**
 * One card, in full.
 *
 * The Notion half of this: a title you edit in place, a note, a checklist with
 * its own progress, labels, two dates, and a thread of comments. Everything
 * saves as you type — there is no Save button because there is nothing to save
 * it to but this browser, and a button that only writes to localStorage is a
 * button pretending to be a network.
 */
export default function CardDetail({ project, card, store, today, onClose }) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? '');
  const [item, setItem] = useState('');
  const [comment, setComment] = useState('');
  const titleRef = useRef(null);

  // Following the store: another view may have changed this card underneath.
  useEffect(() => setTitle(card.title), [card.id, card.title]);
  useEffect(() => setNotes(card.notes ?? ''), [card.id, card.notes]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const save = (changes) => store.patchCard(project.id, card.id, changes);
  const progress = progressOf(card);
  const state = dueState(card, today);
  const column = project.columns.find((c) => c.id === card.columnId);

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md" onClick={onClose} role="presentation" aria-hidden="true" />

      <div
        className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label={card.title || 'Card'}
      >
        <header className="flex shrink-0 items-start gap-3 px-6 pb-3 pt-5">
          <button
            type="button"
            onClick={() => store.toggleCard(project.id, card.id)}
            aria-label={card.done ? 'Mark as not done' : 'Mark as done'}
            className={`proj-tick mt-1.5 ${card.done ? 'is-on' : ''}`}
          >
            {card.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
          </button>

          <div className="min-w-0 flex-1">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => save({ title: title.trim() || 'Untitled' })}
              rows={1}
              className="proj-detail-title"
              aria-label="Card title"
            />
            <p className="t-micro mt-1">
              in <strong className="text-moon/80">{column?.name ?? 'a list'}</strong>
              {card.createdAt ? ` · added ${readDate(card.createdAt.slice(0, 10))}` : ''}
            </p>
          </div>

          <button type="button" onClick={onClose} aria-label="Close" className="proj-icon mt-0.5">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="glass-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
          {/* ── Labels ───────────────────────────────────────────────────── */}
          <section>
            <p className="t-label mb-2 text-[0.75rem]">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {project.labels.map((label) => {
                const on = (card.labels ?? []).includes(label.id);
                const hex = colourOf(label.colour).hex;
                return (
                  <button
                    key={label.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => store.toggleCardLabel(project.id, card.id, label.id)}
                    className="proj-chip"
                    style={
                      on
                        ? { color: hex, background: `color-mix(in srgb, ${hex} 22%, transparent)`, boxShadow: `inset 0 0 0 1px ${hex}` }
                        : { color: hex }
                    }
                  >
                    <span className="proj-dot" style={{ background: hex }} aria-hidden="true" />
                    {label.name}
                  </button>
                );
              })}
              {!project.labels.length ? <p className="t-micro">None on this board yet — add some in project settings.</p> : null}
            </div>
          </section>

          {/* ── Dates ────────────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="t-label mb-1.5 block text-[0.75rem]">Start</span>
              <input
                type="date"
                value={card.start ?? ''}
                onChange={(event) => save({ start: event.target.value || null })}
                className="field"
              />
            </label>
            <label className="block">
              <span className="t-label mb-1.5 block text-[0.75rem]">Due</span>
              <input
                type="date"
                value={card.due ?? ''}
                onChange={(event) => save({ due: event.target.value || null })}
                className={`field proj-due--${state ?? 'plain'}`}
              />
            </label>
          </section>

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <section>
            <p className="t-label mb-2 text-[0.75rem]">Notes</p>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => save({ notes })}
              rows={4}
              placeholder="Anything worth remembering about this one."
              className="field field--area"
            />
          </section>

          {/* ── Checklist ────────────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="t-label text-[0.75rem]">Checklist</p>
              {progress ? (
                <span className="t-micro">
                  {progress.done} of {progress.total}
                </span>
              ) : null}
            </div>

            {progress ? (
              <div className="settings-meter mb-3">
                <span className="bar-grow" style={{ width: `${progress.ratio * 100}%` }} />
              </div>
            ) : null}

            <ul className="space-y-1">
              {(card.checklist ?? []).map((entry) => (
                <li key={entry.id} className="proj-check">
                  <button
                    type="button"
                    onClick={() => store.toggleChecklistItem(project.id, card.id, entry.id)}
                    aria-label={entry.done ? `Untick ${entry.label}` : `Tick ${entry.label}`}
                    className={`proj-tick ${entry.done ? 'is-on' : ''}`}
                  >
                    {entry.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                  </button>
                  <span className={entry.done ? 'line-through text-moon/40' : ''}>{entry.label}</span>
                  <button
                    type="button"
                    onClick={() => store.removeChecklistItem(project.id, card.id, entry.id)}
                    aria-label={`Remove ${entry.label}`}
                    className="proj-icon ml-auto"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!item.trim()) return;
                store.addChecklistItem(project.id, card.id, item.trim());
                setItem('');
              }}
            >
              <input
                value={item}
                onChange={(event) => setItem(event.target.value)}
                placeholder="Add a step"
                className="field h-8 flex-1 text-[0.875rem]"
              />
              <button type="submit" className="proj-icon" aria-label="Add this step">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </section>

          {/* ── Comments ─────────────────────────────────────────────────── */}
          <section>
            <p className="t-label mb-2 flex items-center gap-1.5 text-[0.75rem]">
              <MessageSquare className="h-3 w-3" aria-hidden="true" />
              Notes to self
            </p>
            <ul className="space-y-2">
              {(card.comments ?? []).map((entry) => (
                <li key={entry.id} className="proj-comment">
                  <p className="t-body whitespace-pre-wrap text-[0.9375rem]">{entry.text}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="t-micro">{readDate(entry.at.slice(0, 10))}</span>
                    <button
                      type="button"
                      onClick={() => store.removeComment(project.id, card.id, entry.id)}
                      className="t-micro text-moon/40 hover:text-fall"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <form
              className="mt-2 flex items-start gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim()) return;
                store.addComment(project.id, card.id, comment.trim());
                setComment('');
              }}
            >
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={2}
                placeholder="Where you got to, what you decided…"
                className="field field--area flex-1 text-[0.875rem]"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form.requestSubmit();
                }}
              />
              <button type="submit" className="pill h-8 shrink-0 px-3 text-[0.75rem]">Add</button>
            </form>
          </section>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-6 py-3">
          <select
            value={card.columnId}
            onChange={(event) => store.moveCard(project.id, card.id, event.target.value, null)}
            aria-label="Which list"
            className="proj-td-select h-9"
          >
            {project.columns.map((c) => (
              <option key={c.id} value={c.id} className="bg-ink text-moon">{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              store.removeCard(project.id, card.id);
              onClose();
            }}
            className="pill ml-auto h-9 px-4 text-moon/70 hover:text-fall"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete card
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
