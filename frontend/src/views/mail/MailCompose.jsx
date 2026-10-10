import {
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  Loader2,
  Paperclip,
  PenLine,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { providerMeta } from '../../data/mailboxes.js';
import { splitAddresses } from '../../services/mail/addresses.js';
import { formatBytes } from '../../utils/formatters.js';

/**
 * Writing a message, in the column where you were reading one.
 *
 * It used to be a modal over the whole workspace, which was the wrong shape for
 * two reasons. Replying to an email means looking at the email, and a panel
 * over the middle of the screen covered the thing being replied to. And Pulse
 * is one screen that does not scroll: a dialog that dims the view it came from
 * is a second place to be, where this is meant to be the same place with the
 * pen picked up.
 *
 * So it takes the reading column and makes it unmistakably a different mode:
 * an accent rule down the edge, a tinted head, and "Writing" said outright.
 * Reading is quiet and black; writing is lit. You can always tell which one you
 * are in without reading a word.
 *
 * Nothing here can send on its own. `mail.send` is reached from the Send
 * button, pressed by a person — the assistant writes into the box and has no
 * way to press it.
 */

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export default function MailCompose({ mail, draft, onClose, onAskWrite }) {
  const [accountId, setAccountId] = useState(draft?.accountId ?? mail.accounts[0]?.id ?? null);
  const [to, setTo] = useState(draft?.to ?? '');
  const [cc, setCc] = useState(draft?.cc ?? '');
  const [bcc, setBcc] = useState(draft?.bcc ?? '');
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [text, setText] = useState(draft?.text ?? '');
  const [files, setFiles] = useState([]);
  const [showCopies, setShowCopies] = useState(Boolean(draft?.cc || draft?.bcc));
  const [busy, setBusy] = useState(null); // 'send' | 'draft'
  const [error, setError] = useState(null);
  const [aiBusy, setAiBusy] = useState(null);
  const [instruction, setInstruction] = useState('');
  const bodyRef = useRef(null);
  const firstField = useRef(null);
  const promptRef = useRef(null);

  const accounts = mail.accounts ?? [];
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const isReply = Boolean(draft?.replyToMessageId || draft?.threadId);
  const kind = isReply ? (draft?.replyAll ? 'Reply to all' : 'Reply') : draft?.forward ? 'Forward' : 'New message';
  const KindIcon = isReply ? CornerUpLeft : draft?.forward ? CornerUpRight : PenLine;

  // A reply starts in the body with the recipients already right; a new message
  // starts in the To field.
  useEffect(() => {
    const field = isReply ? bodyRef.current : firstField.current;
    field?.focus();
    if (isReply && bodyRef.current) bodyRef.current.setSelectionRange(0, 0);
  }, [isReply]);

  // Escape closes, unless something is in flight — losing a draft to a stray
  // key press while it is being sent would be the worst moment for it.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose();
      }
      // The shortcut every mail client has.
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !busy) {
        event.preventDefault();
        void send();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, to, cc, bcc, subject, text, files, accountId]);

  const payload = useCallback(
    () => ({
      accountId: account?.id,
      to: splitAddresses(to),
      cc: splitAddresses(cc),
      bcc: splitAddresses(bcc),
      subject,
      text,
      attachments: files.map((f) => ({ name: f.name, mimeType: f.mimeType, data: f.data })),
      threadId: draft?.threadId,
      draftId: draft?.draftId,
      inReplyTo: draft?.inReplyTo,
      references: draft?.references,
      replyToMessageId: draft?.replyToMessageId,
      replyAll: draft?.replyAll,
    }),
    [account, to, cc, bcc, subject, text, files, draft],
  );

  const recipientCount = useMemo(
    () => splitAddresses(to).length + splitAddresses(cc).length + splitAddresses(bcc).length,
    [to, cc, bcc],
  );

  async function send() {
    if (!recipientCount) {
      setError('Add someone to send this to.');
      return;
    }
    setBusy('send');
    setError(null);
    try {
      await mail.send(payload());
      onClose({ sent: true, to: splitAddresses(to)[0]?.email ?? null });
    } catch (err) {
      setError(err?.message ?? 'That didn’t send.');
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    setBusy('draft');
    setError(null);
    try {
      const saved = await mail.saveDraft(payload());
      onClose({ saved: true, draftId: saved?.id });
    } catch (err) {
      setError(err?.message ?? 'That didn’t save.');
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (draft?.draftId) {
      try {
        await mail.discardDraft({ accountId: account?.id, draftId: draft.draftId });
      } catch {
        /* already gone, or unreachable — closing is still the right outcome */
      }
    }
    onClose({ discarded: true });
  }

  /**
   * Ask Pulse for the words. Either from an instruction typed above, or as a
   * rewrite of what is already in the box. Both only ever change the box.
   */
  async function ai(request) {
    const source = text.trim();
    if (request.kind === 'prompt' && !instruction.trim()) {
      setError('Tell Pulse what to write first.');
      promptRef.current?.focus();
      return;
    }
    if (request.kind !== 'prompt' && request.kind !== 'draft-reply' && !source) {
      setError('Write something first — even a line — and Pulse will work it up.');
      return;
    }
    setAiBusy(request.kind);
    setError(null);
    try {
      const next = await onAskWrite({
        ...request,
        text: source,
        subject,
        instruction: instruction.trim(),
        draft: { ...payload(), replyTo: draft?.replyTo },
      });
      if (next?.text) setText(next.text);
      if (next?.subject && !subject.trim()) setSubject(next.subject);
      // The instruction has been acted on; leaving it in the box invites a
      // second press that re-applies it to the answer it just produced.
      if (request.kind === 'prompt') setInstruction('');
    } catch (err) {
      setError(err?.message ?? 'Pulse couldn’t help with that one.');
    } finally {
      setAiBusy(null);
    }
  }

  async function addFiles(fileList) {
    const picked = [...fileList];
    const room = MAX_ATTACHMENT_BYTES - files.reduce((sum, f) => sum + f.size, 0);
    const tooBig = picked.find((f) => f.size > room);
    if (tooBig) {
      setError(`${tooBig.name} is too large — Pulse sends up to ${formatBytes(MAX_ATTACHMENT_BYTES)} in total.`);
      return;
    }
    const read = await Promise.all(
      picked.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                // base64 only — the data URL prefix is not part of the content.
                data: String(reader.result).split(',')[1] ?? '',
              });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }),
      ),
    );
    setFiles((current) => [...current, ...read.filter(Boolean)]);
  }

  const working = Boolean(aiBusy);

  return (
    <div className="mail-compose flex min-h-0 flex-1 flex-col" aria-label={kind}>
      {/* ── The head: that this is writing, and which address it leaves from ── */}
      <header className="mail-compose-head">
        <span className="mail-compose-badge">
          <KindIcon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-label text-accent">{kind}</p>
          {accounts.length > 1 ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="t-micro">From</span>
              <div className="relative">
                <select
                  value={account?.id ?? ''}
                  onChange={(event) => setAccountId(event.target.value)}
                  aria-label="Send from"
                  className="appearance-none rounded-full bg-white/[0.07] py-0.5 pl-2.5 pr-6 text-[0.75rem] text-moon outline-none ring-1 ring-white/10 focus-visible:ring-accent/50"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} className="bg-ink text-moon">
                      {a.email}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-moon/50" aria-hidden="true" />
              </div>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: providerMeta(account?.provider).color }}
                aria-hidden="true"
              />
            </div>
          ) : (
            <p className="t-micro mt-0.5 truncate">From {account?.email}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="Close without sending"
          title="Close without sending (Esc)"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-moon/55 transition-colors hover:bg-white/[0.07] hover:text-moon"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </header>

      {/* ── Who it goes to ─────────────────────────────────────────────────
          Pinned rather than scrolling with the body: an address you cannot see
          while writing is an address you send to by accident. */}
      <div className="shrink-0">
        <Field ref={firstField} label="To" value={to} onChange={setTo} placeholder="name@example.com" autoComplete="off">
          {!showCopies ? (
            <button type="button" onClick={() => setShowCopies(true)} className="shrink-0 text-[0.75rem] text-moon/50 hover:text-moon/80">
              Cc / Bcc
            </button>
          ) : null}
        </Field>
        {showCopies ? (
          <>
            <Field label="Cc" value={cc} onChange={setCc} placeholder="Copied in" />
            <Field label="Bcc" value={bcc} onChange={setBcc} placeholder="Hidden copy" />
          </>
        ) : null}
        <Field label="Subject" value={subject} onChange={setSubject} placeholder="What it’s about" />
      </div>

      {/* ── What it says. Takes whatever room is left and scrolls itself. ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <textarea
          ref={bodyRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            isReply
              ? 'Write your reply — or ask Pulse below and edit what it gives you.'
              : 'Write your message — or ask Pulse below and edit what it gives you.'
          }
          disabled={working}
          className="mail-compose-body glass-scroll"
        />

        {files.length ? (
          <div className="shrink-0 flex flex-wrap gap-2 pb-1">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-1.5 ring-1 ring-white/[0.08]">
                <Paperclip className="h-3 w-3 shrink-0 text-moon/50" aria-hidden="true" />
                <span className="max-w-[12rem] truncate text-[0.8125rem]">{file.name}</span>
                <span className="t-micro">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                  className="text-moon/40 hover:text-fall"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Asking Pulse for the words ─────────────────────────────────────
          A box to say what the email should say, which is the thing the old
          row of rewrite buttons could not do: every one of them needed you to
          have written it already, so there was no way in from a blank page. */}
      <section className="mail-write" aria-label="Ask Pulse to write this">
        <label className="t-label mb-1.5 flex items-center gap-1.5 text-[0.6875rem]" htmlFor="mail-write-prompt">
          <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
          Ask Pulse to write it
          <span className="font-normal normal-case tracking-normal text-moon/30">— it writes, it never sends</span>
        </label>
        <div className="mail-write-row">
          <textarea
            id="mail-write-prompt"
            ref={promptRef}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ai({ kind: 'prompt' });
              }
            }}
            rows={2}
            placeholder={
              isReply
                ? 'Say yes to Thursday, ask whether the room has a projector…'
                : 'Ask Sam for the signed contract, mention the Friday deadline, keep it short…'
            }
            className="mail-write-prompt glass-scroll"
          />
          <button
            type="button"
            onClick={() => void ai({ kind: 'prompt' })}
            disabled={working || Boolean(busy)}
            className="pill pill-lit h-9 shrink-0 self-end px-3.5 disabled:opacity-40"
          >
            {aiBusy === 'prompt' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {text.trim() ? 'Rework' : 'Write it'}
          </button>
        </div>

        {/* The rewrites, which act on what is in the box rather than on an
            instruction — second, and quieter, because they are the follow-up. */}
        {text.trim() || isReply ? (
          <div className="mail-write-pills hide-scrollbar">
            <span className="t-micro shrink-0 text-moon/35">or</span>
            {(isReply ? REPLY_HELP : WRITE_HELP).map((option) => (
              <button
                key={option.kind}
                type="button"
                onClick={() => void ai({ kind: option.kind })}
                disabled={working || Boolean(busy)}
                title={option.hint}
                className="pill h-7 shrink-0 px-2.5 text-[0.75rem] disabled:opacity-40"
              >
                {aiBusy === option.kind ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* ── Sending it ─────────────────────────────────────────────────────── */}
      <footer className="mail-compose-foot">
        <button
          type="button"
          onClick={send}
          disabled={Boolean(busy) || working || !recipientCount}
          title={recipientCount ? `Send to ${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'} (⌘↵)` : 'Add someone to send this to'}
          className="pill pill-lit h-9 px-4 disabled:opacity-40"
        >
          {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {busy === 'send' ? 'Sending…' : 'Send'}
        </button>
        <button type="button" onClick={saveDraft} disabled={Boolean(busy) || working} className="pill h-9 px-3.5 disabled:opacity-40">
          {busy === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          Save draft
        </button>

        <label className="pill h-9 cursor-pointer px-3.5" title="Attach a file">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Attach</span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              void addFiles(event.target.files ?? []);
              event.target.value = '';
            }}
          />
        </label>

        <button
          type="button"
          onClick={discard}
          disabled={Boolean(busy)}
          aria-label="Discard this message"
          title="Discard"
          className="pill ml-auto h-9 w-9 px-0 text-moon/60 hover:text-fall disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {error ? <p className="w-full text-[0.8125rem] text-fall">{error}</p> : null}
      </footer>
    </div>
  );
}

const WRITE_HELP = [
  { kind: 'improve', label: 'Improve', hint: 'Make it read well, same length and meaning' },
  { kind: 'professional', label: 'Professional', hint: 'Courteous and measured' },
  { kind: 'friendly', label: 'Friendly', hint: 'Warmer, as if to a colleague' },
  { kind: 'concise', label: 'Shorter', hint: 'Cut it to the essentials' },
  { kind: 'expand', label: 'Expand', hint: 'Turn the gist into a proper email' },
  { kind: 'grammar', label: 'Fix grammar', hint: 'Spelling and punctuation only' },
];

const REPLY_HELP = [{ kind: 'draft-reply', label: 'Draft a reply', hint: 'Answer what the email asks' }, ...WRITE_HELP];

/**
 * A labelled line in the composer: the label fixed-width so the fields align.
 *
 * Wrapped in forwardRef because the composer focuses the To field when it
 * opens — a plain function component silently swallows the ref, so the caret
 * started nowhere and the first thing you typed went nowhere with it.
 */
const Field = forwardRef(function Field({ label, value, onChange, placeholder, children, ...rest }, ref) {
  return (
    <label className="flex items-center gap-3 border-b border-white/[0.07] py-2">
      <span className="w-12 shrink-0 text-[0.8125rem] text-moon/45">{label}</span>
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-moon outline-none placeholder:text-moon/30"
        {...rest}
      />
      {children}
    </label>
  );
});
