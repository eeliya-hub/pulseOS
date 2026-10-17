import { dateKey, keyToDate } from './dates.js';

/**
 * How often a to-do comes back.
 *
 * Two different things live in this list and it is worth being clear which is
 * which, because they behave differently and the difference is the point.
 *
 *   A REPEAT — daily, weekly, monthly, yearly — is a thing that genuinely
 *   happens again. Putting the bins out on Monday does not mean you have put
 *   next Monday's out, so each occurrence is ticked off on its own day and the
 *   next one arrives fresh.
 *
 *   UNTIL DONE is not that. "Call the dentist" every day is not five phone
 *   calls, it is one call you have not made yet — so it keeps appearing, day
 *   after day, until you tick it off, and then it stops for good.
 *
 * `occursOn` in useLifeData is the events' version of this and knows about
 * neither, which is why to-dos get their own.
 */

export const TODO_REPEAT = [
  { value: 'none', label: 'Once' },
  { value: 'untilDone', label: 'Until done' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const CADENCES = new Set(['daily', 'weekly', 'monthly', 'yearly']);

/** True for the ones that come back whether or not the last one was done. */
export const isRepeating = (todo) => CADENCES.has(todo?.repeat);

/**
 * Is it ticked off on this day?
 *
 * A repeat is ticked per day, so the done-ness is a list of days; everything
 * else is ticked once and for all, so it is the flag it always was. Keeping
 * `done` meaning what it has always meant for a one-off is deliberate —
 * everything that reads a to-do outside this view still reads it correctly.
 */
export function todoDoneOn(todo, dayKey) {
  if (isRepeating(todo)) return (todo.doneDays ?? []).includes(dayKey);
  return Boolean(todo?.done);
}

/** The day an until-done to-do was finished, for one saved before this existed. */
const finishedOn = (todo) => todo.doneOn ?? todo.date;

/** Does this to-do belong on this day? */
export function todoOccursOn(todo, targetKey) {
  if (!todo?.date) return false;
  const repeat = todo.repeat ?? 'none';

  if (repeat === 'untilDone') {
    // Done is done: it stays on the day it was ticked and comes back no more.
    if (todo.done) return finishedOn(todo) === targetKey;
    return targetKey >= todo.date;
  }

  if (todo.date === targetKey) return true;
  if (!CADENCES.has(repeat)) return false;

  const start = keyToDate(todo.date);
  const target = keyToDate(targetKey);
  // Not before it was asked for. A weekly to-do set on the 8th is not a thing
  // you failed to do on the 1st.
  if (target < start) return false;

  switch (repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return start.getDay() === target.getDay();
    case 'monthly':
      return onTheSameDateOfTheMonth(start, target);
    case 'yearly':
      return onTheSameDateOfTheMonth(start, target) && start.getMonth() === target.getMonth();
    default:
      return false;
  }
}

/**
 * The 31st, in a month that has thirty days.
 *
 * It lands on the last day of that month rather than skipping it, because a
 * monthly to-do set on the 31st that silently misses February, April, June,
 * September and November is a to-do that does not work.
 */
function onTheSameDateOfTheMonth(start, target) {
  if (start.getDate() === target.getDate()) return true;
  const lastOfTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return start.getDate() > lastOfTarget && target.getDate() === lastOfTarget;
}

/** How a to-do's frequency reads under it, or nothing for a one-off. */
export function repeatNote(repeat) {
  switch (repeat) {
    case 'untilDone': return 'Every day until you tick it off';
    case 'daily': return 'Every day';
    case 'weekly': return 'Every week';
    case 'monthly': return 'Every month';
    case 'yearly': return 'Every year';
    default: return '';
  }
}

/** The same thing, as the sentence under the chips when one is chosen. */
export function repeatBlurb(repeat) {
  switch (repeat) {
    case 'none': return 'It sits on this day, and this day only.';
    case 'untilDone': return 'It comes back every day until you tick it off, and then it stops.';
    default: return `${repeatNote(repeat)} — each one ticked off on its own day.`;
  }
}

/**
 * The to-do, ticked or un-ticked on a given day.
 *
 * Which day is not a detail. A repeat is ticked per day, and an until-done
 * to-do has to remember where it was finished — otherwise ticking Thursday's
 * shopping off while looking at Thursday would take it off Thursday, which is
 * the one day it belonged on.
 */
export function tickTodo(todo, dayKey, next) {
  const on = dayKey ?? dateKey(new Date());
  const done = next === undefined ? !todoDoneOn(todo, on) : Boolean(next);

  if (isRepeating(todo)) {
    const days = todo.doneDays ?? [];
    return { ...todo, doneDays: done ? [...new Set([...days, on])] : days.filter((d) => d !== on) };
  }
  return { ...todo, done, doneOn: done ? on : null };
}
