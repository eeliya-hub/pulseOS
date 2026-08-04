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
    name: 'get_past_events',
    description:
      "List the user's PAST calendar events (ones that have already happened) across all connected calendars, most recent first. Use this for questions about what the user did recently, attended, or had on a past date.",
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many days back to look (default 14, max 120).' } },
    },
  },
  {
    name: 'get_today',
    description: "Get today's schedule (events) and to-do list.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather',
    description:
      "Current weather + multi-day forecast for a place. Defaults to the user's saved location; pass `location` to check somewhere else (e.g. a city they're travelling to).",
    parameters: {
      type: 'object',
      properties: { location: { type: 'string', description: 'Optional place name, e.g. "Paris" or "Manchester".' } },
    },
  },
  {
    name: 'get_sports',
    description:
      "Accurate LIVE sports data for the teams the user follows — latest results/scores, their next fixture, and league standing (football, NBA, NFL, plus Formula 1 races + standings). Use this for ANY question about their teams, scores, fixtures, league tables, or sports 'news' — it's real data, far more accurate than a web search. Optionally pass `team` to focus on one.",
    parameters: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Optional team/sport to focus on, e.g. "Arsenal" or "F1". Omit for all followed teams.' },
      },
    },
  },
  {
    name: 'get_news',
    description:
      "Fetch fresh, real news from the internet. Use for any question about current events, headlines, or what's happening — locally or in the world. Returns recent articles with source and time. For the user's own sports teams, prefer get_sports (more accurate).",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for, e.g. "UK elections" or "Nvidia earnings". Omit for top headlines.',
        },
        scope: {
          type: 'string',
          enum: ['local', 'world'],
          description: "'local' = news near the user's saved location; 'world' = national/global. Defaults to 'world'.",
        },
      },
    },
  },
  {
    name: 'search_web',
    description:
      "Search the live internet and read the top pages. This is your general-purpose window on the world — use it for ANY question you cannot answer from your own knowledge or another tool: facts you're unsure of, anything after your training cutoff, prices, opening times, how-to answers, products, people, places, or checking a claim. Returns results with title, source, snippet and (where available) the actual page text. Prefer get_news for headlines, get_sports for the user's teams, get_weather for weather.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query, phrased as you would type it into a search engine.' },
        recency: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Optional — only return results from the past day/week/month/year. Use for fast-moving topics.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_stocks',
    description: "The user's stock watchlist with live prices and daily change.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_calendars',
    description:
      "List the user's calendars you can add events to, across Google and Apple, with their names (e.g. Apple sub-calendars like 'Work', 'Social', 'Timetable'). Call this when the user names a calendar you're unsure of, before creating an event on it.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_calendar_event',
    description:
      "Create an event on one of the user's connected (Google/Apple) calendars. Pass `calendar` to target a specific one (e.g. an Apple sub-calendar like 'Work' or 'Social'); omit it to use their primary calendar.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'Event date, YYYY-MM-DD.' },
        start_time: { type: 'string', description: 'Start time HH:MM (24h). Omit for an all-day event.' },
        end_time: { type: 'string', description: 'End time HH:MM (24h). Optional.' },
        location: { type: 'string', description: 'Optional location.' },
        calendar: {
          type: 'string',
          description:
            "Optional calendar name to add the event to, e.g. 'Work', 'Social', 'Timetable'. Use list_calendars to see valid names. Defaults to the primary calendar.",
        },
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
    name: 'remember',
    description:
      "Save a durable fact about the user to your long-term memory, so you recall it in future conversations. Use for lasting things they share: people and pets, preferences and dislikes, goals, routines, important dates, how they like to be addressed. NOT for one-off requests or trivia.",
    parameters: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'The fact to remember, in a short third-person sentence, e.g. "Has a dog named Biscuit." or "Prefers oat milk."' } },
      required: ['fact'],
    },
  },
  {
    name: 'forget',
    description: "Remove things from your long-term memory that match a description (e.g. when the user says 'forget that').",
    parameters: {
      type: 'object',
      properties: { about: { type: 'string', description: 'What to forget, e.g. "oat milk" or "my old job".' } },
      required: ['about'],
    },
  },
  {
    name: 'list_memories',
    description: 'List everything you currently remember about the user (use when they ask what you know/remember about them).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_app',
    description: "Open a native application on the user's Mac by name (e.g. Spotify, Calendar).",
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'play_music',
    description:
      "Play music on the user's in-app Spotify player. With `query`, searches Spotify and plays the best match (a song, artist, or 'artist – song'); without it, resumes whatever's loaded.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to play, e.g. "Blinding Lights" or "lo-fi beats". Omit to resume.' } },
    },
  },
  {
    name: 'pause_music',
    description: 'Pause the in-app Spotify playback.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'next_track',
    description: 'Skip to the next track.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'previous_track',
    description: 'Go back to the previous track.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_now_playing',
    description: 'What is currently playing on the in-app Spotify (track, artist, and whether it is paused).',
    parameters: { type: 'object', properties: {} },
  },
];

