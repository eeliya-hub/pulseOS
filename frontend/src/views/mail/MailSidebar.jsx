import { CloudOff, Mail, Plus, Settings2 } from 'lucide-react';
import { CATEGORIES, MAILBOXES, providerMeta } from '../../data/mailboxes.js';

/**
 * The left column: which accounts, and which mailbox of them you're reading.
 *
 * Only the mailboxes the connected accounts actually have are offered, and
 * Gmail's inbox categories appear only while an account that HAS them is in
 * view — so someone with Outlook alone never sees four mailboxes that would
 * always be empty.
 */
export default function MailSidebar({
  mail,
  mailbox,
  category,
  accountId,
  onMailbox,
  onCategory,
  onAccount,
  onCompose,
  onSettings,
}) {
  const accounts = mail.accounts ?? [];
  const multiple = accounts.length > 1;

  // What's on offer, from what's connected — not from a fixed list.
  const offered = accountId
    ? (accounts.find((a) => a.id === accountId)?.capabilities?.mailboxes ?? [])
    : mail.capabilities.mailboxes;
  const boxes = MAILBOXES.filter((box) => offered.includes(box.id));

  const categoriesOffered = accountId
    ? (accounts.find((a) => a.id === accountId)?.capabilities?.categories ?? [])
    : mail.capabilities.categories;
  const cats = CATEGORIES.filter((c) => categoriesOffered.includes(c.id));

  return (
    <div className="flex min-h-0 flex-col pr-6 pt-7">
      <button type="button" onClick={onCompose} className="pill pill-lit h-10 shrink-0 justify-start px-4">
        <Plus className="h-4 w-4" aria-hidden="true" />
        Write
      </button>

      <div className="glass-scroll mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        {/* Accounts, when there is more than one to choose between. */}
        {multiple ? (
          <div className="mb-5">
            <p className="t-label mb-2 px-2 text-[0.75rem]">Accounts</p>
            <AccountRow
              label="All mail"
              active={!accountId}
              onClick={() => onAccount(undefined)}
              dot={<Mail className="h-3 w-3 text-moon/50" aria-hidden="true" />}
            />
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                label={account.email}
                meta={providerMeta(account.provider).label}
                active={accountId === account.id}
                warn={account.needsReconnect}
                onClick={() => onAccount(account.id)}
                dot={
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: providerMeta(account.provider).color }}
                    aria-hidden="true"
                  />
                }
              />
            ))}
          </div>
        ) : null}

        <p className="t-label mb-2 px-2 text-[0.75rem]">Mailboxes</p>
        <nav aria-label="Mailboxes">
          {boxes.map((box) => {
            const unread = mail.unreadFor(box.id);
            const on = mailbox === box.id && !category;
            return (
              <button
                key={box.id}
                type="button"
                onClick={() => onMailbox(box.id)}
                aria-current={on ? 'true' : undefined}
                className={`mail-nav-row ${on ? 'mail-nav-row--on' : ''}`}
              >
                <box.Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">{box.label}</span>
                {/* A count only where the provider keeps one. Null means "not
                    counted", which must not render as a zero. */}
                {unread ? <span className="mail-count">{unread > 99 ? '99+' : unread}</span> : null}
              </button>
            );
          })}
        </nav>

        {cats.length ? (
          <>
            <p className="t-label mb-2 mt-5 px-2 text-[0.75rem]">
              Inbox categories
              <span className="t-micro ml-1.5 font-normal normal-case">Gmail</span>
            </p>
            <nav aria-label="Inbox categories">
              {cats.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onCategory(cat.id)}
                  aria-current={category === cat.id ? 'true' : undefined}
                  className={`mail-nav-row ${category === cat.id ? 'mail-nav-row--on' : ''}`}
                >
                  <cat.Icon className="h-4 w-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left">{cat.label}</span>
                </button>
              ))}
            </nav>
          </>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onSettings}
        className="pill mt-4 h-9 shrink-0 justify-start px-3.5 text-moon/70"
      >
        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        Accounts
      </button>
    </div>
  );
}

function AccountRow({ label, meta, active, warn, onClick, dot }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`mail-nav-row ${active ? 'mail-nav-row--on' : ''}`}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">{dot}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate">{label}</span>
        {meta ? <span className="t-micro block truncate">{meta}</span> : null}
      </span>
      {warn ? <CloudOff className="h-3.5 w-3.5 shrink-0 text-amber-200/80" aria-hidden="true" title="Needs reconnecting" /> : null}
    </button>
  );
}
