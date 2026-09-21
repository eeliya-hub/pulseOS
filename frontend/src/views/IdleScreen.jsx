import SettingsButton from '../components/SettingsButton.jsx';
import { useSettings } from '../hooks/useSettings.js';
import { formatClock, formatLongDate, getGreeting } from '../utils/dateTime.js';

/**
 * The screen at rest: the time, large enough to read from across a room, set
 * against the hour's sky. Everything else is a whisper around it — the greeting
 * above in the hour's own colour, the date below in the display face, and the
 * way back out kept to the smallest thing on the screen.
 */
export default function IdleScreen({ now }) {
  const { settings } = useSettings();
  const clock = formatClock(now).replace(' : ', ':');

  return (
    <section className="relative z-10 grid h-dvh place-items-center px-6 text-center">
      <div className="view-enter flex flex-col items-center">
        <p className="t-eyebrow text-[1.0625rem]">
          {getGreeting(now)}, <span className="text-moon/80">{settings.name}</span>
        </p>

        {/* The hour itself. Each minute resolves in rather than snapping over. */}
        <p
          key={clock}
          data-view-hero=""
          className="display-figures figure-tick mt-10 text-[clamp(7rem,17vw,14rem)] leading-[0.92] tracking-[-0.04em] text-moon"
        >
          {clock}
        </p>

        <p className="display-type mt-8 text-[1.625rem] leading-none text-moon/70">{formatLongDate(now)}</p>

        <p className="breathe t-micro mt-16 text-moon/45">Touch anywhere to wake</p>
      </div>

      {/* Delicate settings affordance — tucked in the corner, ignored by wake */}
      <SettingsButton className="absolute bottom-6 right-6 opacity-30 hover:opacity-90" />
    </section>
  );
}
