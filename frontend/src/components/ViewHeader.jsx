/**
 * A view's title, set left like the opening of a chapter: the name in the
 * display face, one quiet line about its state beneath, and the view's own
 * controls on the right. `lead` and `accent` are joined — a title is one voice,
 * not two colours.
 */
export default function ViewHeader({ lead, accent, subtitle, action }) {
  const title = [lead, accent].filter(Boolean).join(' ');
  return (
    <header className="relative flex shrink-0 items-end justify-between gap-6 pb-4 pt-1">
      <div className="min-w-0">
        <h1 className="display-type truncate text-[2.625rem] leading-[1.02] text-moon">{title}</h1>
        {subtitle ? <p className="mt-1.5 truncate text-[0.875rem] text-haze">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 pb-1">{action}</div> : null}
    </header>
  );
}
