import { emptyCard, emptyProject, uid } from './board.js';

/**
 * The Pulse OS board, as it actually happened.
 *
 * The seed used to be four cards demonstrating that cards exist. This is the
 * project's own history instead — three months of it, from the first commit in
 * July to this week — and then everything it is in the middle of and everything
 * it might be next. It is the board doing the thing boards are for, which
 * teaches the view far better than a demonstration of it does.
 *
 * Shipped work carries the date it shipped, because that is a fact and does not
 * move. Everything still to come is dated against the day you read it, so a
 * plan never opens already overdue.
 */

const SHIPPED = 'Shipped';

/** A date `n` days from today, as 'YYYY-MM-DD'. */
function day(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const check = (label, done = true) => ({ id: uid('chk'), label, done });
const said = (text, daysAgo) => ({
  id: uid('cmt'),
  text,
  at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
});

export function pulseProject() {
  const columns = [
    { id: uid('col'), name: 'Ideas' },
    { id: uid('col'), name: 'Up next' },
    { id: uid('col'), name: 'Building' },
    { id: uid('col'), name: SHIPPED, done: true },
  ];
  const [ideas, next, building, shipped] = columns.map((c) => c.id);

  const labels = [
    { id: uid('lab'), name: 'Design', colour: 'violet' },
    { id: uid('lab'), name: 'Backend', colour: 'sky' },
    { id: uid('lab'), name: 'AI', colour: 'mint' },
    { id: uid('lab'), name: 'Bug', colour: 'rose' },
    { id: uid('lab'), name: 'Idea', colour: 'amber' },
    { id: uid('lab'), name: 'Polish', colour: 'slate' },
  ];
  const [design, backend, ai, bug, idea, polish] = labels.map((l) => l.id);

  const cards = [
    /* ── Shipped: three months, newest first ──────────────────────────── */
    emptyCard({
      title: 'Ask Pulse about a board',
      columnId: shipped,
      done: true,
      labels: [ai],
      start: '2026-10-17',
      due: '2026-10-17',
      notes:
        'The assistant reads a board and changes it: what is in each list, what is late, a card added, a card moved — '
        + 'and moving one into the last list ticks it off. A name that fits two cards moves nothing and asks which. '
        + 'And a line highlighted in an email can land on a board as a card, carrying the email it came from.',
      checklist: [check('Read the board'), check('Add and move cards'), check('Say what is overdue'), check('From an email, onto a board')],
    }),
    emptyCard({
      title: 'Schedule: a day that reads at a glance, and to-dos that come back',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-15',
      due: '2026-10-17',
      notes:
        'What is over steps back, what is on now is lit in its own calendar\'s colour, and the month shows up to three '
        + 'events a day at any size, the months either side quieter but still there. Habits went; they were not earning '
        + 'their place. A to-do can come back daily, weekly, monthly or yearly — or every day until it is done.',
      checklist: [
        check('Habits retired'),
        check('Past events step back, in colour'),
        check('On now, lit'),
        check('A frequency on a to-do, Until done among them'),
        check('Three events a day in the month, at any size'),
      ],
    }),
    emptyCard({
      title: 'Timeline bars read badly on a short span',
      columnId: shipped,
      done: true,
      labels: [bug],
      start: '2026-10-17',
      due: '2026-10-17',
      notes:
        'Under about a hundred pixels the title fell out of the bar and ran through the week lines. It sits beside the '
        + 'bar now, on a chip of its own, and a finished bar ends in a dot rather than a line through its name.',
    }),
    emptyCard({
      title: 'Schedule leads with the calendar',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-13',
      due: '2026-10-14',
      notes:
        'The month at the size of a month, instead of one of three equal columns. '
        + 'A cell per day with its events written into it rather than counted under it, '
        + 'six rows always so paging never moves the view, and the day you pick read down the side.',
      checklist: [
        check('A real month grid'),
        check('Events written in the cells, not dotted'),
        check('The day beside it, with its gaps drawn'),
        check('Last month and next drawn in a greyer shade'),
        check('Arrow keys, Home, End, PageUp/Down, and t for today'),
      ],
      comments: [said('Habits came out of this tab. They were never looked at.', 0)],
    }),
    emptyCard({
      title: 'Website icons stopped loading',
      columnId: shipped,
      done: true,
      labels: [bug, backend],
      start: '2026-10-14',
      due: '2026-10-14',
      notes:
        'Three faults in one path. A site that refused to be read was remembered as iconless for '
        + 'twenty-four hours; the probe sent a Range header that WhatsApp answers with a 400; and the '
        + 'ranking believed whatever size the markup claimed, so reddit won with 57 pixels over its own 64.',
      checklist: [
        check('Hold a thin answer for minutes, not a day'),
        check('Probe with a plain GET'),
        check('Measure the PNG instead of believing the markup'),
      ],
    }),
    emptyCard({
      title: 'Mail and Projects become places of their own',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-12',
      due: '2026-10-13',
      notes: 'The Life Hub was four things in a trench coat. Mail took a tab, projects became boards, and what was left became Schedule.',
      checklist: [check('Mail on the bar'), check('Projects, as boards'), check('Life Hub renamed')],
    }),
    emptyCard({
      title: 'Travel: switching trips stops costing a line of the sky',
      columnId: shipped,
      done: true,
      labels: [design, polish],
      start: '2026-10-11',
      due: '2026-10-11',
    }),
    emptyCard({
      title: 'Pulse fills a big screen',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-09',
      due: '2026-10-10',
      notes: 'One root font-size against a 1440×940 frame, so the whole app scales as one thing rather than growing margins.',
    }),
    emptyCard({
      title: 'A site for Pulse OS, not just a page to watch the film on',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-08',
      due: '2026-10-10',
      notes: 'Three tabs: what it is, what changed, what was announced. Every feature foldable, with real screenshots under each.',
      checklist: [
        check('Features, foldable'),
        check('Updates, expandable'),
        check('Announcements carried over from GitHub'),
        check('Screenshots shot from the running app'),
      ],
    }),
    emptyCard({
      title: 'Mail arrives: Gmail, Outlook, and a narrow door for the assistant',
      columnId: shipped,
      done: true,
      labels: [backend, ai],
      start: '2026-10-05',
      due: '2026-10-10',
      notes:
        'Two providers behind one shape, so the view never asks which account it is reading. '
        + 'The assistant gets a deliberately narrow door: it can read, draft and find, and it cannot send.',
      checklist: [
        check('Gmail'),
        check('Outlook, and three Graph quirks on personal accounts'),
        check('Threading'),
        check('Attachments'),
        check('Compose, with a prompt of your own'),
        check('Find the dates and events in a message'),
      ],
      comments: [
        said('Outlook needed `microsoft.graph.fileAttachment/contentId` — the cast is not optional on a personal account.', 4),
      ],
    }),
    emptyCard({
      title: 'Settings, rebuilt as sections',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-08',
      due: '2026-10-10',
    }),
    emptyCard({
      title: 'The launch film and the ad',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-10-03',
      due: '2026-10-07',
      notes: 'Remotion, a real soundtrack, and a voiceover left uncut. On-beat zooms, title cards, and room to breathe.',
      checklist: [check('Film'), check('Thirty-second ad'), check('A page to watch them on')],
    }),
    emptyCard({
      title: 'Pulse OS is an application',
      columnId: shipped,
      done: true,
      labels: [backend],
      start: '2026-09-28',
      due: '2026-10-01',
      notes: 'Electron, with the backend started beside it. Music plays, the map draws, and the whole thing opens from the dock.',
      checklist: [check('Desktop shell'), check('Music in the built app'), check('The trip map in the built app')],
    }),
    emptyCard({
      title: 'Carry your setup from one Pulse to another',
      columnId: shipped,
      done: true,
      labels: [backend],
      start: '2026-09-30',
      due: '2026-10-01',
      notes: 'One file with your trips, to-dos, launchpad, folders, conversations, background and every setting. Connected accounts stay behind on purpose.',
    }),
    emptyCard({
      title: 'Launchpad: a shelf you edit, in folders, with any icon you like',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-09-29',
      due: '2026-09-30',
      notes:
        'Ten days of it in one card, because it was ten days of the same thing: making a grid of icons feel like a grid of icons. '
        + 'One body size for every tile, a background per icon, folders that keep things, and a drag that lands where you let go.',
      checklist: [
        check('One list, edited where it stands'),
        check('Folders, orderable'),
        check('Name things what you call them'),
        check('Any icon, including .icns'),
        check('Browser apps count as apps'),
        check('Notice what gets installed while it is open'),
      ],
    }),
    emptyCard({
      title: 'Sport: every tab yields, every team has a crest',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-09-28',
      due: '2026-09-30',
      notes: 'One stage, lit by the place the match is played. Airline crests, the shape of the track, and a race result worth reading.',
    }),
    emptyCard({
      title: 'Markets: a tape that never runs out',
      columnId: shipped,
      done: true,
      labels: [backend, design],
      start: '2026-09-29',
      due: '2026-09-29',
      notes: 'The tape is yours to set — equities and coins both, priced as what they are.',
    }),
    emptyCard({
      title: 'iOS: a SwiftUI shell against the live backend',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-09-23',
      due: '2026-09-24',
      notes: 'Every section, on a phone, highlighting what the desktop highlights. Tabs rather than one long scroll.',
      checklist: [check('Home'), check('Every section against sample data'), check('Music, opening a playlist in the panel Recent uses')],
    }),
    emptyCard({
      title: 'The immersive player, rebuilt around the song as a horizon',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-09-21',
      due: '2026-09-22',
      notes:
        'The record set on the horizon like a sun, with three visuals driven by the track\'s real tempo rather than by a timer. '
        + 'The light in the rule is the sleeve\'s own colours.',
      checklist: [
        check('The record on the horizon'),
        check('Three reactive visuals, on the real tempo'),
        check('A light in the rule'),
        check('Lyrics, sized how you like them'),
      ],
      comments: [said('If it is called immersive it has to move. A still picture of a record is a picture.', 23)],
    }),
    emptyCard({
      title: 'Afterglow: rebuild the frontend around sky, horizon and ground',
      columnId: shipped,
      done: true,
      labels: [design],
      start: '2026-09-15',
      due: '2026-09-21',
      notes:
        'The whole second version. A sky that follows the hour, one horizon landing on the same line in every tab, '
        + 'and a ground that runs the full width of the window instead of a page of floating cards.',
      checklist: [
        check('The sky, by time of day'),
        check('One horizon across every tab'),
        check('Newsreader and Schibsted Grotesk'),
        check('Pills, not buttons'),
        check('Every view in one viewport'),
      ],
    }),
    emptyCard({
      title: 'Travel trips, live web search, and the first immersive player',
      columnId: shipped,
      done: true,
      labels: [backend, ai],
      start: '2026-07-28',
      due: '2026-08-04',
    }),
    emptyCard({
      title: 'First light: the dashboard exists',
      columnId: shipped,
      done: true,
      labels: [backend],
      start: '2026-07-16',
      due: '2026-07-16',
      notes: 'A clock, the weather, and somewhere to put everything else. Everything above this card came after it.',
    }),

    /* ── Building ─────────────────────────────────────────────────────── */
    emptyCard({
      title: 'Projects, as boards',
      columnId: building,
      labels: [design],
      start: day(-2),
      due: day(4),
      notes:
        'Board, timeline and table over one set of cards. Drag between lanes, the last lane ticks things off, '
        + 'and the filter says how many it is hiding rather than quietly hiding them.',
      checklist: [
        check('Board, with a drag that lands where you let go'),
        check('Timeline'),
        check('Table, with the dates editable where they stand'),
        check('Card detail: checklist, notes, comments'),
        check('Labels you can name and colour'),
        check('Saved filters', false),
        check('Archive, rather than delete', false),
      ],
      comments: [said('Trello, but it belongs to this app and lives in this browser.', 1)],
    }),
    emptyCard({
      title: 'Spotify is still in development mode',
      columnId: building,
      labels: [bug, backend],
      due: day(9),
      notes:
        'Playlist track reads and several data endpoints come back 403 until the app is taken out of development mode. '
        + 'Nothing in the code to fix — it is a form, and then a wait.',
    }),

    /* ── Up next ──────────────────────────────────────────────────────── */
    emptyCard({
      title: 'A week view for Schedule',
      columnId: next,
      labels: [design],
      start: day(5),
      due: day(12),
      notes: 'The month answers "when", the day answers "what". Neither answers "how is this week looking", which is the one people ask on a Monday.',
      checklist: [check('Seven columns, hours down the side', false), check('Drag an event to another hour', false)],
    }),
    emptyCard({
      title: 'Mail: rules that file things for you',
      columnId: next,
      labels: [backend],
      start: day(8),
      due: day(18),
      notes: 'Say it once in your own words — "receipts go to Receipts" — and let the assistant write the rule.',
    }),
    emptyCard({
      title: 'Attachments on a card',
      columnId: next,
      labels: [design],
      due: day(21),
      notes: 'A link and a picture. Anything heavier belongs somewhere that is not a browser\'s local storage.',
    }),
    /* ── Ideas ────────────────────────────────────────────────────────── */
    emptyCard({
      title: 'Pulse on the wall',
      columnId: ideas,
      labels: [idea, design],
      notes:
        'An always-on mode for a spare screen: the day, the weather, what is next, and nothing you can click. '
        + 'The resting clock is most of the way there already.',
    }),
    emptyCard({
      title: 'A command palette',
      columnId: ideas,
      labels: [idea],
      notes: 'One key, and then type what you want. The launchpad already searches every application on the machine — this is that, over everything.',
    }),
    emptyCard({
      title: 'Themes you can make',
      columnId: ideas,
      labels: [idea, design],
      notes: 'The sky already has four phases and the accent is already yours. The gap between that and a theme anyone could write is small.',
    }),
    emptyCard({
      title: 'A board you can send someone',
      columnId: ideas,
      labels: [idea, backend],
      notes:
        'Everything here lives in this browser, which is the point, and also the limit. '
        + 'A read-only link to one board would not need an account — it would need somewhere to put it.',
    }),
    emptyCard({
      title: 'Widgets on Home you choose',
      columnId: ideas,
      labels: [idea, design],
      notes: 'Home is a fixed arrangement of good things. It could be your arrangement of them.',
    }),
    emptyCard({
      title: 'Pulse remembers what you keep asking',
      columnId: ideas,
      labels: [idea, ai],
      notes: 'Long-term memory exists and is written by hand. The assistant could notice a thing asked three times and offer to keep it.',
    }),
    emptyCard({
      title: 'Offline, properly',
      columnId: ideas,
      labels: [idea, backend],
      notes: 'The markets, the weather and the headlines all go blank on a train. The last good answer is better than nothing, and it is already in memory.',
    }),
    emptyCard({
      title: 'A watch face',
      columnId: ideas,
      labels: [idea],
      notes: 'The next thing on, on your wrist. The iOS app already knows it.',
    }),
  ];

  return emptyProject({
    name: 'Pulse OS',
    description: 'The dashboard — what it took to get here, what is being built, and what it might be next.',
    colour: 'sky',
    columns,
    labels,
    cards,
  });
}

/**
 * The titles the old four-card seed used.
 *
 * A board holding these and nothing else has never been used, so it can be
 * taken away when the real one arrives. A board with anything else in it is
 * somebody's work and is kept.
 */
export const OLD_SEED_TITLES = new Set([
  'Projects, as boards',
  'Mail gets its own tab',
  'Life Hub keeps the day',
  'Timeline bars read badly on a short span',
]);

export function isDemoBoard(project) {
  if (project?.name !== 'Pulse OS') return false;
  const cards = project.cards ?? [];
  return cards.length <= OLD_SEED_TITLES.size && cards.every((card) => OLD_SEED_TITLES.has(card.title));
}

/**
 * Which version of this board has been handed out.
 *
 * Bumping it gives everyone the new one, once. It is stored beside the
 * projects rather than worked out from them, because "has this person already
 * been given the board" is not a question the board itself can answer — they
 * are allowed to rename it, empty it, or throw it away.
 */
export const SEED_VERSION = 'pulse-board-2';

/**
 * The store's contents, with the Pulse OS board in them.
 *
 * It is ADDED, not substituted. The first attempt only replaced a board that
 * was still the untouched demo, which meant anyone who had so much as added a
 * card never saw it — the board was there in the code and not on the screen.
 * Deciding between "they want the board" and "do not touch their work" was the
 * wrong question: both, and it costs one extra project.
 *
 * The one thing taken away is a demo board, because leaving that beside the
 * real one is two projects called Pulse OS and only one of them real.
 */
export function withPulseBoard(projects) {
  const project = pulseProject();
  const kept = (projects ?? [])
    .filter((p) => !isDemoBoard(p))
    // A board of their own that happens to share the name is still theirs, but
    // two projects called Pulse OS in one picker is a riddle. Only the label
    // moves, and only the once.
    .map((p) => (p.name === project.name ? { ...p, name: `${p.name} (yours)` } : p));
  return { projects: [project, ...kept], activeId: project.id, seeded: SEED_VERSION };
}
