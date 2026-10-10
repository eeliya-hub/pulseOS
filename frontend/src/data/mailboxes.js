import {
  AlertCircle,
  Archive,
  BadgeCheck,
  Bookmark,
  CalendarClock,
  FileText,
  Inbox,
  Megaphone,
  Paperclip,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';

/**
 * How mail is presented, on the frontend's side of the line.
 *
 * The ids here are the backend's canonical ones (services/mail/mailboxes.js) —
 * this file only adds what the interface needs: an icon, and the order the
 * sidebar reads in. Which of them a given account actually offers comes from
 * that account's `capabilities`, never from this list, so connecting only
 * Outlook does not show Gmail's categories.
 */
export const MAILBOXES = [
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
  { id: 'starred', label: 'Starred', Icon: Star },
  { id: 'important', label: 'Important', Icon: Bookmark },
  { id: 'drafts', label: 'Drafts', Icon: FileText },
  { id: 'sent', label: 'Sent', Icon: Send },
  { id: 'archive', label: 'Archive', Icon: Archive },
  { id: 'spam', label: 'Spam', Icon: ShieldAlert },
  { id: 'trash', label: 'Trash', Icon: Trash2 },
];

/** Gmail's sorting of the inbox. A view OF the inbox, not another mailbox. */
export const CATEGORIES = [
  { id: 'primary', label: 'Primary', Icon: Inbox },
  { id: 'social', label: 'Social', Icon: Users },
  { id: 'promotions', label: 'Promotions', Icon: Megaphone },
  { id: 'updates', label: 'Updates', Icon: BadgeCheck },
];

export const mailboxMeta = (id) =>
  MAILBOXES.find((m) => m.id === id) ?? CATEGORIES.find((c) => c.id === id) ?? { id, label: id, Icon: Tag };

/**
 * Each provider's mark: its written name and one colour.
 *
 * A colour rather than a logo, for the same reason the calendar tints its
 * sources — a 16px brand mark in a dense list is noise, while a single dot
 * answers "which account is this?" at a glance. Mirrors SOURCE_META in
 * useCalendarEvents.
 */
export const PROVIDER_META = {
  google: { label: 'Gmail', color: '#EA4335' },
  microsoft: { label: 'Outlook', color: '#0A84FF' },
  yahoo: { label: 'Yahoo Mail', color: '#7B5BD6' },
};

export const providerMeta = (id) => PROVIDER_META[id] ?? { label: id ?? 'Mail', color: '#8c93a8' };

/**
 * What triage found, as something to show.
 *
 * Deliberately hedged wording — "looks like a deadline", not "deadline". The
 * signals come from reading the subject and the preview line, which is right
 * often enough to be useful and wrong often enough that the interface should
 * not claim certainty.
 */
export const SIGNAL_META = {
  deadline: { label: 'Deadline', hint: 'Looks like something is due', Icon: CalendarClock, tone: '#FF9F0A' },
  asks: { label: 'Needs a reply', hint: 'Looks like it asks you for something', Icon: AlertCircle, tone: '#FF6B57' },
  meeting: { label: 'Meeting', hint: 'Mentions a time and a place', Icon: CalendarClock, tone: '#30D158' },
  important: { label: 'Important', hint: 'Your provider marked this important', Icon: Bookmark, tone: '#BF5AF2' },
  starred: { label: 'Starred', hint: 'You starred this', Icon: Star, tone: '#FFD60A' },
  question: { label: 'Question', hint: 'Asks you something', Icon: AlertCircle, tone: '#64D2FF' },
  attachment: { label: 'Attachment', hint: 'Has a file attached', Icon: Paperclip, tone: '#8c93a8' },
  // Shown nowhere prominent on purpose: bulk mail is what the signals exist to
  // push DOWN, so saying so on the row would give it the attention back.
  bulk: null,
};

/** The signals worth showing on a row, in a fixed order so rows stay scannable. */
const SIGNAL_ORDER = ['asks', 'deadline', 'meeting', 'important', 'question'];

export function visibleSignals(triage, { limit = 2 } = {}) {
  if (!triage?.signals?.length) return [];
  return SIGNAL_ORDER.filter((id) => triage.signals.includes(id))
    .map((id) => ({ id, ...SIGNAL_META[id] }))
    .filter((s) => s.label)
    .slice(0, limit);
}

/**
 * The Life Hub's one line about the inbox.
 *
 * Reads as a person would say it, and leaves out anything that is zero rather
 * than reciting "0 deadlines" — a card that lists what is NOT there is noise.
 */
export function summaryLine(summary) {
  if (!summary?.connected) return null;
  const parts = [];
  if (summary.important) parts.push(`${summary.important} ${summary.important === 1 ? 'looks' : 'look'} important`);
  if (summary.needsAction) parts.push(`${summary.needsAction} ${summary.needsAction === 1 ? 'needs' : 'need'} a reply`);
  if (summary.deadlines) parts.push(`${summary.deadlines} ${summary.deadlines === 1 ? 'mentions' : 'mention'} a deadline`);
  if (summary.meetings) parts.push(`${summary.meetings} ${summary.meetings === 1 ? 'mentions' : 'mention'} a meeting`);
  if (!parts.length) {
    if (summary.unread) return 'Nothing in it looks urgent';
    return summary.recent ? `${summary.recent} arrived today` : 'Nothing new';
  }
  return parts.slice(0, 2).join(' · ');
}
