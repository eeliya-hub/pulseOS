import {
  Archive,
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  Download,
  Eye,
  ImageOff,
  Inbox,
  ListChecks,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { providerMeta, visibleSignals } from '../../data/mailboxes.js';
import { mailTimeFull } from '../../utils/dateTime.js';
import { api } from '../../services/api/backendClient.js';
import { formatBytes } from '../../utils/formatters.js';
import MailBody from './MailBody.jsx';
import MailFindings from './MailFindings.jsx';

/**
 * The right pane: one message, in full.
 *
 * Reads top to bottom the way the message itself does — who it is from and when,
 * then what it says, then what you can do about it. The assistant's actions sit
 * with the rest rather than in a panel of their own, because asking Pulse about
 * a message is one of the things you do with it, not a separate mode.
 */
export default function MailReader({
  mail,
  message,
  onReply,
  onForward,
  onAsk,
  onFind,
  findings,
  onActOnFinding,
  onDismissFindings,
  onSelectText,
  selection,
  onClose,
}) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const listRef = useRef(null);

  const key = message ? `${message.accountId}:${message.id}` : null;

  // Load the body when the selection changes, and again if pictures are let
  // through. A stale reply from a message the user has already clicked past
  // must never land in the pane.
  useEffect(() => {
    if (!message) {
      setFull(null);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    mail
      .open(message, { images })
      .then((loaded) => {
        if (!alive) return;
        setFull(loaded);
        // Opening a message is what marks it read, as in any mail client — and
        // only once it has actually arrived on screen.
        if (loaded.unread) void mail.setFlags(message, { read: true }).catch(() => {});
      })
      .catch((err) => alive && setError(err?.message ?? 'Could not open that message.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // `mail` is a fresh object every render; the message and the images flag are
    // the whole identity of this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, images]);

  // A new message starts at the top, and forgets the last one's pictures.
  useEffect(() => {
    setImages(false);
    setShowRecipients(false);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [key]);

  const body = full?.body;
  const attachments = useMemo(() => (full?.attachments ?? []).filter((a) => !a.inline), [full]);
  const signals = visibleSignals(message?.triage ?? full?.triage, { limit: 3 });
  const provider = providerMeta(message?.provider);

  const handleSelect = useCallback((next) => onSelectText?.(next), [onSelectText]);

  if (!message) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
        <Mail className="h-7 w-7 text-moon/20" strokeWidth={1.4} aria-hidden="true" />
        <p className="t-meta max-w-[18rem]">
          Pick a message to read it. Highlight anything inside one and Pulse can turn it into a task, an event or a reply.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Who, what, when ─────────────────────────────────────────────── */}
      <header className="shrink-0 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="t-title text-[1.3125rem] leading-snug">{(full ?? message).subject}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: provider.color }}
                title={provider.label}
                aria-hidden="true"
              />
              <span className="t-body truncate text-moon/90">{(full ?? message).from?.name || (full ?? message).from?.email}</span>
              {(full ?? message).from?.name ? <span className="t-micro truncate">{(full ?? message).from.email}</span> : null}
              <span className="t-micro">·</span>
              <span className="t-micro shrink-0">{mailTimeFull((full ?? message).date)}</span>
            </div>

            {/* Recipients, folded away: on most mail it is one address and not
                worth the line, and on a long thread it is twenty. */}
            <button
              type="button"
              onClick={() => setShowRecipients((v) => !v)}
              aria-expanded={showRecipients}
              className="mt-1 inline-flex items-center gap-1 text-[0.75rem] text-moon/45 transition-colors hover:text-moon/70"
            >
              <Users className="h-3 w-3" aria-hidden="true" />
              {recipientSummary(full ?? message)}
              <ChevronDown className={`h-3 w-3 transition-transform ${showRecipients ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showRecipients ? (
              <dl className="mt-2 space-y-1 rounded-xl bg-white/[0.04] px-3 py-2">
                <AddressLine label="To" people={(full ?? message).to} />
                <AddressLine label="Cc" people={(full ?? message).cc} />
                <AddressLine label="Bcc" people={(full ?? message).bcc} />
                <AddressLine label="Reply to" people={(full ?? message).replyTo} />
              </dl>
            ) : null}
          </div>

          {/* The flags and the moves. Archiving or binning closes the pane,
              because what it was showing is no longer in the list behind it. */}
          <div className="flex shrink-0 items-center gap-1">
            <IconAction
              label={message.starred ? 'Unstar' : 'Star'}
              active={message.starred}
              onClick={() => mail.setFlags(message, { starred: !message.starred }).catch(() => {})}
            >
              <Star className={`h-4 w-4 ${message.starred ? 'fill-current' : ''}`} aria-hidden="true" />
            </IconAction>
            <IconAction
              label={message.unread ? 'Mark as read' : 'Mark as unread'}
              onClick={() => mail.setFlags(message, { read: Boolean(message.unread) }).catch(() => {})}
            >
              {message.unread ? <MailOpen className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
            </IconAction>
            {message.mailboxes?.includes('inbox') ? (
              <IconAction label="Archive" onClick={() => move(mail, message, 'archive', onClose)}>
                <Archive className="h-4 w-4" aria-hidden="true" />
              </IconAction>
            ) : (
              <IconAction label="Move to inbox" onClick={() => move(mail, message, 'inbox', onClose)}>
                <Inbox className="h-4 w-4" aria-hidden="true" />
              </IconAction>
            )}
            <IconAction label="Report as spam" onClick={() => move(mail, message, 'spam', onClose)}>
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            </IconAction>
            {/* Bin, not destroy: every provider here keeps it recoverable. */}
            <IconAction label="Move to bin" onClick={() => move(mail, message, 'trash', onClose)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </IconAction>
          </div>
        </div>

        {signals.length ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {signals.map((signal) => (
              <span
                key={signal.id}
                title={signal.hint}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
                style={{ color: signal.tone, background: `color-mix(in srgb, ${signal.tone} 15%, transparent)` }}
              >
                <signal.Icon className="h-3 w-3" aria-hidden="true" />
                {signal.label}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {/* ── What it says ────────────────────────────────────────────────── */}
      <div ref={listRef} className="glass-scroll min-h-0 flex-1 overflow-y-auto border-t border-white/[0.07] pr-1 pt-3">
        {loading && !full ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="mail-skeleton-line block" style={{ width: `${92 - i * 11}%`, '--delay': `${i * 70}ms` }} />
            ))}
          </div>
        ) : error ? (
          <p className="t-meta text-amber-200/80">{error}</p>
        ) : (
          <>
            {body?.blockedImages ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-white/[0.045] px-3 py-2">
                <p className="t-micro flex min-w-0 items-center gap-2">
                  <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {/* Why, not just what: loading a remote image tells the sender
                      the mail was opened, and by which address. */}
                  <span className="truncate">
                    {body.blockedImages} {body.blockedImages === 1 ? 'picture' : 'pictures'} held back — loading them tells the sender you opened this
                  </span>
                </p>
                <button type="button" onClick={() => setImages(true)} className="pill h-7 shrink-0 px-3 text-[0.75rem]">
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  Show
                </button>
              </div>
            ) : null}

            {/* What Pulse picked out, where the message it came from is still
                in view — each row carrying the button that acts on it. */}
            {findings ? (
              <MailFindings
                findings={findings.busy || findings.error ? null : findings}
                busy={Boolean(findings.busy)}
                error={findings.error ?? null}
                onAct={onActOnFinding}
                onReply={() => onReply(full ?? message, { all: false })}
                onClose={onDismissFindings}
              />
            ) : null}

            <MailBody html={body?.html ?? ''} onSelect={handleSelect} />

            {attachments.length ? (
              <div className="mt-5 border-t border-white/[0.07] pt-3">
                <p className="t-label mb-2 flex items-center gap-1.5 text-[0.75rem]">
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file) => (
                    <a
                      key={file.id ?? file.name}
                      href={api.mail.attachmentUrl(message.id, file.id, message.accountId)}
                      // Named here so the browser saves it rather than trying to
                      // display it; the backend sends the same instruction.
                      download={file.name}
                      className="group flex max-w-[16rem] items-center gap-2.5 rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09]"
                    >
                      <Download className="h-3.5 w-3.5 shrink-0 text-moon/50 group-hover:text-accent" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] text-moon/90">{file.name}</span>
                        <span className="t-micro block">{formatBytes(file.size)}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── What you can do ─────────────────────────────────────────────── */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
        <button type="button" onClick={() => onReply(full ?? message, { all: false })} className="pill pill-lit h-9 px-4">
          <CornerUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Reply
        </button>
        {((full ?? message).cc?.length || ((full ?? message).to?.length ?? 0) > 1) ? (
          <button type="button" onClick={() => onReply(full ?? message, { all: true })} className="pill h-9 px-4">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Reply all
          </button>
        ) : null}
        <button type="button" onClick={() => onForward(full ?? message)} className="pill h-9 px-4">
          <CornerUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          Forward
        </button>

        <span className="ml-auto flex items-center gap-2">
          {/* The assistant, on this message. Each of these is a question about
              what is on screen, not a free-form chat. */}
          <button
            type="button"
            onClick={() => onAsk({ kind: 'summarise', message: full ?? message })}
            disabled={!full}
            title="A few lines on what it says"
            className="pill h-9 px-4 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Summarise
          </button>
          {/* The one that finds the meetings and the deadlines. It replaced a
              button that answered the same question in prose — true, and
              useless, because a paragraph cannot be added to a calendar. */}
          <button
            type="button"
            onClick={() => onFind?.(full ?? message)}
            disabled={!full || Boolean(findings?.busy)}
            title="Find the dates, meetings and things to do in this email"
            className="pill pill-lit h-9 px-4 disabled:opacity-40"
          >
            {findings?.busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Dates &amp; tasks
          </button>
        </span>
      </footer>

      {/* While the body is loading, the selection menu would have nothing to
          point at — so it is only ever offered against real text. */}
      {selection && loading ? <Loader2 className="sr-only animate-spin" aria-hidden="true" /> : null}
    </div>
  );
}

async function move(mail, message, mailbox, onClose) {
  try {
    await mail.move(message, mailbox);
    onClose?.();
  } catch {
    /* the store has already put the row back; nothing more to say here */
  }
}

function AddressLine({ label, people }) {
  if (!people?.length) return null;
  return (
    <div className="flex gap-2 text-[0.75rem]">
      <dt className="w-16 shrink-0 text-moon/40">{label}</dt>
      <dd className="min-w-0 flex-1 text-moon/70">
        {people.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join(', ')}
      </dd>
    </div>
  );
}

function recipientSummary(message) {
  const to = message.to ?? [];
  const cc = message.cc ?? [];
  if (!to.length && !cc.length) return 'No recipients listed';
  const first = to[0]?.name || to[0]?.email || cc[0]?.name || cc[0]?.email;
  const others = to.length + cc.length - 1;
  return others > 0 ? `To ${first} and ${others} ${others === 1 ? 'other' : 'others'}` : `To ${first}`;
}

function IconAction({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        active ? 'text-[#FFD60A]' : 'text-moon/55 hover:bg-white/[0.07] hover:text-moon'
      }`}
    >
      {children}
    </button>
  );
}
