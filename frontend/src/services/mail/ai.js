import { api } from '../api/backendClient.js';
import { getSettings } from '../../hooks/useSettings.js';
import { buildAiInstructions } from '../ai/instructions.js';
import { datesOf, dress, sourceOf } from './findings.js';

// Re-exported so a view needs one import for everything mail's AI offers.
export { sourceOf };

/**
 * What Pulse can do with an email.
 *
 * Every call here goes through the SAME `/api/ai/chat` the assistant uses, so
 * mail inherits the provider choice, the rate limit and — the part that matters
 * — the persisted spend cap. There is no second AI path and no second budget.
 *
 * These are one-shot calls with `tools: false`, deliberately. The agent loop is
 * for a conversation where the model decides what to read; this is the user
 * pointing at something on screen and asking about that. Giving the model tools
 * here would let it wander off and act, which is exactly what the review step
 * downstream exists to prevent.
 *
 * Context never comes from this file. It is fetched from `/api/mail/context`,
 * which caps every scope — so there is no way for a prompt built here to carry
 * a mailbox into a request.
 *
 * ── Two things learned the hard way ──────────────────────────────────────────
 *
 * 1. `maxTokens` is the budget for the model's THINKING and its answer
 *    together. Every structured call here used to ask for 700, which a real
 *    email spent entirely on reasoning before stopping mid-string — so the JSON
 *    never closed, never parsed, and the feature reported "Pulse could not read
 *    anything definite out of that" every single time. The fix is both halves
 *    of `thinking` + `json` below: bounded deliberation, and a schema that
 *    makes the answer machine-readable instead of prose to be scraped.
 *
 * 2. A model asked for a calendar date from "Thursday's design review" gets it
 *    wrong, and inconsistently wrong. So it is not asked. It copies the email's
 *    own words into `dateText` and `dates.js` does the calendar arithmetic in
 *    code that has tests. See the note at the top of that file.
 */

const CONFIDENCE = { type: 'string', enum: ['high', 'medium', 'low'] };

const ask = async ({ system, prompt, maxTokens = 1400, thinking = 'low', json }) => {
  const settings = getSettings();
  const res = await api.ai.chat({
    prompt,
    system,
    tools: false,
    userName: settings.name,
    instructions: buildAiInstructions(settings),
    maxTokens,
    thinking,
    json,
  });
  return (res.text ?? '').trim();
};

/**
 * The today/date framing every prompt needs.
 *
 * A function, not a constant. It used to be folded into a module-level string,
 * which froze "today" at the moment the page loaded — and Pulse is a dashboard
 * that stays open for days, so by Thursday it was telling the model it was
 * Monday.
 */
function when() {
  const now = new Date();
  return [
    `Today is ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${now
      .toISOString()
      .slice(0, 10)}), and the time is ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}.`,
  ].join(' ');
}

/** How a date must be reported: in the email's words, never as a calculation. */
const DATE_RULE = [
  'For anything with a date, copy the words the EMAIL ITSELF uses into the `…Text` field — "Thursday", "end of day Friday", "3 November", "next week".',
  'Do NOT work out the calendar date, and do not convert it: Pulse does that part. Quote, do not calculate.',
  'Same for times: "2:30pm" or "14:30" exactly as written.',
  'Where there is genuinely no date in the words, leave the field out rather than inventing one.',
].join('\n');

const reader = () =>
  [
    'You are Pulse, reading one email on behalf of the person who received it.',
    'Work only from the email you are given. Never invent a detail that is not in it — no times, no names, no amounts.',
    'If something is unclear or missing, say so plainly rather than guessing.',
    when(),
  ].join('\n');