export function systemPrompt(userName = 'the user', instructions = '', options = {}) {
  const today = new Date();
  const lines = [
    `You are Pulse, the friendly assistant living inside ${userName}'s PulseOS dashboard.`,
    'You can READ and MODIFY their data using the provided tools (calendar, tasks, habits, watchlist, location, weather, news, apps).',
    'When they ask you to add, create, delete, complete, change or open something — actually CALL the matching tool; never just claim you did it.',
    'Prefer reading current data with a tool before acting when it helps (e.g. find an event before deleting it).',
    'For calendar questions, read the actual events with a tool before answering — they span ALL of their connected calendars, so never guess. For the past ("what did I do last week?", "did I have anything on Monday?") use get_past_events; for future dates use get_upcoming_events, widening `days` to cover the range they asked about.',
    "When adding an event to a named calendar (e.g. an Apple sub-calendar like 'Work' or 'Social'), pass that name as `calendar` to create_calendar_event; if you're unsure of the exact name, call list_calendars first.",
    'For anything about weather, current events or the news, ALWAYS call get_weather / get_news to pull live data from the internet — never answer from memory, and never say you cannot access the internet.',
    'You CAN search the internet: search_web runs a real web search and reads the top pages. Use it whenever the answer is not already in your knowledge or another tool — anything recent, factual, local, or specific (prices, opening times, results, products, people, "is X true?"). Never guess and never claim you lack internet access; search instead. When you answer from a search, say where it came from (the source name), and say so plainly if the results do not actually settle the question.',
    "For anything about the user's sports teams — scores, results, fixtures, league tables, or sports \"news\" — use get_sports (accurate live data for the teams they follow). Only fall back to get_news for sports topics unrelated to their teams.",
    'You can control the in-app Spotify player: play_music (optionally a search query), pause_music, next_track, previous_track, get_now_playing. Use them whenever the user asks to play, pause, skip or identify music.',
    `Today is ${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today.toISOString().slice(0, 10)}). Use YYYY-MM-DD dates and 24h HH:MM times.`,
    'You have a long-term memory. When the user shares a durable personal fact (people/pets, preferences, dislikes, goals, routines, important dates, how to address them), call `remember` to save it — quietly, without making a fuss. Draw on what you already remember (listed below, if any) to personalize your help. Use `forget` when they ask you to, and `list_memories` if they ask what you know about them.',
    'After using tools, reply with ONE short, warm confirmation of what you did or found. Keep answers concise and skimmable.',
  ];

  // The user's own guidance on how Pulse should talk to them (set in Settings),
  // plus any saved named prompts. Their preferences take priority over the default
  // tone above, but never over the tool-use rules or safety.
  const custom = (instructions || '').trim();
  if (custom) {
    lines.push(
      '',
      'The user has provided the following context — how they like you to interact, their saved commands, and facts you remember about them. Follow it closely (it overrides the default tone, but never the tool-use rules or safety):',
      custom.slice(0, 8000),
    );
  }

  // Voice sessions are spoken aloud — formatting/layout preferences are for text
  // only. This goes LAST so it wins over any "use this format" persona request.
  if (options.voice) {
    lines.push(
      '',
      'IMPORTANT — you are replying by VOICE, read aloud. Speak in natural, conversational sentences. Do NOT use markdown, headings, bullet points, numbered lists, tables, or symbols like #, *, or - for layout — any formatting or "use this format" preference above applies only to written text. Say numbers and prices as words where natural. Keep answers concise but always finish your thought; never trail off mid-sentence.',
    );
  }

  return lines.join('\n');
}
