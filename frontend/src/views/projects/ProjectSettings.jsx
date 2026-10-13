import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LABEL_COLOURS, colourOf } from '../../services/projects/board.js';

/**
 * What a board is, as against what is on it.
 *
 * Its name, a line about it, its colour, and the labels every card draws from.
 * Deleting the project is here and nowhere else, behind a confirm, because it
 * is the one action on this screen that cannot be undone by dragging something
 * back.
 */
export default function ProjectSettings({ project, store, onClose }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [label, setLabel] = useState('');
  const [colour, setColour] = useState('sky');
  const [confirming, setConfirming] = useState(false);

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

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md" onClick={onClose} role="presentation" aria-hidden="true" />

      <div
        className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label="Project settings"
      >
        <header className="flex shrink-0 items-center gap-3 px-6 pb-3 pt-5">
          <p className="t-label flex-1">This project</p>
          <button type="button" onClick={onClose} aria-label="Close" className="proj-icon">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="glass-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5">
          <label className="block">
            <span className="t-label mb-1.5 block text-[0.75rem]">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => store.patchProject(project.id, { name: name.trim() || project.name })}
              className="field"
            />
          </label>

          <label className="block">
            <span className="t-label mb-1.5 block text-[0.75rem]">What it is</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => store.patchProject(project.id, { description })}
              rows={2}
              placeholder="One line, for the top of the board."
              className="field field--area"
            />
          </label>

          <div>
            <p className="t-label mb-2 text-[0.75rem]">Colour</p>
            <div className="flex flex-wrap gap-2">
              {LABEL_COLOURS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.name}
                  aria-pressed={project.colour === c.id}
                  onClick={() => store.patchProject(project.id, { colour: c.id })}
                  className={`proj-swatch ${project.colour === c.id ? 'is-on' : ''}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="t-label mb-2 text-[0.75rem]">Labels</p>
            <ul className="space-y-1.5">
              {project.labels.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2">
                  <span className="proj-dot" style={{ background: colourOf(entry.colour).hex }} aria-hidden="true" />
                  <input
                    value={entry.name}
                    onChange={(event) => store.patchLabel(project.id, entry.id, { name: event.target.value })}
                    aria-label={`Name of the ${entry.name} label`}
                    className="field h-8 flex-1 text-[0.875rem]"
                  />
                  <select
                    value={entry.colour}
                    onChange={(event) => store.patchLabel(project.id, entry.id, { colour: event.target.value })}
                    aria-label={`Colour of the ${entry.name} label`}
                    className="proj-td-select"
                  >
                    {LABEL_COLOURS.map((c) => (
                      <option key={c.id} value={c.id} className="bg-ink text-moon">{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => store.removeLabel(project.id, entry.id)}
                    aria-label={`Delete the ${entry.name} label`}
                    title="Removes it from every card that wears it"
                    className="proj-icon"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!label.trim()) return;
                store.addLabel(project.id, label.trim(), colour);
                setLabel('');
              }}
            >
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="New label"
                className="field h-8 flex-1 text-[0.875rem]"
              />
              <select value={colour} onChange={(event) => setColour(event.target.value)} aria-label="Its colour" className="proj-td-select">
                {LABEL_COLOURS.map((c) => (
                  <option key={c.id} value={c.id} className="bg-ink text-moon">{c.name}</option>
                ))}
              </select>
              <button type="submit" className="proj-icon" aria-label="Add this label">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-6 py-3">
          {confirming ? (
            <>
              <p className="t-micro flex-1">Delete “{project.name}” and its {project.cards.length} cards?</p>
              <button
                type="button"
                onClick={() => {
                  store.removeProject(project.id);
                  onClose();
                }}
                className="pill h-9 px-4 !bg-fall/20 !text-fall"
              >
                Delete it
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="pill h-9 px-4">Keep it</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="pill ml-auto h-9 px-4 text-moon/70 hover:text-fall">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete project
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