/** The email as text for a prompt, bounded by the backend before it gets here. */
const asText = (context) => {
  const m = context.message ?? context.messages?.[context.messages.length - 1];
  if (!m) return '';
  const thread =
    context.messages?.length > 1
      ? `\n\nEarlier in this conversation:\n${context.messages
          .slice(0, -1)
          .map((prev) => `--- From ${prev.from} on ${prev.date}\n${prev.body}`)
          .join('\n')}`
      : '';
  return [
    `From: ${m.from}`,
    `To: ${m.to}`,
    m.cc ? `Cc: ${m.cc}` : null,
    `Date: ${m.date}`,
    `Subject: ${m.subject}`,
    m.attachments?.length ? `Attachments: ${m.attachments.join(', ')}` : null,
    '',
    m.body,
    m.truncated ? '\n[the rest of this message was too long to include]' : '',
    thread,
  ]
    .filter((line) => line !== null)
    .join('\n');
};

/** Fetch the bounded context for a message, optionally its whole thread. */
export const contextFor = (message, scope = 'message') =>
  api.mail.context({ scope, accountId: message.accountId, messageId: message.id, threadId: message.threadId });

/* ── What's in this email ──────────────────────────────────────────────────── */

const DATED = { dateText: { type: 'string' }, confidence: CONFIDENCE, note: { type: 'string' } };

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    events: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          ...DATED,
          startText: { type: 'string' },
          endText: { type: 'string' },
          allDay: { type: 'boolean' },
          location: { type: 'string' },
          participants: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'dateText', 'confidence'],
      },
    },
    tasks: {
      type: 'array',
      maxItems: 6,
      items: { type: 'object', properties: { title: { type: 'string' }, ...DATED }, required: ['title', 'confidence'] },
    },
    deadlines: {
      type: 'array',
      maxItems: 6,
      items: { type: 'object', properties: { what: { type: 'string' }, ...DATED }, required: ['what', 'dateText'] },
    },
    people: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } },
        required: ['name'],
      },
    },
    replyNeeded: { type: 'boolean' },
    replyWhy: { type: 'string' },
  },
  required: ['summary', 'events', 'tasks', 'replyNeeded'],
};

