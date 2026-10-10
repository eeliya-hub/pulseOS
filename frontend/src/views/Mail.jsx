import { ArrowLeft, Check, CloudOff, Loader2, Mail as MailIcon, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Column, Ground, SkyZone } from '../components/Stage.jsx';
import { mailboxMeta, providerMeta, summaryLine } from '../data/mailboxes.js';
import { useCalendarEvents } from '../hooks/useCalendarEvents.js';
import { CALENDARS, dateKey, useLifeData } from '../hooks/useLifeData.js';
import { useMail } from '../hooks/useMail.js';
import { joinAddresses } from '../services/mail/addresses.js';
import { mailAI, sourceOf } from '../services/mail/ai.js';
import { registerComposer, takePendingDraft, takePendingOpen } from '../services/mail/tools.js';
import MailAskMenu from './mail/MailAskMenu.jsx';
import MailCompose from './mail/MailCompose.jsx';
import MailList from './mail/MailList.jsx';
import MailProposal from './mail/MailProposal.jsx';
import MailReader from './mail/MailReader.jsx';
import MailSidebar from './mail/MailSidebar.jsx';

/**
 * Mail, as a place in Pulse rather than a mail client embedded in one.
 *
 * Same frame as every other view: a sky that says what you are reading and what
 * Pulse noticed in it, and a ground split into columns — where your mail lives,
 * the mail itself, and the one you have open.
 *
 * The thing that makes it Pulse rather than a webmail tab is the last column
 * and the menu that appears when you highlight something in it: a line in an
 * email becomes a task, a project, or an event in your own calendar, through a
 * card you check first.
 */
