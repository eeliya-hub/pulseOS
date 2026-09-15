/**
 * Moving the dashboard between views from outside React.
 *
 * The active view is App's own state, which nothing else could reach — so the
 * assistant had no way to take you anywhere. This is the same module-store shape
 * the rest of the app uses for shared state; App subscribes and switches.
 */
const subscribers = new Set();

/** Ask the dashboard to show a view: 'home' | 'markets' | 'travel' | … */
export function goToView(id) {
  if (!id) return false;
  subscribers.forEach((fn) => fn(id));
  return true;
}

/** Subscribe to navigation requests. Returns an unsubscribe function. */
export function onNavigate(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
