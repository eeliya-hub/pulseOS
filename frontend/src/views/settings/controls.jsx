import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/*
 * The pieces every Settings section is built from. One of each, so a switch on
 * the Music page is the same switch as on the Appearance page, and a field is
 * the same pill the Ask Pulse box on Home is drawn in.
 *
 * A section is a Page: one column of Groups. A Group is a title, a line about
 * it if it needs one, and a well of rows. A row says what it is on the left
 * and holds its control on the right.
 */

/** A section's column. */
export function Page({ children }) {
  return <div className="settings-page">{children}</div>;
}

/**
 * A group of settings: its name in the display face, a line about it, and its
 * rows set into one well. `bare` leaves the well out, for a group that is one
 * object of its own — a grid of icons, a piece of writing.
 */
export function Group({ title, note, action, children, bare = false, pad = false, className = '' }) {
  return (
    <section className={`settings-group ${className}`}>
      <header className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h2 className="settings-group-title">{title}</h2>
          {note ? <p className="t-meta mt-1.5 max-w-[40rem] text-[0.875rem] leading-relaxed">{note}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      {bare ? <div className="mt-4">{children}</div> : <div className={`settings-well ${pad ? 'settings-well--pad' : ''}`}>{children}</div>}
    </section>
  );
}

/** A setting: what it is on the left, its control on the right. */
export function Row({ label, hint, lead = null, children, className = '' }) {
  return (
    <div className={`settings-row ${className}`}>
      {lead}
      <div className="min-w-0 flex-1">
        <span className="settings-row-label">{label}</span>
        {hint ? <span className="settings-row-hint">{hint}</span> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** The quiet sentence under something. */
export function Hint({ children, className = 'mt-3' }) {
  return <p className={`t-meta max-w-[40rem] text-[0.875rem] leading-relaxed ${className}`}>{children}</p>;
}

/** On or off. */
export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="switch focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span className="switch-knob" aria-hidden="true" />
    </button>
  );
}

/**
 * A setting that is simply on or off. The whole row is a label around the
 * switch, so a click anywhere on its words flips it — once.
 */
export function ToggleRow({ label, hint, checked, onChange, lead = null, disabled = false }) {
  return (
    <label className={`settings-row ${disabled ? 'opacity-45' : 'settings-row--act'}`}>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="settings-row-label">{label}</span>
        {hint ? <span className="settings-row-hint">{hint}</span> : null}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </label>
  );
}

/**
 * A row you choose from a list. `lead` is whatever stands for it — a swatch, an
 * icon, a sleeve — and the tick at the end says it's the one.
 */
export function Choice({ selected, onClick, lead = null, title, meta, trailing = null, disabled = false, multi = false }) {
  const state = multi ? { 'aria-pressed': selected } : { role: 'radio', 'aria-checked': selected };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="settings-choice focus:outline-none focus-visible:bg-white/[0.05]"
      {...state}
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[0.9688rem] ${selected ? 'text-moon' : 'text-moon/80'}`}>{title}</span>
        {meta ? <span className="t-meta mt-0.5 block truncate">{meta}</span> : null}
      </span>
      {trailing}
      <span className="settings-tick" aria-hidden="true">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </button>
  );
}

/**
 * A few options, one of them lit: in one pill, or — `wrap`, for more than fits
 * — as loose pills that run on to a second line.
 */
export function Segmented({ options, value, onChange, label, size = 'h-8 px-3.5', wrap = false }) {
  return (
    <div className={wrap ? 'flex flex-wrap justify-end gap-1.5' : 'pill-group'} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`pill ${size} text-[0.8125rem] ${value === option.id ? 'pill-lit' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A text field that keeps its own draft while you type and hands it over when
 * you pause, press Enter or leave it — so a field that drives a fetch (the
 * weather follows your location) isn't asked about every letter on the way.
 * `delay` 0 hands over every keystroke.
 */
export function Field({
  value,
  onCommit,
  placeholder,
  delay = 0,
  type = 'text',
  transform = (v) => v,
  className = 'w-[19rem]',
  ...rest
}) {
  const [draft, setDraft] = useState(value ?? '');
  const editing = useRef(false);
  const last = useRef(value ?? '');

  // Follow the setting when it changes elsewhere — but never under your fingers.
  useEffect(() => {
    last.current = value ?? '';
    if (!editing.current) setDraft(value ?? '');
  }, [value]);

  const commit = (next) => {
    if (next === last.current) return;
    last.current = next;
    onCommit(next);
  };

  useEffect(() => {
    if (!delay || !editing.current) return undefined;
    const id = window.setTimeout(() => commit(draft), delay);
    return () => window.clearTimeout(id);
    // commit reads refs; only the draft starts the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, delay]);

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => {
        const next = transform(e.target.value);
        setDraft(next);
        if (!delay) commit(next);
      }}
      onBlur={() => {
        editing.current = false;
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(draft);
          e.currentTarget.blur();
        }
      }}
      className={`field ${className}`}
      {...rest}
    />
  );
}

/** A longer piece of writing, handed over as you type. */
export function Area({ value, onChange, placeholder, rows = 8, className = '', ...rest }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`field field--area glass-scroll ${className}`}
      {...rest}
    />
  );
}

/** A native picker dressed as a field. */
export function Select({ value, onChange, options, label, className = 'w-[19rem]' }) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="field">
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-ink text-moon">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-moon/50"
        aria-hidden="true"
      />
    </div>
  );
}

/** A value along a line — how dim, how soft — with the amount said beside it. */
export function Slider({ value, onChange, min = 0, max = 1, step = 0.01, label, format = (v) => v }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="settings-slider"
        style={{ '--fill': `${fill}%` }}
      />
      <span className="clock-figures w-12 text-right text-[0.875rem] text-moon/70">{format(value)}</span>
    </div>
  );
}

/** Said in place of a list that has nothing in it yet. */
export function Empty({ children }) {
  return <p className="px-5 py-5 text-[0.9375rem] text-dim">{children}</p>;
}

/**
 * A press that asks twice before doing something that can't be taken back. The
 * first press turns it into the question; the second answers it; leaving it be
 * puts it back after a few seconds.
 */
export function Confirm({ children, ask, onConfirm, className = 'pill h-9 px-4' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      className={`${className} ${armed ? '!text-fall' : ''}`}
    >
      {armed ? ask : children}
    </button>
  );
}

/** The window in a section's header onto what the section shapes. */
export function Preview({ children, className = '', style }) {
  return (
    <div className={`settings-preview ${className}`} style={style} aria-hidden="true">
      {children}
    </div>
  );
}
