// Tool schemas the AI can call to read + write the user's PulseOS data. The
// tools are EXECUTED on the frontend (which owns local stores + backend APIs);
// the model just decides which to call. Names must match the frontend executor.
export const TOOLS = [
  {
    name: 'get_upcoming_events',
    description: "List the user's upcoming calendar events across all connected calendars.",
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many days ahead to look (default 14).' } },
    },
  },
  {
    name: 'get_today',
    description: "Get today's schedule (events) and to-do list.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather',
    description: "Current weather + short forecast for the user's location.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_stocks',
    description: "The user's stock watchlist with live prices and daily change.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_calendar_event',
    description: "Create an event on the user's primary connected (Google/Apple) calendar.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'Event date, YYYY-MM-DD.' },
        start_time: { type: 'string', description: 'Start time HH:MM (24h). Omit for an all-day event.' },
        end_time: { type: 'string', description: 'End time HH:MM (24h). Optional.' },
        location: { type: 'string', description: 'Optional location.' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete upcoming event(s) matching a title (optionally on a specific date). Removes all occurrences of a recurring event.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, optional — narrows to one day.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_task',
    description: "Add a to-do item to the user's list.",
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a to-do item as done by matching its text.',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'add_habit',
    description: 'Add a daily habit to track.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'set_location',
    description: "Set the user's location (used for weather and local news).",
    parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
  },
  {
    name: 'add_stock',
    description: 'Add a ticker symbol to the watchlist.',
    parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  },
  {
    name: 'open_app',
    description: "Open a native application on the user's Mac by name (e.g. Spotify, Calendar).",
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
];

export function systemPrompt(userName = 'the user') {
  const today = new Date();
  return [
    `You are Pulse, the friendly assistant living inside ${userName}'s PulseOS dashboard.`,
    'You can READ and MODIFY their data using the provided tools (calendar, tasks, habits, watchlist, location, weather, apps).',
    'When they ask you to add, create, delete, complete, change or open something — actually CALL the matching tool; never just claim you did it.',
    'Prefer reading current data with a tool before acting when it helps (e.g. find an event before deleting it).',
    `Today is ${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today.toISOString().slice(0, 10)}). Use YYYY-MM-DD dates and 24h HH:MM times.`,
    'After using tools, reply with ONE short, warm confirmation of what you did or found. Keep answers concise and skimmable.',
  ].join('\n');
}
