import SettingsButton from '../components/SettingsButton.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { formatClock, formatLongDate, getGreeting } from '../utils/dateTime.js';

export default function IdleScreen({ now }) {
  const { settings } = useSettings();
  return (
    <section className="relative z-10 grid h-dvh place-items-center px-4 text-center">
      <div
        className="breathe pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(116,242,255,0.09) 0%, rgba(140,120,220,0.06) 42%, transparent 68%)',
        }}
        aria-hidden="true"
      />

      <div className="fade-in relative flex flex-col items-center">
        <p className="text-xs font-semibold uppercase tracking-[0.5em] text-white/44">
          {getGreeting(now)}
        </p>
        <p className="cyan-name mt-2 text-sm font-medium uppercase tracking-[0.34em]">
          {settings.name}
        </p>

        <p className="clock-figures mt-6 text-[clamp(5.5rem,13vw,10rem)] font-extralight leading-none text-white text-glow">
          {formatClock(now)}
        </p>

        <p className="display-type mt-6 text-lg font-light tracking-[0.06em] text-white/72 md:text-xl">
          {formatLongDate(now)}
        </p>

        <p className="mt-14 animate-pulse text-[0.625rem] font-medium uppercase tracking-[0.4em] text-white/28">
          Touch anywhere to wake
        </p>
      </div>

      {/* Delicate settings affordance — tucked in the corner, ignored by wake */}
      <SettingsButton className="absolute bottom-6 right-6 opacity-30 hover:opacity-90" />
    </section>
  );
}