export const mailAI = {
  /**
   * Everything in one email that belongs somewhere else — the meetings, the
   * things to do, the dates to know about, who is involved.
   *
   * One call rather than one per question, because the model has to read the
   * whole email either way and asking four times costs four times as much for
   * the same reading. What comes back is a set of PROPOSALS: each one is handed
   * to the review card before anything is written.
   */
  async findings(message, { thread = false } = {}) {
    const context = await contextFor(message, thread ? 'thread' : 'message');
    const raw = await ask({
      system: [reader(), DATE_RULE, 'Report only what is really there. An email with nothing to do and no dates has empty lists, and that is a good answer.'].join('\n'),
      prompt: [
        'Read this email and pick out:',
        '· events — anything that belongs in a diary: a meeting, a call, an appointment, something with a time and a place.',
        '· tasks — anything the reader has to DO. Phrase each in the imperative ("Send the Q4 deck to Priya"), not as a description.',
        '· deadlines — dates to be aware of that are not themselves a task.',
        '· people — who is involved and what their part in it is. Skip the reader themselves.',
        '· whether it needs a reply, and in one short clause why.',
        'The summary is ONE sentence on what the email is actually about.',
        /*
         * A newsletter or a job alert lists dozens of things, and a model asked
         * to pick out "anything to do" tried to return all of them — which
         * overran the answer budget and arrived truncated and unparseable. Four
         * of each is more than any real email has for one person anyway.
         */
        'At most four of each, and only things that matter to the reader personally. Bulk mail that lists many things is not a list of tasks: if there is nothing addressed to them, every list is empty.',
        '',
        asText(context),
      ].join('\n'),
      json: FINDINGS_SCHEMA,
      maxTokens: 2000,
    });

    const parsed = parseJson(raw);
    if (!parsed) throw new Error('Pulse couldn’t make anything of that one.');
    return dress(parsed, message);
  },

  /** A few lines on what this email says. */
  async summarise(message, { thread = false } = {}) {
    const context = await contextFor(message, thread ? 'thread' : 'message');
    return ask({
      system: reader(),
      prompt: [
        'Summarise this email in at most four short sentences. Lead with what it is actually about.',
        'If it asks the reader for anything, say what, and by when if a date is given.',
        'Plain prose, no headings, no bullet points.',
        '',
        asText(context),
      ].join('\n'),
      maxTokens: 1200,
    });
  },

  /** The same email, explained for someone who found it hard going. */
  async explain(message, selection = null) {
    const context = await contextFor(message, 'message');
    return ask({
      system: reader(),
      prompt: [
        selection
          ? 'Explain the highlighted part of this email in simple, direct language. Say what it means and what, if anything, it asks of the reader.'
          : 'Explain this email in simple, direct language, as if to someone who finds formal email hard going. Say what it means and what it wants.',
        'Avoid jargon. Keep it short. No headings or bullet points.',
        selection ? `\nThe highlighted part:\n"""${selection}"""` : '',
        '',
        `The whole email, for context:\n${asText(context)}`,
      ].join('\n'),
      maxTokens: 1200,
    });
  },

  /**
   * Turn an email — or a highlighted line of one — into something proposed for
   * the user's day.
   *
   * Returns a PROPOSAL, never a change. Whatever comes back is shown in a card
   * the user edits and confirms; nothing here writes to the calendar, the task
   * list or a project. That is the rule from the brief, and it is enforced by
   * this function having no way to do it.
   *
   * @param {'task'|'event'|'project'} kind
   */
  async propose(kind, message, { selection = null, projects = [] } = {}) {
    const context = await contextFor(message, 'message');
    const shape = PROPOSAL_SHAPE[kind];
    if (!shape) throw new Error(`Pulse cannot propose a "${kind}".`);

    const raw = await ask({
      system: [
        reader(),
        DATE_RULE,
        'Every field you are not confident about must be left out rather than guessed.',
        '`confidence` is "high" when the email states it outright, "medium" when it is strongly implied, "low" when you are reading between the lines.',
        '`note` is one short sentence naming what you were unsure about.',
      ].join('\n'),
      prompt: [
        shape.instruction,
        kind === 'project' && projects.length
          ? `The reader's existing projects are: ${projects.map((p) => p.name).join(', ')}. Prefer one of these in \`project\` when it fits; leave it out if none does.`
          : '',
        '',
        selection ? `The reader highlighted this part — it is what they are asking about:\n"""${selection}"""\n` : '',
        `The email:\n${asText(context)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      json: shape.schema,
      maxTokens: 1400,
    });

    const parsed = parseJson(raw);
    if (!parsed) throw new Error('Pulse could not read anything definite out of that.');
    const dated = datesOf(parsed, message);
    return { kind, ...parsed, ...dated, source: sourceOf(message) };
  },

  /**
   * Write or rework the body of a message.
   *
   * Returns text for the composer to show. It cannot send: `mail.send` is
   * reached from the Send button alone, and nothing in this file calls it.
   */
  async write({ kind, text, subject, draft, instruction }) {
    const replying = draft?.replyToMessageId || draft?.threadId;
    let quoted = '';
    if (replying && draft?.replyToMessageId) {
      try {
        const context = await api.mail.context({
          scope: 'thread',
          accountId: draft.accountId,
          messageId: draft.replyToMessageId,
        });
        quoted = asText(context);
      } catch {
        // Worth continuing without: a reply Pulse writes blind is still useful,
        // and failing the whole rewrite because the thread could not be read
        // would be worse than a slightly less informed draft.
      }
    }

    const brief = kind === 'prompt' ? null : WRITE_BRIEF[kind];
    if (!brief && kind !== 'prompt') throw new Error(`Pulse cannot do "${kind}".`);
    if (kind === 'prompt' && !instruction?.trim()) throw new Error('Tell Pulse what to write first.');

    const body = await ask({
      system: [
        'You are Pulse, helping the person who uses this computer write an email in their own voice.',
        'Reply with the body of the email and nothing else — no subject line, no "Here is your email", no commentary, no quotation marks around it.',
        'Match the length the instruction asks for. Keep their meaning exactly; never invent a commitment, a date or a fact they did not give you.',
        'Where only they can supply something, leave an obvious gap in square brackets rather than deciding for them.',
        'Sign off the way they would, or not at all if there is nothing to go on.',
        when(),
      ].join('\n'),
      prompt: [
        kind === 'prompt'
          ? `Write the email they have asked for. What they said they want:\n"""${instruction.trim()}"""`
          : brief,
        subject ? `\nThe subject is: ${subject}` : '',
        text
          ? `\nWhat they have written so far${kind === 'prompt' ? ' — keep what still applies' : ' (this is the thing to work on)'}:\n"""${text}"""`
          : '',
        quoted ? `\nThey are replying to this. Use it to get the facts and the tone right, but do not quote it back:\n${quoted}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: 2000,
    });

    return { text: unfence(body) };
  },

  /** A reply drafted from the thread, for the "Draft a reply" action. */
  async draftReply(message, { gist = '' } = {}) {
    const context = await contextFor(message, 'thread');
    const body = await ask({
      system: [
        'You are Pulse, drafting a reply for the person who received this email, in their voice.',
        'Reply with the body of the email only — no subject, no preamble, no quoted history.',
        'Answer what was actually asked. Never commit them to anything they have not said yes to, and never invent a date or a fact.',
        when(),
      ].join('\n'),
      prompt: [
        gist
          ? `They want the reply to say, in substance: "${gist}". Put that properly, in a few sentences.`
          : 'Draft a short, courteous reply that answers what this email asks. If it asks something only they can answer, leave an obvious gap in square brackets rather than deciding for them.',
        '',
        asText(context),
      ].join('\n'),
      maxTokens: 1600,
    });
    return unfence(body);
  },
};

const PROPOSAL_SHAPE = {
  task: {
    instruction:
      'Work out the one thing the reader has to DO because of this email, and put it as a task in the imperative — "Send the final report", not "The report needs sending". If a date is given or implied for when it is due, quote the words it uses.',
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, ...DATED, notes: { type: 'string' } },
      required: ['title', 'confidence'],
    },
  },
  event: {
    instruction:
      'Work out whether this email describes something that belongs in a calendar — a meeting, an appointment, a deadline with a time. If it does, give its details. If there is no date at all, leave `title` out.',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ...DATED,
        startText: { type: 'string' },
        endText: { type: 'string' },
        allDay: { type: 'boolean' },
        location: { type: 'string' },
        participants: { type: 'array', items: { type: 'string' } },
      },
      required: ['confidence'],
    },
  },
  project: {
    instruction:
      'Work out the thing the reader has to do because of this email, and which of their projects it belongs to. Give the task in the imperative and quote the words used for any due date.',
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, project: { type: 'string' }, ...DATED },
      required: ['title', 'confidence'],
    },
  },
};

