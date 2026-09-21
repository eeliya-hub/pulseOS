import { formatClock, formatShortDate } from '../utils/dateTime.js';
import PulseMark from './PulseMark.jsx';

/**
 * The line across the top of every view: whose dashboard this is, and the time.
 * Which view you're on is said by the view itself, not repeated here.
 */
export default function TopBar({ now }) {
  return (
    <header className="relative z-20 shrink-0 px-5 pb-1 pt-4 md:px-8">
      {/* Same column as the views, so the mark, the titles and the panes share one left edge. */}
      <div className="mx-auto flex max-w-[80rem] items-center justify-between">
      <div className="flex items-center gap-2">
        <PulseMark className="h-[1.05rem] w-[2.6rem] text-accent" />
        <p className="display-type text-[1.3rem] leading-none text-moon">Pulse</p>
      </div>

      {/* The date reads as a line of type; the time is a figure, set in the
          display face so it carries at a glance from across the room. */}
      <div className="flex items-center gap-4">
        <p className="t-label text-right leading-tight text-haze">{formatShortDate(now)}</p>
        <span className="h-7 w-px shrink-0 bg-white/15" aria-hidden="true" />
        <p className="display-figures text-[2rem] leading-none text-moon">{formatClock(now).replace(' : ', ':')}</p>
      </div>
      </div>
    </header>
  );
}
