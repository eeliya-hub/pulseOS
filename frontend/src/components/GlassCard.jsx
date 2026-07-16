const toneMap = {
  cyan: 'shadow-[0_0_36px_rgba(56,150,220,0.13),0_14px_44px_rgba(5,8,24,0.28)]',
  purple: 'shadow-[0_0_36px_rgba(140,110,220,0.13),0_14px_44px_rgba(5,8,24,0.28)]',
  pink: 'shadow-[0_0_36px_rgba(200,100,170,0.11),0_14px_44px_rgba(5,8,24,0.28)]',
  green: 'shadow-[0_0_36px_rgba(52,180,160,0.11),0_14px_44px_rgba(5,8,24,0.28)]',
  amber: 'shadow-[0_0_36px_rgba(210,160,90,0.1),0_14px_44px_rgba(5,8,24,0.28)]',
  white: '',
};

export default function GlassCard({
  children,
  className = '',
  tone = 'white',
  hover = false,
  interactive = false,
  delay = 0,
  noPadding = false,
}) {
  return (
    <div
      className={[
        'theme-card relative rounded-3xl text-white/90 fade-in',
        noPadding ? '' : 'p-4 md:p-5',
        toneMap[tone] ?? toneMap.white,
        hover || interactive
          ? 'cursor-pointer transition-all duration-500 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]'
          : '',
        className,
      ].join(' ')}
      style={{ '--delay': `${delay}ms` }}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      {children}
    </div>
  );
}
