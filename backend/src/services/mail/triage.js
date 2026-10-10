/**
 * Reading the shape of a message without asking a model.
 *
 * The Life Hub card has to be able to say "8 unread, 2 look important, one has
 * a deadline and one wants something from you" the instant the view paints. A
 * model could judge that better, but not for free and not in time: it would be
 * one call per message, on a provider budget measured in a couple of hundred
 * requests a day, before the user has asked for anything.
 *
 * So the cheap, deterministic pass happens here on headers and the preview line,
 * and the assistant is spent on the deep work — summarising, extracting, drafting
 * — when the user actually asks for it. The two are complementary: these signals
 * are also what tell the AI which messages are worth reading in full.
 *
 * Nothing here is shown as a certainty. The UI says "looks like" and the card
 * counts, never "this is a deadline".
 */

// Someone wants the user to do something.
const REQUEST = [
  /\b(?:could|can|would)\s+you\b/i,
  /\bplease\s+(?:send|share|provide|confirm|complete|review|sign|submit|reply|respond|fill|return|let me know)\b/i,
  /\b(?:action\s+required|response\s+required|awaiting\s+your|needs?\s+your\s+(?:approval|signature|attention|input|response))\b/i,
  /\b(?:rsvp|please\s+rsvp)\b/i,
  /\bcan\s+you\s+(?:get|send|have|do|make)\b/i,
  /\b(?:let me know|get back to me|waiting (?:to hear )?(?:from|on) you)\b/i,
  /\b(?:sign|complete|submit|upload|return)\s+(?:the|this|your)\b/i,
];

// Something is due.
const DEADLINE = [
  /\b(?:deadline|due\s+(?:date|by|on)|due:)\b/i,
  /\bby\s+(?:this\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  /\bby\s+(?:tomorrow|today|tonight|the\s+end\s+of\s+(?:the\s+)?(?:day|week|month))\b/i,
  /\bby\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /\b(?:expires?|closing|closes)\s+(?:on\s+)?\d/i,
  /\bno\s+later\s+than\b/i,
  /\bbefore\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
  /\blast\s+(?:chance|day)\b/i,
  /\bwithin\s+\d+\s+(?:hours?|days?|weeks?)\b/i,
];

// Something to put in the calendar.
const MEETING = [
  /\b(?:meeting|meet|call|catch\s?up|interview|appointment|seminar|lecture|workshop|webinar|standup|one[-\s]?to[-\s]?one|1:1)\b/i,
  /\b(?:invitation|invite|calendar\s+invite|teams\s+meeting|zoom|google\s+meet|conference\s+call)\b/i,
  /\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\s+at\b/i,
  /\breschedul|\bpostpone/i,
];

// Bulk mail. Present in enormous volume and almost never about the user, so it
// has to be pushed down or every marketing "last chance!" becomes a deadline.
const BULK = [
  /\bunsubscribe\b/i,
  /\bview\s+(?:this|in)\s+(?:email\s+)?(?:in\s+)?(?:your\s+)?browser\b/i,
  /\b(?:newsletter|promotion|%\s*off|sale\s+(?:ends|now)|shop\s+now|limited\s+time\s+offer)\b/i,
  /\bmanage\s+(?:your\s+)?(?:preferences|subscription)\b/i,
];

const BULK_SENDER = /^(?:no-?reply|do-?not-?reply|noreply|donotreply|notifications?|news|newsletter|info|updates?|marketing|promo|hello|support|team|mailer|bounce|alerts?)[@+.]/i;

const ANY = (patterns, text) => patterns.some((re) => re.test(text));

/**
 * Judge one message from what a listing already carries — sender, subject and
 * preview. No body fetch, so this is free to run over a whole page.
 *
 * @param {object} msg a canonical message
 * @param {string[]} [ownAddresses] the user's own addresses, to tell "to me"
 *   from "cc'd on a thread of forty people"
 */
export function triage(msg, ownAddresses = []) {
  const subject = msg.subject ?? '';
  const preview = msg.snippet ?? '';
  const text = `${subject}\n${preview}`;
  const senderAddress = (msg.from?.email ?? '').toLowerCase();

  const mine = new Set(ownAddresses.map((a) => String(a).toLowerCase()));
  const addressedTo = (msg.to ?? []).some((p) => mine.has((p.email ?? '').toLowerCase()));
  const onlyRecipient = (msg.to ?? []).length === 1 && addressedTo;
  const ccOnly = !addressedTo && (msg.cc ?? []).some((p) => mine.has((p.email ?? '').toLowerCase()));

  const bulk = ANY(BULK, text) || BULK_SENDER.test(senderAddress);
  const asksSomething = ANY(REQUEST, text);
  const hasDeadline = ANY(DEADLINE, text);
  const meeting = ANY(MEETING, text);
  // A question mark in a subject or preview from a person, not a mailing list.
  const question = /\?/.test(text) && !bulk;

  const signals = [];
  let score = 0;

  if (msg.unread) score += 2;
  if (msg.important) {
    score += 3;
    signals.push('important');
  }
  if (msg.starred) {
    score += 2;
    signals.push('starred');
  }
  if (onlyRecipient) score += 3;
  else if (addressedTo) score += 2;
  else if (ccOnly) score -= 1;

  if (asksSomething) {
    score += 4;
    signals.push('asks');
  }
  if (hasDeadline) {
    score += 4;
    signals.push('deadline');
  }
  if (meeting) {
    score += 2;
    signals.push('meeting');
  }
  if (question) {
    score += 1;
    signals.push('question');
  }
  if (msg.hasAttachments) score += 1;
  // Promotions and Updates are Gmail saying this is not personal correspondence.
  if ((msg.categories ?? []).some((c) => c === 'promotions' || c === 'updates')) score -= 3;
  if (bulk) {
    score -= 5;
    signals.push('bulk');
  }

  // Fresh mail outranks old mail of the same kind.
  const ageHours = msg.date ? (Date.now() - new Date(msg.date).getTime()) / 3_600_000 : 999;
  if (ageHours < 6) score += 2;
  else if (ageHours < 24) score += 1;
  else if (ageHours > 24 * 14) score -= 1;

  /*
   * "Needs action" is deliberately strict. A card that says four messages want
   * something from you, when two of them are a newsletter and a receipt, is
   * worse than one that says nothing — so it takes a real request or a real
   * deadline, aimed at this user, from something that is not bulk mail.
   */
  const needsAction = !bulk && (asksSomething || hasDeadline) && (addressedTo || ccOnly || mine.size === 0);

  return {
    score,
    signals,
    needsAction,
    hasDeadline: hasDeadline && !bulk,
    meeting: meeting && !bulk,
    bulk,
    addressedTo,
  };
}

/** Attach triage to every message in a list, newest-first order preserved. */
export const triaged = (messages = [], ownAddresses = []) =>
  messages.map((m) => ({ ...m, triage: triage(m, ownAddresses) }));

/** The few that most deserve the user's attention, highest score first. */
export function priority(messages = [], ownAddresses = [], count = 5) {
  return triaged(messages, ownAddresses)
    .filter((m) => !m.triage.bulk)
    .sort((a, b) => b.triage.score - a.triage.score || new Date(b.date) - new Date(a.date))
    .slice(0, count);
}
