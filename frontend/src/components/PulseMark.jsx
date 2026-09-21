/**
 * The Pulse mark: one beat on a monitor. `animated` draws the trace on a loop —
 * used while the app is waking, where it doubles as the sign that it's working.
 */
export default function PulseMark({ className = '', animated = false }) {
  return (
    <svg viewBox="0 0 44 18" className={className} fill="none" aria-hidden="true">
      <path
        d="M1.5 10.5h10l2.6-5.5 4.2 11 3.8-14.5 3.2 9h17.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        className={animated ? 'pulse-trace' : undefined}
      />
    </svg>
  );
}
