/**
 * The mark of whichever service a mailbox actually belongs to.
 *
 * Drawn here rather than fetched, for the reason everything else in Pulse is:
 * these appear on the Life Hub the moment it paints, and a logo that arrives
 * over the network arrives late, pops in, and fails to arrive at all when the
 * machine is offline — which is exactly when you most want the dashboard to
 * look finished.
 *
 * They are the services' own marks, used to say which account you are looking
 * at. Small, so each is the simplest form that is still recognisable at
 * sixteen pixels: Gmail's envelope M, Outlook's O beside its envelope.
 */

const MARKS = {
  google: GmailMark,
  microsoft: OutlookMark,
};

/**
 * @param {{ provider: string, className?: string, title?: string }} props
 */
export default function MailProviderMark({ provider, className = 'h-4 w-4', title }) {
  const Mark = MARKS[provider];
  if (!Mark) return null;
  return (
    <span className={`inline-grid shrink-0 place-items-center ${className}`} title={title} role="img" aria-label={title}>
      <Mark />
    </span>
  );
}

function GmailMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true" focusable="false">
      <path fill="#4CAF50" d="M45 16.2l-5 2.75-5 4.75V40h7a3 3 0 0 0 3-3V16.2z" />
      <path fill="#1E88E5" d="M3 16.2l3.614 1.71L13 23.7V40H6a3 3 0 0 1-3-3V16.2z" />
      <path fill="#E53935" d="M35 11.2L24 19.45 13 11.2l-1 5.8 1 6.7 11 8.25 11-8.25 1-6.7z" />
      <path fill="#C62828" d="M3 12.298V16.2l10 7.5V11.2L9.876 8.859A3.75 3.75 0 0 0 7.298 8 4.298 4.298 0 0 0 3 12.298z" />
      <path fill="#FBC02D" d="M45 12.298V16.2l-10 7.5V11.2l3.124-2.341A3.75 3.75 0 0 1 40.702 8 4.298 4.298 0 0 1 45 12.298z" />
    </svg>
  );
}

function OutlookMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true" focusable="false">
      {/* The envelope, lighter blue, behind and to the right. */}
      <path fill="#0F6CBD" d="M22 12h22a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2H22z" />
      <path fill="#fff" fillOpacity=".92" d="M24 17h20v2.6L34 26.4 24 19.6z" />
      <path fill="#0A4A84" fillOpacity=".55" d="M24 19.6l10 6.8 10-6.8V22l-10 6.8L24 22z" />
      {/* The O, on its own darker tile, in front. */}
      <rect x="2" y="7" width="24" height="34" rx="3.2" fill="#0A3D73" />
      <ellipse cx="14" cy="24" rx="6.1" ry="7.6" fill="none" stroke="#fff" strokeWidth="3.3" />
    </svg>
  );
}
