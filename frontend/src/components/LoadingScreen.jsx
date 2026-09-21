import PulseMark from './PulseMark.jsx';
import Sky from './Sky.jsx';

/**
 * The app waking up: the mark draws its beat while the data comes in, and the
 * whole screen dissolves into the dashboard once it's ready.
 */
export default function LoadingScreen({ progress = 0, label = '', exiting = false }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      className={[
        'fixed inset-0 z-[100] grid place-items-center text-moon transition-opacity duration-700',
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <Sky />

      <div
        className={[
          'relative z-10 flex w-[21rem] max-w-[80vw] flex-col items-center transition-transform duration-700',
          exiting ? 'scale-[1.04]' : 'scale-100',
        ].join(' ')}
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      >
        <PulseMark animated className="h-14 w-32 text-accent" />
        <p className="display-type mt-4 text-[3.25rem] leading-none text-moon">Pulse</p>

        <div className="mt-9 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-moon transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex w-full items-center justify-between text-[0.8125rem] text-haze">
          <span className="truncate">{label || 'Waking up'}</span>
          <span className="clock-figures shrink-0 text-dim">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
