import { Zap } from 'lucide-react';
import { formatClock, formatShortDate } from '../utils/dateTime.js';

export default function TopBar({ activeLabel, now }) {
  return (
    <header className="relative z-20 flex shrink-0 items-center justify-between px-6 pb-1 pt-4 md:px-8">
      <div className="flex items-center gap-2.5">
        <span className="glow-ring grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-tr from-cyan-300/80 to-purple-400/80">
          <Zap className="h-3.5 w-3.5 text-white" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/85">
          Pulse
        </p>
        <span className="h-1 w-1 rounded-full bg-white/25" aria-hidden="true" />
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
          {activeLabel}
        </p>
      </div>

      <div className="flex items-center gap-3 text-white/70">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
          {formatShortDate(now)}
        </p>
        <p className="clock-figures text-lg font-semibold text-white/90">
          {formatClock(now)}
        </p>
      </div>
    </header>
  );
}
