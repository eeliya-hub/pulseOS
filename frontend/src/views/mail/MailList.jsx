import { Archive, CloudOff, Loader2, Paperclip, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { providerMeta, visibleSignals } from '../../data/mailboxes.js';
import { mailTime } from '../../utils/dateTime.js';

/**
 * The middle column: a page of mail.
 *
 * One row per message, dense enough to scan and loose enough to read. Unread is
 * carried by weight and a mark rather than by colour alone, so it survives being
 * looked at quickly and does not depend on seeing a particular hue.
 *
 * Paging loads as you reach the end rather than on a button, watched with an
 * observer so it costs nothing while you are not near it.
 */
export default function MailList({
  mail,
  messages,
  selectedId,
  onSelect,
  onStar,
  onArchive,
  onTrash,
  showAccount,
  emptyLabel,
}) {
  const sentinel = useRef(null);
  const { hasMore, listLoading, loadMore } = mail;

  // Load the next page as the end comes into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return undefined;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !listLoading) void loadMore();
      },
      { rootMargin: '240px' },
    );
    watch.observe(node);
    return () => watch.disconnect();
  }, [hasMore, listLoading, loadMore]);

  // A listing that failed, with nothing already on screen to keep showing.
  if (mail.listError && !messages.length) {
    return (
      <div className="flex min-h-0 flex-1 items-start pt-10">
        <p className="t-meta flex items-center gap-2 text-amber-200/80">
          <CloudOff className="h-4 w-4" aria-hidden="true" />
          {mail.listError}
        </p>
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-start pt-10">
        {mail.listLoading ? <MailSkeleton /> : <p className="t-meta">{emptyLabel ?? 'Nothing here'}</p>}
      </div>
    );
  }

  return (
    <div className="glass-scroll min-h-0 flex-1 overflow-y-auto pr-1 [mask-image:linear-gradient(180deg,#000_96%,transparent)]">
      <div className="cascade">
        {messages.map((message) => (
          <MailRow
            key={`${message.accountId}:${message.id}`}
            message={message}
            selected={selectedId === `${message.accountId}:${message.id}`}
            showAccount={showAccount}
            onSelect={() => onSelect(message)}
            onStar={() => onStar(message)}
            onArchive={() => onArchive(message)}
            onTrash={() => onTrash(message)}
          />
        ))}
      </div>

      <div ref={sentinel} className="h-8">
        {mail.listLoading && messages.length ? (
          <p className="t-micro flex items-center gap-2 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading more…
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MailRow({ message, selected, showAccount, onSelect, onStar, onArchive, onTrash }) {
  const signals = visibleSignals(message.triage, { limit: 2 });
  const provider = providerMeta(message.provider);

  return (
    <div
      role="row"
      className={`mail-row group ${selected ? 'mail-row--on' : ''} ${message.unread ? 'mail-row--unread' : ''}`}
    >
      {/* The row itself opens the message; the controls sit above it so a click
          on one never also selects. */}
      <button type="button" onClick={onSelect} className="mail-row-open" aria-current={selected ? 'true' : undefined}>
        <span className="mail-row-mark" aria-hidden="true" />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="mail-row-from truncate">{message.from?.name || message.from?.email || 'Unknown sender'}</span>
            {showAccount ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: provider.color }}
                title={`${provider.label} — ${message.accountId}`}
                aria-hidden="true"
              />
            ) : null}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {message.hasAttachments ? (
                <Paperclip className="h-3 w-3 text-moon/40" aria-hidden="true" title="Has an attachment" />
              ) : null}
              <span className="clock-figures text-[0.75rem] text-moon/50">{mailTime(message.date)}</span>
            </span>
          </span>

          <span className="mail-row-subject mt-0.5 truncate">{message.subject}</span>

          <span className="mt-0.5 flex items-center gap-2">
            <span className="t-micro min-w-0 flex-1 truncate">{message.snippet}</span>
            {signals.map((signal) => (
              <span
                key={signal.id}
                title={signal.hint}
                className="shrink-0 rounded-full px-1.5 py-[0.0625rem] text-[0.625rem] font-semibold uppercase tracking-wide"
                style={{ color: signal.tone, background: `color-mix(in srgb, ${signal.tone} 16%, transparent)` }}
              >
                {signal.label}
              </span>
            ))}
          </span>
        </span>
      </button>

      {/* Shown on hover and on keyboard focus — never hover alone, or they
          would be unreachable without a pointer. */}
      <div className="mail-row-acts">
        <RowAction label={message.starred ? 'Unstar' : 'Star'} onClick={onStar} active={message.starred}>
          <Star className={`h-3.5 w-3.5 ${message.starred ? 'fill-current' : ''}`} aria-hidden="true" />
        </RowAction>
        <RowAction label="Archive" onClick={onArchive}>
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        </RowAction>
        <RowAction label="Move to bin" onClick={onTrash}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </RowAction>
      </div>
    </div>
  );
}

function RowAction({ label, onClick, active, children }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`mail-row-act ${active ? 'mail-row-act--on' : ''}`}
    >
      {children}
    </button>
  );
}

/** Four rows of the right shape, while the first page is on its way. */
function MailSkeleton() {
  return (
    <div className="w-full space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="mail-skeleton" style={{ '--delay': `${i * 90}ms` }}>
          <span className="mail-skeleton-line" style={{ width: `${38 + ((i * 13) % 22)}%` }} />
          <span className="mail-skeleton-line" style={{ width: `${62 + ((i * 9) % 26)}%` }} />
          <span className="mail-skeleton-line" style={{ width: `${48 + ((i * 17) % 30)}%` }} />
        </div>
      ))}
    </div>
  );
}