const WRITE_BRIEF = {
  improve: 'Rewrite what they have written so it reads well: clear, natural and correctly punctuated. Keep the length and the meaning.',
  professional: 'Rewrite what they have written in a professional register — courteous, measured, no slang — without turning it stiff or much longer.',
  friendly: 'Rewrite what they have written so it sounds warm and human, as if to a colleague they get on with. Keep it brief.',
  concise: 'Cut what they have written to its essentials. Keep every fact and every request; lose the padding. Shorter than the original.',
  expand: 'They have written the gist. Turn it into a proper email — a greeting, the substance properly put, a sign-off. Still brief.',
  grammar: 'Fix only the spelling, grammar and punctuation. Keep their words, their tone and their line breaks exactly as they are otherwise.',
  'draft-reply':
    'Draft a reply that answers what the email asks. If they have written a gist, that is what the reply should say — put it properly.',
};

/** A model that fenced its answer anyway, unfenced. */
const unfence = (text) => String(text ?? '').replace(/^```[a-z]*\n?|\n?```$/g, '').trim();

/**
 * Read the JSON out of a model's answer.
 *
 * With a schema the answer is already JSON, so this is normally one parse. It
 * stays because the schema is Gemini's: on OpenAI or Claude the answer comes
 * back as prose that may be fenced or prefixed, and taking the first `{` to the
 * last `}` survives both. A null return is handled by the caller as "nothing
 * definite found" rather than as a crash.
 */
function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* not already clean — fall through to finding it in the prose */
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