export default function Mail({ initialMessage, onOpenSettings, onBack }) {
  const [mailbox, setMailbox] = useState('inbox');
  const [category, setCategory] = useState(null);
  const [accountId, setAccountId] = useState(undefined);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState('');
  const [selected, setSelected] = useState(null);
  const [compose, setCompose] = useState(null);
  const [selection, setSelection] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [answer, setAnswer] = useState(null); // what Pulse said, shown over the reader
  const [thinking, setThinking] = useState(null);
  const [found, setFound] = useState(null); // what Pulse picked out of the open message
  const [flash, setFlash] = useState(null); // "sent", briefly
  const searchRef = useRef(null);

  const mail = useMail({ accountId, mailbox, category, query: searching });
  const life = useLifeData();
  const calendar = useCalendarEvents();

  /*
   * The open message as the store holds it NOW.
   *
   * `selected` is the object the list handed over when it was clicked, and it
   * stops being true the moment a flag changes — so the reader went on offering
   * "Mark as read" for something already read, and its star never filled in.
   * The list row was right because it re-renders from the store; the reader was
   * reading a photograph of it.
   */
  // `mail` is a fresh object every render, so depending on it would rebuild
  // this every time; `mail.live` is the stable callback that actually changes
  // when the listings do, which is the only thing that can change the answer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const current = useMemo(() => mail.live(selected), [mail.live, selected]);

  // Arriving from the Life Hub with a message already in mind.
  useEffect(() => {
    if (initialMessage?.id) setSelected(initialMessage);
  }, [initialMessage]);

  /*
   * Work the assistant left for this view.
   *
   * "Reply to Maya" can be said from the chat popover or out loud, with Mail
   * nowhere on screen. The tool stashes the draft and navigates here; this
   * picks it up on arrival, and registers itself so that while Mail IS open the
   * composer is filled directly instead of going round that way.
   */
  useEffect(() => {
    const draft = takePendingDraft();
    if (draft) setCompose(draft);
    const open = takePendingOpen();
    if (open?.id) {
      mail
        .list({ accountId, mailbox: 'inbox' })
        .then(() => setSelected({ id: open.id, accountId: open.accountId }))
        .catch(() => setSelected({ id: open.id, accountId: open.accountId }));
    }
    return registerComposer((next) => setCompose(next));
    // Once, on mount: this is a handover, not something to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Sent", for a moment. The composer closing is not by itself proof that
  // anything left — and a mail client that says nothing after Send is a mail
  // client you check the Sent folder to trust.
  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // What Pulse found belongs to one message; moving on forgets it rather than
  // leaving last message's meetings above this one.
  const openKey = keyOf(selected);
  useEffect(() => {
    setFound(null);
    setAnswer(null);
  }, [openKey]);

  // A mailbox and a category are two ways of narrowing the same list, so
  // choosing one clears the other rather than quietly combining them.
  const chooseMailbox = useCallback((id) => {
    setMailbox(id);
    setCategory(null);
    setSelected(null);
  }, []);
  const chooseCategory = useCallback((id) => {
    setMailbox('inbox');
    setCategory((current) => (current === id ? null : id));
    setSelected(null);
  }, []);

  // Keyboard: / to search, Escape to clear it or close what's open, j/k through
  // the list the way every mail client does.
  const messages = mail.messages;
  useEffect(() => {
    const typing = (el) =>
      el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.tagName === 'SELECT');
    const onKey = (event) => {
      if (compose || proposal) return;
      if (event.key === '/' && !typing(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        if (answer) return setAnswer(null);
        if (selection) return setSelection(null);
        if (found) return setFound(null);
        if (searching) {
          setQuery('');
          setSearching('');
          return undefined;
        }
        if (selected) return setSelected(null);
        // Nothing left open: Escape leaves, the way it does in Settings.
        onBack?.();
        return undefined;
      }
      if (typing(event.target) || !messages.length) return undefined;
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const index = messages.findIndex((m) => keyOf(m) === keyOf(selected));
        const next = event.key === 'j' ? Math.min(messages.length - 1, index + 1) : Math.max(0, index - 1);
        setSelected(messages[index < 0 ? 0 : next]);
      }
      return undefined;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [messages, selected, searching, compose, proposal, answer, selection, found, onBack]);

  /* ── Composing ─────────────────────────────────────────────────────────── */

  const openReply = useCallback((message, { all = false } = {}) => {
    const to = all ? [...(message.replyTo?.length ? message.replyTo : [message.from])] : message.replyTo?.length ? message.replyTo : [message.from];
    // Reply-all keeps everyone except the user's own addresses, which would
    // otherwise send them a copy of their own reply.
    const others = all ? [...(message.to ?? []), ...(message.cc ?? [])] : [];
    setCompose({
      accountId: message.accountId,
      to: joinAddresses(to),
      cc: all ? joinAddresses(dropSelf(others, message.accountId, to)) : '',
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      text: '',
      threadId: message.threadId,
      inReplyTo: message.messageIdHeader,
      references: [message.references, message.messageIdHeader].filter(Boolean).join(' '),
      replyToMessageId: message.id,
      replyAll: all,
      replyTo: message,
    });
  }, []);

  const openForward = useCallback((message) => {
    setCompose({
      accountId: message.accountId,
      to: '',
      subject: /^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`,
      // Quoted beneath a blank line, so the cursor starts on an empty first line.
      text: `\n\n---------- Forwarded message ----------\nFrom: ${message.from?.name || ''} <${message.from?.email}>\nDate: ${message.date}\nSubject: ${message.subject}\n\n${message.body?.text ?? ''}`,
      forward: true,
    });
  }, []);

  /* ── Asking Pulse ──────────────────────────────────────────────────────── */

  /** The read-only questions: a paragraph back, shown over the reader. */
  const ask = useCallback(
    async ({ kind, message, text }) => {
      const target = message ?? current;
      if (!target) return;
      setSelection(null);
      setThinking(kind);
      setAnswer({ kind, pending: true, selection: text ?? null });
      try {
        const reply = kind === 'explain' ? await mailAI.explain(target, text) : await mailAI.summarise(target);
        setAnswer({ kind, text: reply, selection: text ?? null });
      } catch (error) {
        setAnswer({ kind, error: error?.message ?? 'Pulse couldn’t read that one.', selection: text ?? null });
      } finally {
        setThinking(null);
      }
    },
    [current],
  );

  /**
   * Everything in this email that belongs somewhere else, in one call.
   *
   * One request for the meetings, the tasks, the dates and the people together:
   * the model has to read the whole message whichever of those you asked for,
   * so asking separately would cost four times as much for the same reading.
   * What comes back is proposals — `actOn` below turns one into a review card,
   * with no second call, because the finding already holds every field the card
   * needs.
   */
  const find = useCallback(
    async (message) => {
      const target = message ?? current;
      if (!target) return;
      setAnswer(null);
      setFound({ busy: true });
      try {
        setFound(await mailAI.findings(target));
      } catch (error) {
        setFound({ error: error?.message ?? 'Pulse couldn’t make anything of that one.' });
      }
    },
    [current],
  );

  /** A finding, handed to the review card exactly as it stands. */
  const actOn = useCallback(
    (kind, finding) => {
      if (!current) return;
      setProposal({
        kind,
        title: finding.title ?? finding.what ?? '',
        due: finding.due ?? null,
        dateFrom: finding.dateFrom ?? null,
        notes: finding.note ?? null,
        start: finding.start ?? null,
        end: finding.end ?? null,
        allDay: finding.allDay ?? !finding.start,
        location: finding.location ?? null,
        participants: finding.participants ?? [],
        confidence: finding.confidence ?? 'high',
        note: finding.note ?? null,
        source: sourceOf(current),
      });
    },
    [current],
  );

  /** The ones that would change something: always a proposal, never a write. */
  const proposeFrom = useCallback(
    async (kind, text) => {
      if (!current) return;
      setSelection(null);
      setThinking(kind);
      try {
        const shape = kind === 'event' ? 'event' : kind === 'project' ? 'project' : 'task';
        const proposed = await mailAI.propose(shape, current, { selection: text, projects: life.projects });
        if (shape === 'event' && !proposed.title) {
          setAnswer({ kind: 'event', text: proposed.note || 'I couldn’t find a date or a time in that, so there’s nothing to put in the calendar.' });
          return;
        }
        setProposal({
          ...proposed,
          // "Add to today" is a task whose date is already decided.
          kind: kind === 'today' ? 'today' : shape,
          ...(kind === 'today' ? { due: dateKey(new Date()) } : {}),
        });
      } catch (error) {
        setAnswer({ kind, error: error?.message ?? 'Pulse couldn’t make anything of that.' });
      } finally {
        setThinking(null);
      }
    },
    [current, life.projects],
  );

  /** Drafting a reply about the highlighted line. */
  const replyAbout = useCallback(
    async (text) => {
      if (!current) return;
      setSelection(null);
      setThinking('reply');
      try {
        const body = await mailAI.draftReply(current, { gist: text ? `a reply about: ${text}` : '' });
        openReply(current);
        setCompose((current) => (current ? { ...current, text: body } : current));
      } catch (error) {
        setAnswer({ kind: 'reply', error: error?.message ?? 'Pulse couldn’t draft that.' });
      } finally {
        setThinking(null);
      }
    },
    [current, openReply],
  );

  const onHighlightAction = useCallback(
    (action, text) => {
      if (action === 'explain' || action === 'summarise') return ask({ kind: action, message: current, text });
      if (action === 'reply') return replyAbout(text);
      return proposeFrom(action, text);
    },
    [ask, proposeFrom, replyAbout, current],
  );

  /**
   * Committing a proposal — the one place in the mail feature that writes to
   * the rest of Pulse, reached only from the review card's button.
   *
   * It uses the EXISTING stores: lifeActions for to-dos and projects, the
   * calendar hook for events. There is no second task system and no second
   * calendar, which is why a task made here shows up in the Life Hub like any
   * other.
   */
  const commit = useCallback(
    async (confirmed) => {
      const { kind, title, due, notes, projectId, location, start, end, allDay, calendarId, source } = confirmed;
      const trail = source?.subject ? `From the email “${source.subject}”` : 'From an email';

      if (kind === 'event') {
        const writable = calendar.writableCalendars ?? [];
        const target = writable.find((c) => c.id === calendarId);
        if (target) {
          // A connected calendar — Google or iCloud — through the same path the
          // Life Hub's own editor uses.
          const startISO = allDay ? due : `${due}T${start || '09:00'}:00`;
          const endISO = allDay ? due : `${due}T${end || addHour(start || '09:00')}:00`;
          await calendar.createEvent({
            source: target.source,
            calendarId: target.id,
            title,
            description: trail,
            location: location ?? '',
            start: startISO,
            end: endISO,
            allDay,
          });
        } else {
          life.addEvent({
            title,
            time: allDay ? '' : end ? `${start} – ${end}` : start || '',
            place: location ?? '',
            date: due,
            repeat: 'none',
            calendar: calendarId && CALENDARS.some((c) => c.id === calendarId) ? calendarId : 'personal',
          });
        }
        return;
      }

      if (kind === 'project' && projectId) {
        life.addProjectTodo(projectId, title);
        return;
      }

      // A task, with or without a day. "Add to today" arrives with today's date
      // already set, so this is the same path for both.
      life.addTodo({ label: title, date: due || dateKey(new Date()), repeat: 'none' });
      if (notes) {
        // Nowhere to put a note on a to-do in the current model, so it is folded
        // into the label rather than dropped silently.
        life.removeTodo(life.todos.at(-1)?.id);
        life.addTodo({ label: `${title} — ${notes}`, date: due || dateKey(new Date()), repeat: 'none' });
      }
    },
    [calendar, life],
  );

  /* ── What the sky says ─────────────────────────────────────────────────── */

  const box = mailboxMeta(category ?? mailbox);
  const line = summaryLine(mail.summary);
  const showAccount = (mail.accounts?.length ?? 0) > 1 && !accountId;
  const emptyLabel = searching
    ? `Nothing matching “${searching}”`
    : mailbox === 'inbox'
      ? 'Your inbox is clear'
      : `Nothing in ${box.label.toLowerCase()}`;

  // Not connected: the view explains itself rather than showing empty furniture.
  if (!mail.connected && mail.status) {
    return <MailEmpty mail={mail} onOpenSettings={onOpenSettings} onBack={onBack} />;
  }

  return (
    <div className="flex h-full flex-col">
      <SkyZone className="flex items-end justify-between gap-10">
        <div className="min-w-0">
          {onBack ? (
            <button type="button" onClick={onBack} className="pill mb-4 h-9 px-3.5 text-moon/80">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Life Hub
            </button>
          ) : null}
          <p className="t-eyebrow">Mail</p>
          <h1 className="t-hero mt-3 truncate">{box.label}</h1>
          <p className="t-lede mt-3 truncate">
            {mail.summary?.connected ? line ?? 'Nothing new' : 'Reading your mail…'}
          </p>

          <div className="mt-6 flex items-center gap-2">
            <form
              className="relative w-[22rem] max-w-full"
              onSubmit={(event) => {
                event.preventDefault();
                setSearching(query.trim());
                setSelected(null);
              }}
            >
              <label htmlFor="mail-search" className="sr-only">
                Search mail
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-moon/45" aria-hidden="true" />
              <input
                id="mail-search"
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search mail  ( / )"
                className="h-10 w-full rounded-full bg-white/[0.07] pl-11 pr-9 text-[0.9375rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] outline-none backdrop-blur-md transition placeholder:text-moon/40 focus:bg-white/[0.11] focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
              />
              {searching || query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSearching('');
                  }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-moon/45 hover:text-moon"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </form>

            <button
              type="button"
              onClick={() => mail.refresh()}
              aria-label="Check for new mail"
              className="pill h-10 w-10 px-0 text-moon/75"
            >
              <RefreshCw className={`h-4 w-4 ${mail.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* An account that has stopped answering is said here, where it cannot
            be mistaken for an empty mailbox. */}
        <div className="hidden min-w-0 max-w-[18rem] shrink-0 pb-1 lg:block">
          {(mail.accounts ?? []).filter((a) => a.needsReconnect).map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={onOpenSettings}
              className="flex w-full items-start gap-2 rounded-xl bg-amber-200/[0.09] px-3 py-2 text-left"
            >
              <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/80" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] text-amber-100/90">{account.email}</span>
                <span className="t-micro block">Sign-in expired — reconnect</span>
              </span>
            </button>
          ))}
        </div>
      </SkyZone>

      <Ground
        className={`mail-ground grid grid-cols-[12.5rem_minmax(0,1.05fr)_minmax(0,1.35fr)] ${compose ? 'mail-ground--writing' : ''}`}
      >
        <MailSidebar
          mail={mail}
          mailbox={mailbox}
          category={category}
          accountId={accountId}
          onMailbox={chooseMailbox}
          onCategory={chooseCategory}
          onAccount={(id) => {
            setAccountId(id);
            setSelected(null);
          }}
          onCompose={() => setCompose({})}
          onSettings={onOpenSettings}
        />

        <Column
          label={searching ? `Results for “${searching}”` : box.label}
          action={mail.listLoading && mail.messages.length ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent/70" aria-hidden="true" /> : null}
          className="ground-rule px-6 pt-7"
          bodyClassName="flex min-h-0 flex-col"
        >
          <MailList
            mail={mail}
            messages={mail.messages}
            selectedId={keyOf(selected)}
            showAccount={showAccount}
            emptyLabel={emptyLabel}
            onSelect={setSelected}
            onStar={(m) => mail.setFlags(m, { starred: !m.starred }).catch(() => {})}
            onArchive={(m) => archive(mail, m, selected, setSelected, 'archive')}
            onTrash={(m) => archive(mail, m, selected, setSelected, 'trash')}
          />
        </Column>

        {/* The third column is where you read and where you write. Writing
            takes the whole of it rather than covering the view it came from:
            a reply belongs beside the thing being replied to, and Pulse has
            one screen to put both on. The panel says which mode it is in. */}
        <Column className="ground-rule pl-6 pt-7" bodyClassName="flex min-h-0 flex-col">
          {compose ? (
            <MailCompose
              mail={mail}
              draft={compose}
              onClose={(outcome) => {
                setCompose(null);
                if (outcome?.sent) setFlash(outcome.to ? `Sent to ${outcome.to}` : 'Sent');
                else if (outcome?.saved) setFlash('Saved to drafts');
              }}
              onAskWrite={(request) => mailAI.write(request)}
            />
          ) : (
            <MailReader
              mail={mail}
              message={current}
              selection={selection}
              onSelectText={setSelection}
              onReply={openReply}
              onForward={openForward}
              onAsk={ask}
              onFind={find}
              findings={found}
              onActOnFinding={actOn}
              onDismissFindings={() => setFound(null)}
              onClose={() => setSelected(null)}
            />
          )}
        </Column>
      </Ground>

      {/* Highlight → Pulse. Only offered while a message is actually open. */}
      {current && !compose ? (
        <MailAskMenu selection={selection} onAction={onHighlightAction} onDismiss={() => setSelection(null)} />
      ) : null}

      {answer ? <MailAnswer answer={answer} thinking={thinking} onClose={() => setAnswer(null)} /> : null}

      {proposal ? (
        <MailProposal
          proposal={proposal}
          projects={life.projects}
          calendars={[...(calendar.writableCalendars ?? []), ...CALENDARS.map((c) => ({ id: c.id, name: c.name }))]}
          onConfirm={commit}
          onClose={() => setProposal(null)}
        />
      ) : null}

      {/* Working, while something that takes a moment is in flight. */}
      {thinking && !answer ? (
        <Toast>
          <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
          {THINKING[thinking] ?? 'Reading it…'}
        </Toast>
      ) : null}

      {flash && !thinking ? (
        <Toast>
          <Check className="h-3.5 w-3.5 text-rise" aria-hidden="true" />
          {flash}
        </Toast>
      ) : null}
    </div>
  );
}

/** A line at the foot of the view, for something that just happened. */
function Toast({ children }) {
  return (
    <p className="fade-in pointer-events-none fixed bottom-[7.5rem] left-1/2 z-[75] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#0b1020]/85 px-4 py-2 text-[0.8125rem] text-moon/85 shadow-glass backdrop-blur-md">
      {children}
    </p>
  );
}

const THINKING = {
  summarise: 'Reading it…',
  explain: 'Putting that plainly…',
  task: 'Looking for the task…',
  today: 'Looking for the task…',
  project: 'Working out which project…',
  event: 'Looking for a date…',
  reply: 'Drafting a reply…',
};

const keyOf = (message) => (message ? `${message.accountId}:${message.id}` : null);

/** Archiving the message you are reading closes the pane it was in. */
function archive(mail, message, selected, setSelected, mailbox) {
  if (keyOf(selected) === keyOf(message)) setSelected(null);
  mail.move(message, mailbox).catch(() => {});
}

/** Everyone on a reply-all except the account that is sending it. */
function dropSelf(people, accountId, already) {
  const taken = new Set(already.map((p) => (p.email ?? '').toLowerCase()));
  return people.filter((p) => {
    const email = (p.email ?? '').toLowerCase();
    if (!email || taken.has(email)) return false;
    taken.add(email);
    return true;
  });
}

const addHour = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return `${String(Math.min(23, (h ?? 9) + 1)).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
};

/** What Pulse said about the open message, over the reader. */
function MailAnswer({ answer, thinking, onClose }) {
  return (
    <div className="fixed bottom-[6.5rem] left-1/2 z-[75] w-[min(38rem,calc(100vw-3rem))] -translate-x-1/2">
      <div className="theme-card fade-in relative rounded-2xl px-5 py-4">
        <div className="flex items-start gap-3">
          <Sparkles className={`mt-0.5 h-4 w-4 shrink-0 text-accent ${thinking ? 'animate-pulse' : ''}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            {answer.selection ? (
              <p className="t-micro mb-1.5 truncate italic">“{answer.selection}”</p>
            ) : null}
            {answer.pending ? (
              <p className="t-body text-moon/60">Reading it…</p>
            ) : answer.error ? (
              <p className="t-body text-fall">{answer.error}</p>
            ) : (
              <p className="t-body whitespace-pre-wrap">{answer.text}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-moon/50 transition-colors hover:bg-white/[0.07] hover:text-moon"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Nothing connected yet: what this would be, and the one thing to do about it. */
function MailEmpty({ mail, onOpenSettings, onBack }) {
  const providers = (mail.providers ?? []).filter((p) => p.configured);
  return (
    <div className="flex h-full flex-col">
      <SkyZone className="flex items-end">
        <div className="min-w-0">
          {onBack ? (
            <button type="button" onClick={onBack} className="pill mb-4 h-9 px-3.5 text-moon/80">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Life Hub
            </button>
          ) : null}
          <p className="t-eyebrow">Mail</p>
          <h1 className="t-hero mt-3">Your inbox, in Pulse</h1>
          <p className="t-lede mt-3 max-w-[34rem]">
            Connect an account and your mail joins the rest of your day — what needs a reply, what has a deadline, and
            a line in an email turned into a task, a project or something in your calendar.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {providers.length ? (
              providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => mail.connect(provider.id)}
                  className="pill pill-lit h-10 px-4"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: providerMeta(provider.id).color }} aria-hidden="true" />
                  Connect {provider.label}
                </button>
              ))
            ) : (
              <p className="t-body text-moon/70">
                Add Gmail or Microsoft credentials to <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.8125rem]">backend/.env</code>, then
                restart the backend.
              </p>
            )}
            <button type="button" onClick={onOpenSettings} className="pill h-10 px-4 text-moon/75">
              <MailIcon className="h-4 w-4" aria-hidden="true" />
              Mail settings
            </button>
          </div>
        </div>
      </SkyZone>
      <Ground className="grid place-items-center">
        {mail.backendReachable === false ? (
          <p className="t-meta flex items-center gap-2 text-amber-200/80">
            <CloudOff className="h-4 w-4" aria-hidden="true" /> Can’t reach the backend — trying again
          </p>
        ) : null}
      </Ground>
    </div>
  );
}
