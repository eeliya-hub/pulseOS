/**
 * A day, as a key, in local time.
 *
 * These two lived in useLifeData, which is a React store that reads
 * localStorage the moment it is imported. Everything that wants to reason
 * about a date had to pull that in with it — and once useLifeData needed the
 * to-do rules, and the to-do rules needed these, the two files imported each
 * other. A cycle that happens to work under one bundler's ordering is not a
 * thing to leave in place, so the arithmetic moved down here where neither has
 * to reach through the other to get at it.
 *
 * useLifeData still exports both under their old names, so nothing that used
 * them has to know any of this.
 */

/** 'YYYY-MM-DD' for a Date, by its local fields rather than its UTC ones. */
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Back the other way: midnight, local, on that day. */
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
