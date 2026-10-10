import { CloudOff, Info, Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { providerMeta } from '../../data/mailboxes.js';
import { useMail } from '../../hooks/useMail.js';
import { useMinute } from '../../hooks/useMinute.js';
import { since } from '../../utils/formatters.js';
import { Confirm, Empty, Group, Hint, Page, Preview, Row } from './controls.jsx';

/** The inbox at a glance: the figure, and what Pulse made of it. */
export function MailPreview() {
  const mail = useMail();
  const summary = mail.summary;
  const accounts = summary?.accounts ?? [];

  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">{mail.connected ? 'Unread' : 'Mail'}</p>
      <p className="display-type absolute left-5 top-9 text-[1.75rem] leading-none text-moon">
        {!mail.connected ? (mail.loading && !mail.status ? '…' : 'Off') : (summary?.unread ?? 0)}
      </p>
      {mail.connected ? (
        <div className="absolute inset-x-5 bottom-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {accounts.slice(0, 3).map((account) => (
                <p key={account.id} className="flex items-center gap-1.5 text-[0.6875rem] text-moon/60">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: providerMeta(account.provider).color }}
                  />
                  <span className="truncate">{account.email}</span>
                </p>
              ))}
            </div>
            <div className="shrink-0 text-right">
              {summary?.needsAction ? <p className="text-[0.6875rem] text-[#FF6B57]">{summary.needsAction} need a reply</p> : null}
              {summary?.deadlines ? <p className="text-[0.6875rem] text-[#FF9F0A]">{summary.deadlines} with a deadline</p> : null}
            </div>
          </div>
        </div>
      ) : (
        <Mail className="absolute bottom-4 right-5 h-8 w-8 text-moon/15" strokeWidth={1.4} aria-hidden="true" />
      )}
    </Preview>
  );
}

/**
 * The mail accounts Pulse reads and writes, and what it is allowed to do with
 * them. Deliberately explicit about the permissions: email is the most
 * sensitive thing the app touches, and what it can and cannot do should be
 * readable here rather than inferred from behaviour.
 */
