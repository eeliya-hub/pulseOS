export default function Dock({ items, activeView, onChange }) {
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]"
      aria-label="Primary"
    >
      <div className="theme-dock pointer-events-auto relative flex h-14 items-center gap-1 rounded-full px-3">
        {items.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          const isAI = id === 'ai';

          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={[
                'dock-button group relative grid shrink-0 place-items-center transition-all duration-300',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                isAI
                  ? 'orb-button mx-1 h-11 w-11 rounded-full text-white hover:scale-105'
                  : 'h-10 w-10 rounded-2xl hover:bg-white/8',
                isActive && !isAI
                  ? 'text-white'
                  : isAI
                    ? 'text-white'
                    : 'text-white/34 hover:text-white/80',
              ].join(' ')}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="dock-tooltip absolute -top-9 whitespace-nowrap rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white shadow-xl backdrop-blur-md">
                {label}
              </span>

              <Icon
                className={isAI ? 'h-5 w-5' : 'h-[18px] w-[18px]'}
                strokeWidth={isActive || isAI ? 2 : 1.8}
                aria-hidden="true"
              />

              {isActive && !isAI ? (
                <span
                  className="glow-dot absolute -bottom-0.5 h-1 w-1 rounded-full bg-cyan-100 text-cyan-100"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
