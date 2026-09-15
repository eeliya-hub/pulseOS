/**
 * What Pulse says it is doing while its tools run.
 *
 * One vocabulary shared by the chat assistant and voice mode, so the same action
 * is never described two ways. `batchCaption` exists because the model routinely
 * does several things for one request, and "Adding your task" shown while it
 * adds four of them reads as though it only heard one.
 */

export const TOOL_LABELS = {
  // Calendar
  get_upcoming_events: 'Checking your calendar',
  get_past_events: 'Looking back through your calendar',
  get_today: 'Checking your day',
  find_events: 'Searching your calendar',
  list_calendars: 'Checking your calendars',
  create_calendar_event: 'Adding to your calendar',
  update_calendar_event: 'Updating your calendar',
  delete_calendar_event: 'Removing from your calendar',
  // Tasks and habits
  get_tasks: 'Checking your list',
  add_task: 'Adding to your list',
  complete_task: 'Ticking that off',
  remove_task: 'Taking that off your list',
  add_habit: 'Adding your habit',
  log_habit: 'Logging your habit',
  remove_habit: 'Removing that habit',
  // The world
  get_weather: 'Checking the weather',
  get_news: 'Reading the news',
  search_web: 'Searching the internet',
  get_sports: 'Checking the scores',
  get_stocks: 'Checking the markets',
  add_stock: 'Updating your watchlist',
  remove_stock: 'Updating your watchlist',
  set_location: 'Updating your location',
  // Memory
  remember: 'Making a note',
  forget: 'Forgetting that',
  list_memories: 'Recalling what I know',
  // Around the app
  open_view: 'Taking you there',
  open_app: 'Opening that',
  watch_news_channel: 'Putting the news on',
  stop_news_channel: 'Turning the news off',
  get_trips: 'Checking your trips',
  get_trip: 'Reading your trip',
  add_packing_item: 'Adding to your packing list',
  check_packing_item: 'Updating your packing list',
  // Music
  play_music: 'Starting the music',
  pause_music: 'Pausing the music',
  next_track: 'Skipping ahead',
  previous_track: 'Going back a track',
  get_now_playing: 'Checking what’s playing',
  play_on_device: 'Moving the music',
};

export const DEFAULT_CAPTION = 'Working on it';

const quote = (text, max = 40) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return `“${clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean}”`;
};

/**
 * The caption for one tool call. Where the call has a subject — a search, a
 * place, an event title — it goes in, so the status says what is actually
 * happening rather than a generic stand-in.
 */
export function toolCaption(name, args = {}) {
  const base = TOOL_LABELS[name] || DEFAULT_CAPTION;
  const query = String(args?.query ?? '').trim();
  switch (name) {
    case 'search_web':
      return query ? `Searching the internet for ${quote(query)}` : base;
    case 'get_news':
      return query ? `Reading the news on ${quote(query)}` : args?.scope === 'local' ? 'Reading local news' : base;
    case 'get_weather':
      return args?.location ? `Checking the weather in ${args.location}` : base;
    case 'play_music':
      return query ? `Putting on ${quote(query)}` : base;
    case 'open_app':
      return args?.name ? `Opening ${args.name}` : base;
    case 'create_calendar_event':
      return args?.title ? `Adding ${quote(args.title, 32)}` : base;
    case 'add_task':
      return args?.text ? `Adding ${quote(args.text, 32)}` : base;
    default:
      return base;
  }
}

// How a run of the same tool reads. Only for the ones worth counting.
const PLURAL = {
  create_calendar_event: (n) => `Adding ${n} events`,
  update_calendar_event: (n) => `Updating ${n} events`,
  delete_calendar_event: (n) => `Removing ${n} events`,
  add_task: (n) => `Adding ${n} tasks`,
  complete_task: (n) => `Ticking off ${n} tasks`,
  remove_task: (n) => `Removing ${n} tasks`,
  add_habit: (n) => `Adding ${n} habits`,
  log_habit: (n) => `Logging ${n} habits`,
  add_stock: (n) => `Adding ${n} to your watchlist`,
  remember: (n) => `Noting ${n} things`,
  search_web: (n) => `Running ${n} searches`,
  add_packing_item: (n) => `Adding ${n} things to pack`,
};

const isRead = (name) => /^(get|find|list|search)_/.test(name);

/** The caption for everything one request set running at once. */
export function batchCaption(calls = []) {
  const list = (calls ?? []).filter((c) => c?.name);
  if (!list.length) return '';
  if (list.length === 1) return toolCaption(list[0].name, list[0].args);

  const names = new Set(list.map((c) => c.name));
  if (names.size === 1) {
    const [name] = names;
    if (PLURAL[name]) return PLURAL[name](list.length);
  }
  // Gathering several things to answer one question is a brief, not a chore list.
  if (list.every((c) => isRead(c.name))) return 'Pulling that together';
  return `Doing ${list.length} things`;
}