export function MailPane() {
  const mail = useMail();
  const now = useMinute();
  const providers = mail.providers ?? [];

  return (
    <Page>
      <Group
        title="Accounts"
        note="Pulse signs in with OAuth and keeps the tokens on this machine, in backend/.tokens.json. It never sees or stores your password."
        action={
          <button type="button" onClick={() => mail.refresh()} className="pill h-8 px-3.5">
            <RefreshCw className={`h-3.5 w-3.5 ${mail.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Check again
          </button>
        }
      >
        {mail.loading && !mail.status ? (
          <p className="flex items-center gap-2 px-5 py-5 text-[0.9375rem] text-dim">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Asking the backend…
          </p>
        ) : mail.backendReachable === false && !mail.status ? (
          <Row label="The backend isn’t answering" hint="Start it with npm run dev in the project folder, then check again." />
        ) : (
          <>
            {(mail.accounts ?? []).map((account) => {
              const meta = providerMeta(account.provider);
              return (
                <Row
                  key={account.id}
                  label={account.email}
                  hint={
                    account.needsReconnect
                      ? 'Sign-in expired — reconnect to read this mailbox again'
                      : `${meta.label}${account.name ? ` · ${account.name}` : ''} · connected ${since(account.connectedAt, now.getTime())}`
                  }
                  lead={
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.7rem]"
                      style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}
                    >
                      <Mail className="h-4 w-4" strokeWidth={1.7} style={{ color: meta.color }} aria-hidden="true" />
                    </span>
                  }
                >
                  {account.needsReconnect ? (
                    <button type="button" onClick={() => mail.connect(account.provider)} className="pill pill-lit h-9 px-4">
                      <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Reconnect
                    </button>
                  ) : (
                    <span className="pill h-7 px-3 text-[0.75rem] !bg-rise/[0.12] !text-rise !shadow-none">Live</span>
                  )}
                  {/* Asks twice: disconnecting drops the tokens, and reading this
                      mailbox again means signing in from scratch. */}
                  <Confirm ask="Disconnect?" onConfirm={() => mail.disconnect(account.id)}>
                    Disconnect
                  </Confirm>
                </Row>
              );
            })}

            {/* Anything configured that isn't connected yet. */}
            {providers
              .filter((provider) => provider.configured && !(mail.accounts ?? []).some((a) => a.provider === provider.id))
              .map((provider) => (
                <Row
                  key={provider.id}
                  label={provider.label}
                  hint="Not connected"
                  lead={
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.7rem]"
                      style={{ background: `color-mix(in srgb, ${providerMeta(provider.id).color} 14%, transparent)` }}
                    >
                      <Mail className="h-4 w-4" strokeWidth={1.7} style={{ color: providerMeta(provider.id).color }} aria-hidden="true" />
                    </span>
                  }
                >
                  <button type="button" onClick={() => mail.connect(provider.id)} className="pill pill-lit h-9 px-4">
                    Connect
                  </button>
                </Row>
              ))}

            {/* And anything that still needs credentials in .env. */}
            {providers
              .filter((provider) => !provider.configured)
              .map((provider) => (
                <Row
                  key={provider.id}
                  label={provider.label}
                  hint={
                    provider.id === 'google'
                      ? 'Needs MAIL_GOOGLE_CLIENT_ID (or GOOGLE_CLIENT_ID) in backend/.env, with the Gmail API enabled'
                      : 'Needs MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in backend/.env'
                  }
                  lead={
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.7rem] bg-white/[0.03] text-moon/30">
                      <Mail className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
                    </span>
                  }
                />
              ))}

            {!providers.length ? <Empty>No mail providers are built in yet.</Empty> : null}
          </>
        )}
      </Group>

      {/* Add another account of the same kind — the whole point of keeping mail
          off the calendar's single Google sign-in. */}
      {(mail.accounts ?? []).length ? (
        <Group title="Another mailbox" note="A personal address and a work one can both be connected. Mail from each is marked with its own colour, and you can read them together or one at a time.">
          {providers
            .filter((provider) => provider.configured)
            .map((provider) => (
              <Row key={provider.id} label={`Add another ${provider.label} account`}>
                <button type="button" onClick={() => mail.connect(provider.id)} className="pill h-9 px-4">
                  Connect
                </button>
              </Row>
            ))}
        </Group>
      ) : null}

      <Group
        title="What Pulse can do with your mail"
        note="The permissions asked for, and the ones deliberately not asked for."
        bare
      >
        <div className="settings-well">
          <Permission allowed label="Read your mail" detail="To show it, count it, and answer questions about it." />
          <Permission allowed label="Send, and save drafts" detail="Only when you press Send or Save draft yourself." />
          <Permission allowed label="Star, mark read, archive, move to bin or spam" detail="From the controls on a message." />
          <Permission label="Delete anything permanently" detail="Not requested. Binned mail stays recoverable in your provider." />
          <Permission label="Send on its own" detail="The assistant can write a draft and fill the composer. It cannot send — there is no path from it to sending." />
          <Permission label="Archive or bin on its own" detail="Those run from the controls you press, never from the assistant." />
          <Permission label="Read your calendar with this sign-in" detail="Mail and calendar are separate grants. Neither one's token works for the other." />
        </div>
      </Group>

      <Group title="What the assistant is given" note="Email reaches Pulse's AI only when you ask, and only the part you asked about." bare>
        <div className="settings-well">
          <Row
            label="Only what you point at"
            hint="The open message, its recent thread, or a line you highlight. Each has a hard size limit, and a search returns subjects and previews rather than bodies."
            lead={<ShieldCheck className="h-4 w-4 shrink-0 text-rise" aria-hidden="true" />}
          />
          <Row
            label="Nothing automatic"
            hint="No mail is sent to a model in the background. The Life Hub's counts and the deadline and reply hints are worked out on your machine, without an AI call."
            lead={<ShieldCheck className="h-4 w-4 shrink-0 text-rise" aria-hidden="true" />}
          />
          <Row
            label="You confirm every change"
            hint="A task, a project item or a calendar event from an email is shown to you first, with every field editable, and is only written when you agree to it."
            lead={<ShieldCheck className="h-4 w-4 shrink-0 text-rise" aria-hidden="true" />}
          />
        </div>
      </Group>

      <Group title="Privacy on this machine" bare>
        <div className="settings-well">
          <Row
            label="Message bodies are never written to disk"
            hint="Subjects, senders and previews are kept so your inbox and the Life Hub card appear instantly. Bodies are held in memory while the app is open and go when you close it."
            lead={<ShieldCheck className="h-4 w-4 shrink-0 text-rise" aria-hidden="true" />}
          />
          <Row
            label="Pictures in mail are held back"
            hint="Loading a remote image tells the sender you opened it. Pulse blocks them and offers to show them per message."
            lead={<ShieldCheck className="h-4 w-4 shrink-0 text-rise" aria-hidden="true" />}
          />
        </div>
      </Group>

      {(mail.unavailable ?? []).length ? (
        <Group title="Not available" bare>
          <div className="settings-well">
            {mail.unavailable.map((item) => (
              <Row
                key={item.id}
                label={item.label}
                hint={item.reason}
                lead={<Info className="h-4 w-4 shrink-0 text-moon/35" aria-hidden="true" />}
              />
            ))}
          </div>
        </Group>
      ) : null}

      <Hint className="mt-6">
        Credentials live in backend/.env on this machine and never reach this page. The OAuth tokens live beside them in
        backend/.tokens.json — both are kept out of version control.
      </Hint>
    </Page>
  );
}

/** One permission, said as a yes or a no. */
function Permission({ allowed, label, detail }) {
  return (
    <Row
      label={label}
      hint={detail}
      lead={
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold ${
            allowed ? 'bg-rise/15 text-rise' : 'bg-white/[0.05] text-moon/35'
          }`}
          aria-hidden="true"
        >
          {allowed ? '✓' : '—'}
        </span>
      }
    >
      <span className={`text-[0.75rem] ${allowed ? 'text-rise/80' : 'text-moon/40'}`}>{allowed ? 'Allowed' : 'Never'}</span>
    </Row>
  );
}
