/**
 * The frame every view is composed in: a sky, a horizon, and the ground.
 *
 * The sky holds what a view is about, set large and straight on the light —
 * the day, the track, the trip — with no box around it. It is the same height
 * in every view, so the horizon falls on one line as you move between tabs.
 * The ground is where you work: one surface that runs the full width of the
 * window from the horizon down beneath the dock, divided into columns by space
 * and a faint rule rather than chopped into floating cards. Only real objects —
 * a sleeve, a video, a map, an app icon — sit on it as tiles.
 */

/**
 * The upper band: a view's hero, bottom-aligned to the horizon.
 *
 * `tape` is for Markets alone, which hangs its ticker between the sky and the
 * ground; the band gives back the tape's height so that horizon still lands on
 * the shared line.
 */
export function SkyZone({ children, tape = false, className = '' }) {
  return (
    <section
      data-view-hero=""
      className={`sky-zone ${tape ? 'sky-zone--tape' : ''} relative z-10 shrink-0 ${className}`}
    >
      {children}
    </section>
  );
}

/** The ground: everything below the horizon. Lay columns out inside it. */
export function Ground({ children, className = '' }) {
  return <section className={`ground relative z-10 min-h-0 flex-1 ${className}`}>{children}</section>;
}

/**
 * The head of a column: an accent tick, what the column is, and an optional
 * control on the right. Fixed height, so every column's content starts on the
 * same line however long its label runs.
 */
export function ColumnHead({ label, action, className = '' }) {
  return (
    <div className={`col-head ${className}`}>
      {label ? (
        <h2 className="col-head-label">
          <span className="t-label truncate">{label}</span>
        </h2>
      ) : (
        <span />
      )}
      {action}
    </div>
  );
}

/**
 * One column of the ground: its head, and its content filling what's left —
 * scrolling inside itself if it must.
 */
export function Column({ label, action, children, className = '', bodyClassName = '' }) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      {label || action ? <ColumnHead label={label} action={action} /> : null}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
