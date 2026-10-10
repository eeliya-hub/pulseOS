import {
  CalendarPlus,
  CheckSquare,
  CornerUpLeft,
  FolderPlus,
  Lightbulb,
  ListPlus,
  Sparkles,
  Text,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * What Pulse can do with the words you just highlighted.
 *
 * Appears beside the selection the way a system text menu does, offering only
 * things that make sense for a fragment of an email. Every one of the actions
 * that would CHANGE something opens a review card first — none of them writes
 * to the calendar, the to-do list or a project on its own.
 */
const ACTIONS = [
  { id: 'explain', label: 'Explain', Icon: Lightbulb, hint: 'Say what this means in plain language' },
  { id: 'summarise', label: 'Summarise', Icon: Text, hint: 'Boil it down' },
  { id: 'task', label: 'Create task', Icon: CheckSquare, hint: 'Propose a to-do from this' },
  { id: 'today', label: 'Add to today', Icon: ListPlus, hint: "Propose it for today's list" },
  { id: 'project', label: 'Add to a project', Icon: FolderPlus, hint: 'Propose it against one of your projects' },
  { id: 'event', label: 'Add to calendar', Icon: CalendarPlus, hint: 'Propose an event from this' },
  { id: 'reply', label: 'Draft a reply', Icon: CornerUpLeft, hint: 'Open the composer with a reply about this' },
];

export default function MailAskMenu({ selection, onAction, onDismiss }) {
  const menu = useRef(null);
  const [place, setPlace] = useState(null);
  const [expanded, setExpanded] = useState(false);

  // Positioned after layout, from the real size of the menu — guessing its
  // height puts it off the bottom of the window for a selection low down.
  useLayoutEffect(() => {
    const node = menu.current;
    const rect = selection?.rect;
    if (!node || !rect) {
      setPlace(null);
      return;
    }
    const size = node.getBoundingClientRect();
    const margin = 10;
    // Above the selection by preference, below it when there is no room up there.
    const above = rect.top - size.height - margin;
    const top = above > margin ? above : Math.min(rect.bottom + margin, window.innerHeight - size.height - margin);
    const left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - size.width / 2),
      window.innerWidth - size.width - margin,
    );
    setPlace({ top, left });
  }, [selection, expanded]);

  // A fresh selection starts collapsed again.
  useEffect(() => setExpanded(false), [selection?.text]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (!selection?.text) return null;

  const shown = expanded ? ACTIONS : ACTIONS.slice(0, 3);

  return createPortal(
    <div
      ref={menu}
      className="mail-ask-menu fade-in"
      style={place ? { top: place.top, left: place.left } : { opacity: 0, top: -9999, left: -9999 }}
      role="menu"
      aria-label="Ask Pulse about the highlighted text"
    >
      <p className="mail-ask-quote" title={selection.text}>
        <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate">“{selection.text}”</span>
      </p>
      <div className="mail-ask-actions">
        {shown.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            title={action.hint}
            onClick={() => onAction(action.id, selection.text)}
            className="mail-ask-action"
          >
            <action.Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
            {action.label}
          </button>
        ))}
        {!expanded ? (
          <button type="button" onClick={() => setExpanded(true)} className="mail-ask-action mail-ask-action--more">
            More…
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
