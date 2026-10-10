import {
  CalendarPlus,
  CheckSquare,
  Clock,
  CornerUpLeft,
  Loader2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { isPast, readDate } from '../../services/mail/dates.js';
import { nothingFound } from '../../services/mail/findings.js';

/**
 * What Pulse found in this email, as things you can do something about.
 *
 * This replaced a button that returned a paragraph. "What do I need to do?"
 * answered in prose — accurate enough, and useless: the whole point of reading
 * an email inside Pulse rather than in a mail tab is that the meeting in it can
 * become a meeting in your calendar, and a paragraph cannot be added to
 * anything. So the model now returns the findings, and each one carries the
 * button that acts on it.
 *
 * Every row is still a PROPOSAL. The buttons open the review card with the
 * fields filled in; nothing here writes to the calendar, the to-do list or a
 * project, and there is no path from this component that does.
 *
 * Dates are shown as the day they resolved to AND the words they came from —
 * "Thursday 9 October · from 'end of day Friday'". That is not decoration: it
 * is the only way to tell a misread date from a correct one at a glance, and
 * the model is quoting the email rather than doing the arithmetic precisely so
 * that this check is possible.
 */
export default function MailFindings({ findings, busy, error, onAct, onReply, onClose }) {
  if (busy) {
    return (
      <Shell onClose={onClose}>
        <p className="t-body flex items-center gap-2 text-moon/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Reading it through…
        </p>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell onClose={onClose}>
        <p className="t-body text-fall">{error}</p>
      </Shell>
    );
  }

  if (!findings) return null;

  const { summary, events = [], tasks = [], deadlines = [], people = [], replyNeeded, replyWhy } = findings;
  const nothing = nothingFound(findings);

  return (
    <Shell onClose={onClose}>
      {summary ? <p className="t-body leading-relaxed text-moon/90">{summary}</p> : null}

      {nothing ? (
        <p className="t-micro mt-2">
          Nothing in it to diarise or do — {replyNeeded ? 'though it does want a reply.' : 'and it needs no reply.'}
        </p>
      ) : null}

      {events.length ? (
        <Section title={events.length === 1 ? 'In the diary' : `${events.length} for the diary`}>
          {events.map((event, index) => (
            <Row
              key={`event-${index}`}
              Icon={CalendarPlus}
              title={event.title}
              date={event.due}
              from={event.dateFrom}
              time={event.start ? `${event.start}${event.end ? `–${event.end}` : ''}` : null}
              where={event.location}
              note={event.note}
              confidence={event.confidence}
              action="Add to calendar"
              onAct={() => onAct('event', event)}
            />
          ))}
        </Section>
      ) : null}

      {tasks.length ? (
        <Section title={tasks.length === 1 ? 'To do' : `${tasks.length} to do`}>
          {tasks.map((task, index) => (
            <Row
              key={`task-${index}`}
              Icon={CheckSquare}
              title={task.title}
              date={task.due}
              from={task.dateFrom}
              note={task.note}
              confidence={task.confidence}
              action="Add to to-do"
              onAct={() => onAct('task', task)}
            />
          ))}
        </Section>
      ) : null}

      {deadlines.length ? (
        <Section title="Dates to know">
          {deadlines.map((deadline, index) => (
            <Row
              key={`deadline-${index}`}
              Icon={Clock}
              title={deadline.what}
              date={deadline.due}
              from={deadline.dateFrom}
              confidence={deadline.confidence}
              action="Add to to-do"
              onAct={() => onAct('task', { title: deadline.what, due: deadline.due, dateFrom: deadline.dateFrom })}
            />
          ))}
        </Section>
      ) : null}

      {people.length ? (
        <Section title="Who's in it">
          <p className="t-micro flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1">
            <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
            {people.map((person, index) => (
              <span key={`${person.name}-${index}`}>
                <span className="text-moon/75">{person.name}</span>
                {person.role ? <span className="text-moon/45"> — {person.role}</span> : null}
                {index < people.length - 1 ? <span className="text-moon/30"> · </span> : null}
              </span>
            ))}
          </p>
        </Section>
      ) : null}

      {replyNeeded ? (
        <div className="mt-3 flex items-center gap-2.5 border-t border-white/[0.07] pt-3">
          <button type="button" onClick={onReply} className="pill h-8 shrink-0 px-3.5 text-[0.8125rem]">
            <CornerUpLeft className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Draft a reply
          </button>
          {replyWhy ? <p className="t-micro min-w-0 truncate">{replyWhy}</p> : null}
        </div>
      ) : null}
    </Shell>
  );
}

/** The panel itself: inside the reader, above the message, dismissible. */
function Shell({ children, onClose }) {
  return (
    <section
      className="mail-findings fade-in"
      aria-label="What Pulse found in this email"
    >
      <div className="mail-findings-head">
        <p className="t-label flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
          What’s in this
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide what Pulse found"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-moon/45 transition-colors hover:bg-white/[0.07] hover:text-moon"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-3">
      <p className="t-label mb-1.5 text-[0.6875rem] text-moon/40">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/**
 * One finding.
 *
 * The date line is the part worth reading twice: the day it resolved to, a
 * warning if that day has gone, and the words it came from. A model that said
 * "Thursday" and a Pulse that said the 9th are checkable against each other
 * only if both are on screen.
 */
function Row({ Icon, title, date, from, time, where, note, confidence, action, onAct }) {
  const gone = isPast(date);
  const detail = [time, where].filter(Boolean).join(' · ');
  return (
    <div className="mail-finding">
      <Icon className="mail-finding-icon" strokeWidth={1.7} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] leading-snug text-moon/90">{title}</p>
        <p className="t-micro mt-0.5 flex flex-wrap items-center gap-x-1.5">
          {date ? (
            <span className={gone ? 'text-amber-200/80' : 'text-moon/65'}>
              {readDate(date)}
              {gone ? ' — already gone' : ''}
            </span>
          ) : (
            <span className="text-moon/35">No date given</span>
          )}
          {detail ? <span className="text-moon/50">· {detail}</span> : null}
          {/* Where the date came from, so a misreading is visible as one. */}
          {from && date ? <span className="text-moon/30">· from “{from}”</span> : null}
          {confidence && confidence !== 'high' ? (
            <span className="text-moon/40" title={note || 'Pulse is not certain about this one'}>
              · not certain
            </span>
          ) : null}
        </p>
        {note && confidence !== 'high' ? <p className="t-micro mt-0.5 italic text-moon/40">{note}</p> : null}
      </div>
      <button type="button" onClick={onAct} className="mail-finding-add">
        {action}
      </button>
    </div>
  );
}
