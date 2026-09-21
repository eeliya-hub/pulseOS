/**
 * The light behind everything — see useSky() for where its colour comes from.
 * Purely atmospheric: it takes no input and is hidden from assistive tech.
 */
export default function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="sky-field" />
      <div className="sky-stars" />
      <div className="sky-horizon" />
      <div className="sky-vignette" />
      <div className="sky-grain" />
    </div>
  );
}
