import { CloudOff, Loader2, Mail } from 'lucide-react';
import { providerMeta, summaryLine } from '../data/mailboxes.js';
import { useMail } from '../hooks/useMail.js';
import MailProviderMark from './MailProviderMark.jsx';

/**
 * What the Life Hub says about mail.
 *
 * A card, and the only one in the upper band — which is the point. The band's
 * left half is the date set straight on the sky with nothing around it, so the
 * right half needs an edge of its own or it reads as text that has drifted
 * there. It fills the band's full height rather than hanging off the baseline,
 * so the horizon has something that meets it.
 *
 * It holds four things and no more: whose mailbox, how much is unread, what
 * Pulse noticed about it, and the way in. An earlier version also carried the
 * two most interesting messages with their signal chips, a refresh button and
 * a "checked 2 minutes ago", which was true and was too much — this band is
 * read in passing, beside the weather. Everything that was here is a click
 * away in Mail, where there is room for it to mean something.
 *
 * The figure is the unread count, because that is the number someone opens
 * their mail to find out. The line underneath is what Pulse made of it, which
 * is the part a mail client cannot tell you.
 */
export default function MailSummary({ onOpen }) {
  const mail = useMail();
  const summary = mail.summary;
  const accounts = summary?.accounts ?? mail.accounts ?? [];

  // Nothing set up at all: say what it needs, once, and stay out of the way.
  if (!mail.connected) {
    return (
      <Card>
        <Head />
        {mail.status === null && mail.loading ? (
          <p className="t-meta mt-3 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Looking…
          </p>
        ) : mail.backendReachable === false ? (
          <p className="t-meta mt-3 flex items-center gap-2 text-amber-200/80">
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> Can’t reach the backend
          </p>
        ) : (
          <>
            <p className="t-body mt-3 text-moon/70">
              {anyConfigured(mail.configured)
                ? 'Connect Gmail or Outlook and your inbox joins the rest of your day.'
                : 'Add Gmail or Microsoft credentials to backend/.env to switch mail on.'}
            </p>
            <button type="button" onClick={() => onOpen?.()} className="pill pill-lit mt-3.5 h-9 self-start px-4">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Set up email
            </button>
          </>
        )}
      </Card>
    );
  }

  const unread = summary?.unread ?? 0;
  // An account that cannot be read is the one thing that still has to be said
  // here, because without it a smaller number looks like good news.
  const broken = accounts.find((a) => a.ok === false);
  const line = broken
    ? broken.reason === 'auth'
      ? `${broken.email ?? 'One account'} needs reconnecting`
      : `Couldn’t read ${broken.email ?? 'one account'}`
    : summaryLine(summary);

  return (
    <Card>
      <Head accounts={accounts} />

      <p className="mt-3 flex items-baseline gap-2.5">
        <span className="display-figures mail-card-figure">{unread.toLocaleString()}</span>
        <span className="t-body text-moon/75">unread</span>
      </p>
      {line ? <p className={`t-micro mt-1.5 truncate ${broken ? 'text-amber-200/80' : ''}`}>{line}</p> : null}

      <button type="button" onClick={() => onOpen?.()} className="pill pill-lit mt-3.5 h-9 self-start px-4">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        View Email
      </button>
    </Card>
  );
}

/** The outline, the light in its corner, and the room inside it. */
function Card({ children }) {
  return <div className="mail-card">{children}</div>;
}

/**
 * Whose mail this is: the word, and the mark of each service behind it.
 *
 * The marks replaced a row of coloured dots. A dot needed a tooltip to say
 * what it stood for; a logo is the thing itself, and at this size it costs the
 * same room.
 */
function Head({ accounts = [] }) {
  // One mark per service, not per account — two Gmail accounts are still Gmail,
  // and the same logo twice says nothing the first did not.
  const providers = [...new Set(accounts.map((a) => a.provider).filter(Boolean))];
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="t-label flex min-w-0 items-center gap-2">
        <Mail className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} aria-hidden="true" />
        Mail
      </p>
      {providers.length ? (
        <span className="flex shrink-0 items-center gap-1.5">
          {providers.map((provider) => (
            <MailProviderMark key={provider} provider={provider} title={providerMeta(provider).label} className="h-[1.0625rem] w-[1.0625rem]" />
          ))}
        </span>
      ) : null}
    </div>
  );
}

const anyConfigured = (configured) => Boolean(configured && Object.values(configured).some(Boolean));
