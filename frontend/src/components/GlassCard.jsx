/**
 * A pane: the container for one whole subject on a view. Frosted over the sky
 * and edged with light (see .theme-card). `tone` is accepted for existing
 * callers but no longer tints — colour belongs to the sky and the content.
 */
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
      data-tone={tone}
      className={[
        'theme-card relative rounded-3xl text-moon/90 fade-in',
        noPadding ? '' : 'p-4 md:p-5',
        hover || interactive ? 'cursor-pointer transition-colors duration-300 hover:bg-white/[0.03]' : '',
        className,
      ].join(' ')}
      style={{ '--delay': `${delay}ms` }}
    >
      {children}
    </div>
  );
}
