import { Plus, X } from 'lucide-react';
import { useState } from 'react';

// Always-on, low-key inline editing primitives. There is no "edit mode" — every
// value is editable in place. Fields look like text and only reveal a soft
// highlight on hover/focus, so the view still reads calmly at a glance.

const classes = (...list) => list.filter(Boolean).join(' ');

// Editable text that inherits the surrounding typography.
export function EditableText({
  value,
  onChange,
  placeholder = '',
  className = '',
  align = 'left',
  auto = false,
  autoFocus = false,
  'aria-label': ariaLabel,
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={classes(
        'editable-field bg-transparent text-inherit outline-none',
        auto && 'editable-auto',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    />
  );
}

// Editable number. Shows the formatted value at rest, the raw number while
// focused, so the calm display survives but the value is one click from editable.
export function EditableAmount({
  value,
  onChange,
  format = (input) => String(input),
  className = '',
  align = 'right',
  auto = false,
  'aria-label': ariaLabel,
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={focused ? draft : format(value)}
      onFocus={(event) => {
        const el = event.target;
        setDraft(Number.isFinite(value) ? String(value) : '');
        setFocused(true);
        requestAnimationFrame(() => el.select());
      }}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d.-]/g, ''))}
      onBlur={() => {
        setFocused(false);
        const next = Number(draft);
        onChange(draft === '' || Number.isNaN(next) ? 0 : next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={classes(
        'editable-field bg-transparent text-inherit outline-none',
        auto && 'editable-auto',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    />
  );
}

const dateLabelFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

// Opening the native picker takes an explicit showPicker(). A click anywhere on
// an <input type="date"> does NOT open it — only the little calendar indicator
// does, and at opacity 0 there is nothing to aim at. That is why clicking these
// fields appeared to do nothing at all.
function openPicker(event) {
  const input = event.currentTarget;
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Only throws when it isn't allowed (no user gesture, cross-origin frame);
    // the field is still typeable either way.
  }
}

// A neatly formatted date ("20 Aug 2026") that opens the native picker on click —
// the real <input type="date"> sits transparent on top so editing stays effortless.
export function EditableDate({ value, onChange, className = '', 'aria-label': ariaLabel }) {
  const label = value ? dateLabelFmt.format(new Date(`${value}T00:00:00`)) : 'Set date';
  return (
    <span
      className={classes(
        'editable-field relative inline-flex cursor-pointer items-center whitespace-nowrap',
        className,
      )}
    >
      <span className={value ? '' : 'text-moon/40'}>{label}</span>
      <input
        type="date"
        value={value ?? ''}
        aria-label={ariaLabel}
        onClick={openPicker}
        onFocus={openPicker}
        onChange={(event) => onChange(event.target.value)}
        className="editable-date absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

// The same trick for a time of day ("09:15"), used for flight departure and
// arrival. `placeholder` is what shows when nothing is set yet.
export function EditableTime({ value, onChange, placeholder = 'Set time', className = '', 'aria-label': ariaLabel }) {
  return (
    <span
      className={classes(
        'editable-field relative inline-flex cursor-pointer items-center whitespace-nowrap',
        className,
      )}
    >
      <span className={classes('clock-figures', value ? '' : 'text-moon/40')}>{value || placeholder}</span>
      <input
        type="time"
        value={value ?? ''}
        aria-label={ariaLabel}
        onClick={openPicker}
        onFocus={openPicker}
        onChange={(event) => onChange(event.target.value)}
        className="editable-date absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

// Hover / focus reveal delete. The parent row must carry the `group` class.
export function RemoveButton({ onClick, className = '', label = 'Remove' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={classes(
        'shrink-0 rounded-md p-1 text-moon/25 opacity-0 transition',
        'hover:bg-white/10 hover:text-rose-300',
        'focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
        'group-hover:opacity-100',
        className,
      )}
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

// Understated "add" affordance — a dashed ghost row that brightens on hover.
export function AddRow({ onClick, label, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classes(
        'group/add flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left',
        'text-moon/40 transition hover:text-moon/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        className,
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-dashed border-white/25 transition group-hover/add:border-accent/55">
        <Plus className="h-2.5 w-2.5" aria-hidden="true" />
      </span>
      <span className="text-[0.8125rem] font-medium">{label}</span>
    </button>
  );
}
