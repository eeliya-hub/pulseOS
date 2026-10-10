import { AlertTriangle, CalendarPlus, Check, CheckSquare, FolderPlus, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { dateKey } from '../../hooks/useLifeData.js';

/**
 * What Pulse thinks it found, for you to agree with or change.
 *
 * This card is the whole safety story for the email → task → project → calendar
 * path. The model proposes; every field is editable here; nothing is written
 * until the button at the bottom is pressed. There is no path in the code that
 * reaches the task list or the calendar without passing through it.
 *
 * Where the model was unsure, it says so in its own words at the top — "I think
 * this is a meeting on Thursday at 2pm" — rather than presenting a guess as a
 * finding.
 */

const KIND = {
  task: { label: 'Task', Icon: CheckSquare, verb: 'Add to to-do' },
  today: { label: 'Task for today', Icon: CheckSquare, verb: "Add to today's list" },
  project: { label: 'Project task', Icon: FolderPlus, verb: 'Add to project' },
  event: { label: 'Calendar event', Icon: CalendarPlus, verb: 'Add to calendar' },
};

export default function MailProposal({ proposal, projects, calendars, onConfirm, onClose }) {
  const kind = KIND[proposal.kind] ?? KIND.task;
  const [title, setTitle] = useState(proposal.title ?? '');
  const [due, setDue] = useState(proposal.due ?? proposal.date ?? '');
  const [notes, setNotes] = useState(proposal.notes ?? '');
  const [project, setProject] = useState(() => matchProject(projects, proposal.project));
  const [location, setLocation] = useState(proposal.location ?? '');
  const [start, setStart] = useState(proposal.start ?? '');
  const [end, setEnd] = useState(proposal.end ?? '');
  const [allDay, setAllDay] = useState(Boolean(proposal.allDay) || (!proposal.start && proposal.kind === 'event'));
  const [calendarId, setCalendarId] = useState(() => calendars?.[0]?.id ?? 'personal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

  const unsure = proposal.confidence && proposal.confidence !== 'high';
  // The sentence Pulse leads with, hedged to match how sure it actually is.
  const preamble = useMemo(() => {
    if (!unsure) return null;
    const what = proposal.kind === 'event' ? 'an event' : 'something to do';
    return proposal.note
      ? `I think there's ${what} here, but ${lowerFirst(proposal.note)}`
      : `I think there's ${what} here — worth checking before you add it.`;
  }, [unsure, proposal.kind, proposal.note]);

  const valid = title.trim().length > 0 && (proposal.kind !== 'event' || Boolean(due));

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        kind: proposal.kind,
        title: title.trim(),
        due: due || null,
        notes: notes.trim() || null,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        location: location.trim() || null,
        start: start || null,
        end: end || null,
        allDay,
        calendarId,
        source: proposal.source,
      });
      onClose({ added: true });
    } catch (err) {
      setError(err?.message ?? 'That didn’t save.');
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-[#070b18]/72 backdrop-blur-md"
        onClick={() => !busy && onClose()}
        role="presentation"
        aria-hidden="true"
      />

      <div
        className="theme-card fade-in relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${kind.label} from an email`}
      >
        <div className="flex shrink-0 items-start gap-3 px-6 pb-3 pt-5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[0.7rem] bg-white/[0.07] text-accent">
            <kind.Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-label flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
              {kind.label} from this email
            </p>
            {proposal.source?.subject ? <p className="t-micro mt-1 truncate">{proposal.source.subject}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Cancel"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-moon/55 transition-colors hover:bg-white/[0.07] hover:text-moon"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Pulse saying how sure it is, before anything is agreed to. */}
        {preamble ? (
          <p className="mx-6 mb-3 flex items-start gap-2 rounded-xl bg-amber-200/[0.09] px-3 py-2 text-[0.8125rem] leading-relaxed text-amber-100/85">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {preamble}
          </p>
        ) : null}

        <div className="glass-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-4">
          <Line label={proposal.kind === 'event' ? 'Event' : 'Task'}>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={proposal.kind === 'event' ? 'What it is' : 'What to do'}
              className="field"
              autoFocus
            />
          </Line>

          {proposal.kind === 'event' ? (
            <>
              <Line label="Date">
                <input type="date" value={due ?? ''} onChange={(event) => setDue(event.target.value)} className="field" />
              </Line>
              <Line label="Time">
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={start ?? ''}
                    onChange={(event) => setStart(event.target.value)}
                    disabled={allDay}
                    className="field w-[7rem] disabled:opacity-40"
                  />
                  <span className="t-micro">to</span>
                  <input
                    type="time"
                    value={end ?? ''}
                    onChange={(event) => setEnd(event.target.value)}
                    disabled={allDay}
                    className="field w-[7rem] disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setAllDay((v) => !v)}
                    aria-pressed={allDay}
                    className={`pill h-8 shrink-0 px-3 text-[0.75rem] ${allDay ? 'pill-lit' : ''}`}
                  >
                    All day
                  </button>
                </div>
              </Line>
              <Line label="Where">
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Optional"
                  className="field"
                />
              </Line>
              {calendars?.length ? (
                <Line label="Calendar">
                  <select
                    value={calendarId}
                    onChange={(event) => setCalendarId(event.target.value)}
                    className="field"
                    aria-label="Which calendar"
                  >
                    {calendars.map((cal) => (
                      <option key={cal.id} value={cal.id} className="bg-ink text-moon">
                        {cal.name}
                      </option>
                    ))}
                  </select>
                </Line>
              ) : null}
              {proposal.participants?.length ? (
                <Line label="Who">
                  <p className="t-body text-moon/70">{proposal.participants.join(', ')}</p>
                </Line>
              ) : null}
            </>
          ) : (
            <>
              <Line label="Due">
                <input type="date" value={due ?? ''} onChange={(event) => setDue(event.target.value)} className="field" />
              </Line>
              {proposal.kind === 'project' || projects?.length ? (
                <Line label="Project">
                  <select
                    value={project?.id ?? ''}
                    onChange={(event) => setProject(projects.find((p) => p.id === event.target.value) ?? null)}
                    className="field"
                    aria-label="Which project"
                  >
                    <option value="" className="bg-ink text-moon">
                      {proposal.kind === 'project' ? 'Pick a project' : 'Just my to-do list'}
                    </option>
                    {(projects ?? []).map((p) => (
                      <option key={p.id} value={p.id} className="bg-ink text-moon">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Line>
              ) : null}
              {/* Only where the model actually had something to add. */}
              {notes ? (
                <Line label="Notes">
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={2}
                    className="field field--area"
                  />
                </Line>
              ) : null}
            </>
          )}

          {/* What it came from, so the task is traceable back to the email. */}
          {proposal.source?.from ? (
            <p className="t-micro border-t border-white/[0.07] pt-3">
              From {proposal.source.from}
              {due ? ` · ${friendlyDate(due)}` : ''}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-white/[0.07] px-6 py-3">
          <button type="button" onClick={confirm} disabled={busy || !valid} className="pill pill-lit h-10 px-5 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {kind.verb}
          </button>
          <button type="button" onClick={() => !busy && onClose()} className="pill h-10 px-4 text-moon/70">
            Cancel
          </button>
          {error ? <p className="ml-auto text-[0.8125rem] text-fall">{error}</p> : null}
          {!error && !valid ? (
            <p className="t-micro ml-auto">
              {title.trim() ? 'Needs a date' : 'Needs a title'}
            </p>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Line({ label, children }) {
  return (
    <label className="block">
      <span className="t-label mb-1.5 block text-[0.75rem]">{label}</span>
      {children}
    </label>
  );
}

/** The model names a project in words; this finds the one it meant. */
function matchProject(projects, name) {
  if (!name || !projects?.length) return null;
  const needle = String(name).trim().toLowerCase();
  return (
    projects.find((p) => p.name.toLowerCase() === needle) ??
    projects.find((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase())) ??
    null
  );
}

function friendlyDate(key) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  const today = dateKey(new Date());
  if (key === today) return 'today';
  if (key === dateKey(new Date(Date.now() + 86400000))) return 'tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const lowerFirst = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
