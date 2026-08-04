export default function ViewHeader({ lead, accent, subtitle, action }) {
  return (
    <header className="relative shrink-0 pb-3 pt-1 text-center">
      <h1 className="display-type text-3xl font-extralight tracking-wide text-white/95 md:text-4xl">
        {lead}
        {accent ? (
          <>
            {' '}
            <span className="cyan-name font-light">{accent}</span>
          </>
        ) : null}
      </h1>
      {subtitle ? (
        <p className="mt-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.32em] text-white/36">
          {subtitle}
        </p>
      ) : null}
      {action ? (
        <div className="absolute right-0 top-1 flex items-center">{action}</div>
      ) : null}
    </header>
  );
}
