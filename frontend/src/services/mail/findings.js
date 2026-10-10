/**
 * Turning what the model said about an email into what Pulse can act on.
 *
 * Kept apart from ai.js for the same reason store.js is kept apart from
 * useMail.js: ai.js reaches the backend client, which reads `import.meta.env`
 * and so cannot be imported outside Vite — and this is the half worth testing.
 * It is where a model's answer becomes a date, a time and a row with a button
 * on it, and every one of those conversions has a way of being wrong that no
 * amount of reading the code reveals.
 *
 * Pure functions over plain objects. No fetch, no React, no prompts.
 */

import { anHourAfter, resolveDate, resolveTime } from './dates.js';

/**
 * The calendar arithmetic, done here rather than by the model.
 *
 * `sentAt` is the email's own date, so "Thursday" in a message sent on Tuesday
 * means that Thursday however long ago it was read. The phrase is kept beside
 * the date as `dateFrom`, so the review card can show WHY it says the 9th —
 * from "end of day Friday" — and a misreading is visible as one.
 *
 * @param {object} item one finding, as the model returned it
 * @param {{ date?: string }} [message] the email it came out of
 */
export function datesOf(item, message) {
  const at = { sentAt: message?.date };
  const out = {};

  if (item?.dateText) {
    const resolved = resolveDate(item.dateText, at);
    if (resolved) out.due = resolved;
    // Kept even when nothing resolved: "ASAP" is worth showing as the reason
    // there is no date, rather than leaving the field blank and unexplained.
    out.dateFrom = item.dateText;
  }

  if (item?.startText) out.start = resolveTime(item.startText);
  if (item?.endText) out.end = resolveTime(item.endText);
  // A start and no end is an hour, which is what a calendar would assume too.
  if (out.start && !out.end) out.end = anHourAfter(out.start);

  /*
   * All-day is worked out rather than taken on trust. A model that gives a time
   * and then says `allDay: true` has contradicted itself, and the time is the
   * more reliable half — it was quoting the email. Where there is a date and no
   * time at all, all-day is the right default: an email saying "the deadline is
   * 3 November" means the day, not nine in the morning.
   */
  if (out.start) out.allDay = false;
  else if (out.due) out.allDay = true;

  return out;
}

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Every finding with its dates resolved, and the empty ones dropped.
 *
 * A model asked for a list will sometimes return one entry of nothing rather
 * than an empty list — `{ title: '' }`, or a task that is only a confidence
 * score. Those are filtered here, because a row with no words in it is worse
 * than a section that is not there.
 */
export function dress(found, message) {
  return {
    summary: found?.summary ?? '',
    replyNeeded: Boolean(found?.replyNeeded),
    replyWhy: found?.replyWhy ?? '',
    events: list(found?.events)
      .filter((event) => event?.title?.trim())
      .map((event) => ({ ...event, ...datesOf(event, message) })),
    tasks: list(found?.tasks)
      .filter((task) => task?.title?.trim())
      .map((task) => ({ ...task, ...datesOf(task, message) })),
    deadlines: list(found?.deadlines)
      .filter((deadline) => deadline?.what?.trim())
      .map((deadline) => ({ ...deadline, ...datesOf(deadline, message) })),
    people: list(found?.people).filter((person) => person?.name?.trim()),
  };
}

/** True when there is nothing in an email to diarise or do. */
export const nothingFound = (found) =>
  !found?.events?.length && !found?.tasks?.length && !found?.deadlines?.length;

/**
 * Where a proposal came from, in a shape the review card can render.
 *
 * `from` has to be a STRING here. It used to be handed `message.from`, which is
 * `{ name, email }` — and the card renders it straight into a line of text, so
 * React threw "Objects are not valid as a React child" and the card never
 * appeared at all. Every "create task" and "add to calendar" died there, which
 * is most of what the assistant was for.
 */
export const sourceOf = (message) => ({
  messageId: message?.id,
  accountId: message?.accountId,
  subject: message?.subject ?? '',
  from: message?.from?.name || message?.from?.email || '',
});
