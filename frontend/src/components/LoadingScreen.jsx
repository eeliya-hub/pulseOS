// Full-screen launch loader shown while the app preloads its data sources.
export default function LoadingScreen({ progress = 0, label = '', exiting = false }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      className={[
        'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-midnight text-white transition-opacity duration-500',
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <div className="ambient-layer" aria-hidden="true" />
      <div className="ambient-sheen" aria-hidden="true" />
      <div className="ambient-stars" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-8">
        <div className="flex items-center gap-3">
          <span className="glow-dot h-2.5 w-2.5 rounded-full bg-cyan-200 text-cyan-200" aria-hidden="true" />
          <span className="display-type text-2xl font-light tracking-[0.35em] text-white/90">
            PULSE<span className="cyan-name">OS</span>
          </span>
        </div>

        <div className="w-64 max-w-[70vw]">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 shadow-[0_0_12px_rgba(103,232,249,0.5)] transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[0.625rem] font-medium uppercase tracking-[0.2em] text-white/45">
            <span className="truncate">{label || 'Loading'}</span>
            <span className="clock-figures shrink-0 text-white/60">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
