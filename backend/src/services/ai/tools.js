// Tool schemas the AI can call to read + write the user's PulseOS data. The
// tools are EXECUTED on the frontend (which owns local stores + backend APIs);
// the model just decides which to call. Names must match the frontend executor.
export const TOOLS = [
  {
    name: 'get_upcoming_events',
    description:
      "The user's upcoming calendar events, from EVERY connected calendar — Google, Apple, iCal feeds and locally added ones — including calendars they have hidden in the Life Hub view. Each event comes back with its start AND end time, whether it is all-day, how long it lasts, its location, notes, which calendar it is on, and whether that calendar is hidden. Use `from`/`to` for a specific date range (e.g. one day, or a named week), or `days` to look N days ahead.",
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many days ahead to look (default 14, max 180).' },
        from: { type: 'string', description: 'Optional start date YYYY-MM-DD — use with `to` to ask about a specific range.' },
        to: { type: 'string', description: 'Optional end date YYYY-MM-DD (inclusive).' },
      },
    },
  },
  {
    name: 'get_past_events',
    description:
      "The user's PAST calendar events across every connected calendar (hidden ones included), most recent first, with full detail (start, end, duration, calendar, location). Use for what they did, attended, or had on a past date. Supports `from`/`to` for a specific past range.",
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many days back to look (default 14, max 365).' },
        from: { type: 'string', description: 'Optional start date YYYY-MM-DD.' },
        to: { type: 'string', description: 'Optional end date YYYY-MM-DD.' },
      },
    },
  },
  {
    name: 'get_today',
    description:
      "Today's schedule in full — every event from every calendar including hidden ones, each with start and end times, plus today's to-do list and the current time. Use this for 'what's on today', 'am I free this afternoon', 'when does my day end'.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'find_events',
    description:
      'Search the calendar by keyword across the past and coming year — title, location or calendar name. Use when the user names an event ("when is my dentist appointment?", "did I have a meeting with Sam?") instead of guessing a date range.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for in the event title, location or calendar.' },
        days: { type: 'integer', description: 'How far back and forward to search, in days (default 60, max 365).' },
      },
      required: ['query'],
    },
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
          enum: ['local', 'national', 'world'],
          description:
            "'local' = their own town/county; 'national' = UK-wide; 'world' = international. Defaults to 'world'. These are three different fetches — for a full briefing, call it once per scope rather than once overall.",
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
      "Every calendar the user has, across Google and Apple, with its name (e.g. 'Work', 'Social', 'Timetable'), whether you can add events to it, and whether it is currently hidden in the Life Hub view. Hidden calendars are still readable — hiding only affects the dashboard display. Call this when the user names a calendar you are unsure of.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_calendar_event',
    description:
      "Add ONE event to one of the user's connected (Google/Apple) calendars. For several events, call this once per event — all in the same turn. It checks for an identical event first: a result with `duplicate: true` means it was already there and nothing was added. BEFORE calling, apply what you know about the user: if they have a standing preference for which calendar this kind of event goes on, pass `calendar`; if they have said where it is, pass `location`; if they have said how long this kind of event lasts, pass `end_time`. Omit `calendar` only when they have no preference — it then goes on the primary calendar.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
        start_time: { type: 'string', description: 'Start time HH:MM (24h). Omit for an all-day event.' },
        end_time: { type: 'string', description: 'End time HH:MM (24h). Optional — defaults to an hour after the start.' },
        end_date: { type: 'string', description: 'Last day YYYY-MM-DD, for an event spanning several days. Optional.' },
        all_day: { type: 'boolean', description: 'True for an all-day event. Optional — omitting start_time also makes it all-day.' },
        location: { type: 'string', description: 'Optional location or address.' },
        notes: { type: 'string', description: 'Optional notes to store on the event.' },
        calendar: {
          type: 'string',
          description:
            "Optional calendar name, e.g. 'Work', 'Home', 'Timetable'. Use list_calendars to see valid names. Defaults to the primary calendar.",
        },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'update_calendar_event',
    description:
      "Change an existing event — move it to another day, retime it, rename it, change where it is, or add notes. Finds it by title; narrow with `date`, `at_time` or `calendar` when several share a title. A moved event keeps its length unless you give a new end. If the result has `matches`, several events fitted: ask which one. Works on hidden calendars too.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Enough of the current title to identify the event.' },
        date: { type: 'string', description: "The event's CURRENT date YYYY-MM-DD — to pick it out." },
        at_time: { type: 'string', description: "The event's CURRENT start time HH:MM — to pick it out." },
        calendar: { type: 'string', description: 'The calendar it is on — to pick it out.' },
        new_title: { type: 'string', description: 'Optional new title.' },
        new_date: { type: 'string', description: 'Optional new date YYYY-MM-DD to move it to.' },
        start_time: { type: 'string', description: 'Optional NEW start time HH:MM (24h).' },
        end_time: { type: 'string', description: 'Optional NEW end time HH:MM (24h).' },
        location: { type: 'string', description: 'Optional new location.' },
        notes: { type: 'string', description: 'Optional new notes.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'delete_calendar_event',
    description:
      "Remove an event, found by title. With `date` it removes that day's occurrence only; without, the whole event (every occurrence if it repeats). Narrow with `at_time` or `calendar`. If more than one event matches, nothing is removed and the matches come back — ask which one, or pass `all_matches: true` only when they clearly want every one gone. When they ask to clear out duplicates or copies, pass `keep_one: true`: it keeps the most complete copy and removes the rest.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, optional — just that day.' },
        at_time: { type: 'string', description: 'Start time HH:MM, optional — to pick one out.' },
        calendar: { type: 'string', description: 'Calendar name, optional — to pick one out.' },
        all_matches: { type: 'boolean', description: 'Remove every event that matches. Only when they asked for all of them.' },
        keep_one: { type: 'boolean', description: 'Remove duplicate copies, keeping the most complete one.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_tasks',
    description:
      "The user's to-do list. With `date`, only that day's tasks (repeating ones included); without, everything still open. Pass `include_done` to see ticked-off tasks too.",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional YYYY-MM-DD.' },
        include_done: { type: 'boolean', description: 'Include completed tasks. Defaults to false.' },
      },
    },
  },
  {
    name: 'add_task',
    description: "Add ONE to-do to the user's list. For several tasks, call it once per task, all in the same turn.",
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
    description: 'Tick off a to-do, matched by its text.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, date: { type: 'string', description: 'Optional YYYY-MM-DD, to pick one out.' } },
      required: ['text'],
    },
  },
  {
    name: 'remove_task',
    description: 'Take a to-do off the list entirely, matched by its text.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, date: { type: 'string', description: 'Optional YYYY-MM-DD, to pick one out.' } },
      required: ['text'],
    },
  },
  {
    name: 'add_habit',
    description: 'Start tracking a daily habit.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'log_habit',
    description: "Mark a habit as done for today (or, with `done: false`, not done). Use for 'I went to the gym', 'I've read today'.",
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' }, done: { type: 'boolean', description: 'Defaults to true.' } },
      required: ['name'],
    },
  },
  {
    name: 'remove_habit',
    description: 'Stop tracking a habit.',
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
    name: 'remove_stock',
    description: 'Take a ticker symbol off the watchlist.',
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
    name: 'watch_news_channel',
    description:
      "Put a live news channel on the screen. Available: Sky News, BBC News, GB News, TalkTV, Euronews, talkSPORT (sport). Use this whenever they ask to watch, put on, or turn on a news channel ('put BBC News on', 'turn on Sky'). It opens the news view, switches to that channel and gives it the whole screen. This is live television — for written headlines use get_news instead. AFTER calling it, say ONE short line: name what you are putting on, then sign off — something like 'BBC News coming up now. If you need anything else, you know where to find me.' Do not ask a question, do not offer to do anything else, and do not invite a reply: the channel takes the screen and the microphone closes the moment you stop speaking, so anything you offer cannot be answered.",
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: "Which channel, e.g. 'BBC News' or just 'BBC'. Omit to put on whichever was last watched.",
        },
        fullscreen: {
          type: 'boolean',
          description: 'Whether to give it the whole screen. Defaults to true; pass false to leave it in the dashboard tile.',
        },
      },
    },
  },
  {
    name: 'stop_news_channel',
    description:
      "Take the live news channel off the screen — 'turn the news off', 'close that', 'stop watching'. Hands the screen back to the dashboard.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_trips',
    description:
      "Every trip in the user's Travel view — its name, where it goes, its dates, and whether it is upcoming, happening now, or already done. Use this for 'what trips have I got', 'when am I going to X', or to work out which trip they mean before calling get_trip.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_trip',
    description:
      "One trip in full: destination and dates, the flights with their codes and dates, where they are staying, the day-by-day itinerary with times and places, and the packing list with what is still outstanding. Defaults to the trip currently open in the Travel view. Use this for anything about a trip's plans — what they are doing on a given day, when they fly, where they are staying, what they still need to pack.",
    parameters: {
      type: 'object',
      properties: {
        trip: {
          type: 'string',
          description: 'Optional trip name or destination, e.g. "Tokyo". Defaults to the trip currently open.',
        },
        day: {
          type: 'string',
          description: 'Optional single day to focus on — a date as YYYY-MM-DD, or a day number like "2".',
        },
      },
    },
  },
  {
    name: 'get_now_playing',
    description: 'What is currently playing on the in-app Spotify (track, artist, and whether it is paused).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'play_on_device',
    description:
      "Move the music to another Spotify device — a speaker, a phone, an Echo — or back to this dashboard ('this dashboard'). Use for 'play it on the kitchen speaker', 'send it to my Echo'.",
    parameters: {
      type: 'object',
      properties: { device: { type: 'string', description: "The device's name, or 'this dashboard'." } },
      required: ['device'],
    },
  },
  {
    name: 'open_view',
    description:
      "Switch the dashboard to one of its views: home, launchpad, life hub (calendar, tasks, habits), markets and news, music, travel, or the assistant. In voice mode the view changes behind the voice screen, ready for when it closes.",
    parameters: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['home', 'launchpad', 'life hub', 'markets', 'news', 'music', 'travel', 'assistant'],
        },
      },
      required: ['view'],
    },
  },
  {
    name: 'add_packing_item',
    description: "Add something to a trip's packing list. Defaults to the trip open in Travel. For several things, call once per item.",
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string' },
        trip: { type: 'string', description: 'Optional trip name or destination.' },
      },
      required: ['item'],
    },
  },
  {
    name: 'check_packing_item',
    description: "Tick something off a trip's packing list (or un-tick it with `done: false`).",
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string' },
        trip: { type: 'string', description: 'Optional trip name or destination.' },
        done: { type: 'boolean', description: 'Defaults to true.' },
      },
      required: ['item'],
    },
  },
];

export function systemPrompt(userName = 'the user', instructions = '', options = {}) {
  const today = new Date();
  // Said on a Tuesday afternoon, "Tuesday at 9" cannot mean this morning.
  const rule =
    'When they name a weekday without saying which week, take the next one that has not happened yet — and never schedule something at a time that has already passed today. "Tuesday at 9" said on a Tuesday afternoon means next Tuesday.';
  const lines = [
    `You are Pulse, the assistant living inside ${userName}'s PulseOS dashboard.`,
    `Today is ${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} (${today.toISOString().slice(0, 10)}), the time is ${today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}. Use YYYY-MM-DD dates and 24h HH:MM times.`,
    '',
    // Their own context leads. At the bottom of a long prompt it was being
    // skimmed: remembered preferences (which calendar, what location, how long)
    // never made it into the tool arguments.
    ...(instructions || '').trim()
      ? [
          "THE USER'S OWN CONTEXT — read this first and treat it as binding. It is how they want you to work, their saved commands, and the standing facts and preferences you have learned about them. It overrides the style defaults below, and it applies to the ARGUMENTS you pass to tools, not just to how you talk:",
          (instructions || '').trim().slice(0, 24000),
          '',
        ]
      : [],
    'HOW YOU WORK',
    'You can READ and CHANGE their data with the tools provided — calendar, tasks, habits, watchlist, location, music, memory — and you can search the live internet. Never claim you lack access to any of it.',
    'When they ask you to add, create, move, rename, delete, complete or open something, CALL the matching tool. Never say you have done something you have not actually done.',
    'Answer from tools, not from memory. If a question touches their schedule, the weather, the news, their teams, their money or anything factual you are not certain of, call the tool first — every time, even if you answered a similar question a moment ago.',
    'Finish the whole request before replying. If they ask three things, do all three; if a task needs several tool calls in a row, keep going until it is done. Never stop half way and describe what you were about to do.',
    'One request often holds several actions — two appointments, four tasks, an event and a reminder. Call the tool once for EACH item, and call them all together in the same turn. Never do the first and stop, never fold two items into one call, and never ask whether they want the rest done as well.',
    'Then confirm every item back by name, with its day and time, so they know exactly what happened. If a result says `duplicate`, say it was already there and nothing extra was added. If a result has an `error`, say plainly which item failed and why — never report an action as done unless its tool said so.',
    'Do not repeat a change you have already made in this conversation. If they ask for something that sounds like what you just did, check the calendar or the list first rather than adding it a second time.',
    '',
    'CALENDAR — you have full access',
    'You can see EVERY calendar: Google, Apple, subscribed iCal feeds, and events added in the app. This includes calendars the user has switched off in the Life Hub view — hiding one only removes it from the dashboard display, never from you.',
    'Read the calendar before answering anything about it. Use get_today for today, get_upcoming_events (with `days`, or `from`/`to` for a specific range) for the future, get_past_events for what already happened, and find_events to look something up by name.',
    'Report what you find COMPLETELY. List every event in the range they asked about — not a sample, not "and a few others". Give start and end times (not just the start), say when something is all-day, and name the calendar when it matters or when they ask.',
    'Only say there is nothing on after a tool has actually returned an empty list for that exact range. Never guess that a day is free.',
    'When something you are reporting sits on a calendar that is hidden in the app, still include it, and mention which calendar it came from so they know why they cannot see it. If their own instructions below tell you to ignore or focus on particular calendars, follow that instead — their instructions win.',
    'You can also change the calendar: create_calendar_event to add (pass `calendar` to choose which one — call list_calendars if unsure of the name), update_calendar_event to move, retime, rename or relocate one, delete_calendar_event to remove it.',
    'When a change or a removal comes back with `matches`, more than one event fitted and nothing was touched: ask which they mean. When they ask to get rid of duplicates or copies, use delete_calendar_event with `keep_one`.',
    'Their to-do list, habits, watchlist, trips and music are yours to change too: get_tasks, add_task, complete_task, remove_task; add_habit, log_habit, remove_habit; add_stock, remove_stock; add_packing_item, check_packing_item; play_on_device to move the music; open_view to take them to a part of the dashboard.',
    `${rule}`,
    'BEFORE you create or change an event, apply what you know about them from the context above. If they have said which calendar a kind of event belongs on, put it there. If they have said what the location should be, set it. If they have said how long that kind of event runs, work out the end time and pass it. Fill those in silently rather than leaving a default or asking — they have already told you once.',
    '',
    'THE INTERNET',
    'search_web runs a real web search and reads the pages it finds. Use it for ANYTHING you cannot answer for certain: facts, prices, opening times, how-to questions, products, people, places, anything after your training cutoff, or checking a claim. Reach for it early rather than apologising or guessing.',
    'If the first search does not answer the question, search again with different words before giving up. When you answer from a search, name the source. If the results genuinely do not settle it — or come back empty — say exactly that.',
    'Use get_news for headlines and current events, get_weather for weather (anywhere, not just home), get_sports for the teams they follow (real data, better than a search), get_stocks for their watchlist.',
    'Their travel plans live in get_trips and get_trip — flights, hotel, the day-by-day itinerary and the packing list. Read those before answering anything about a trip.',
    '',
    'THEIR INSTRUCTIONS',
    'Anything the user has set as their own instructions, saved prompts, or told you to remember is binding. Follow it to the letter — including rules about what to always include, what to skip, how long to be, and what language to answer in. It outranks every style default here.',
    'Their saved prompts are named commands: when they ask for one by name, carry out its full instruction exactly as written, every section of it.',
    '',
    'REPLYING',
    'Be complete first and brief second. Lead with the answer, keep the words plain, and cut the padding — but never drop information they asked for to save space.',
    'Use your long-term memory: call `remember` when they share something durable (people, pets, preferences, goals, routines, key dates), `forget` when they ask, `list_memories` when they ask what you know.',
    '',
    'LANGUAGE',
    'Reply in the language of their latest message, not the language of the conversation so far — when they switch language mid-conversation, switch with them immediately. A message in Persian carrying a few English words is still Persian.',
    'Write each language in its own alphabet. Persian is written in Persian letters — سلام، چطوری — and never in Latin ones ("salam", "chetori"). The same goes for Arabic, Russian, Greek, Hebrew and every other non-Latin language: never romanise. Use their language\'s own word for ordinary things — تقویم not کلندر, رویداد not ایونت — and keep only real names (songs, places, brands, apps) in their original spelling.',
  ];

  const custom = (instructions || '').trim();

  // A realtime voice model is smaller and follows a long prompt far less closely
  // than the text model does. So voice gets its own, much shorter brief with the
  // user's own context at the TOP — buried in the middle of the full operating
  // manual, their memories and saved commands were being skimmed past.
  if (options.voice) {
    const spoken = [
      `You are Pulse, ${userName}'s assistant, speaking with them out loud.`,
      `It is ${today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}.`,
    ];

    if (custom) {
      spoken.push(
        '',
        'THIS IS WHAT YOU KNOW ABOUT THEM AND HOW THEY WANT YOU TO BEHAVE. It is binding — their saved commands, their preferences, and the facts you remember. Use these facts naturally in conversation, and when they ask for one of their saved commands by name, carry out its full instruction exactly:',
        custom.slice(0, 24000),
      );
    }

    spoken.push(
      '',
      'HOW YOU WORK',
      'Use your tools for anything real — their calendar (every calendar, including hidden ones, with start and end times), their trips and travel plans, the weather, the news, the live news channels, their teams, their money, the music player, and search_web for anything you are unsure of. Call the tool, never guess, and never say you cannot do something you have a tool for.',
      'When they ask you to add, move, delete or play something, actually call the tool. Do the whole request, not part of it.',
      'One request often holds several actions — "add two appointments", "put these four on my list". Call the tool once for EACH item, all together in the same turn. Never add the first and stop, and never ask if they want the rest done too.',
      'When the tools come back, confirm each item out loud by name with its day and time. If a result says duplicate, tell them it was already there and nothing extra was added. If a result has an error, say which one failed and why. Never say something is done unless its tool said so.',
      'Never redo something you already did in this conversation. If they ask for what sounds like the same thing again, it is almost always because they did not catch your confirmation — check the calendar or list and tell them it is there, rather than adding a second copy.',
      'If a change or removal comes back with matches, several events fitted and nothing was touched — ask which one. To clear out duplicate copies, use delete_calendar_event with keep_one.',
      'You can also run their to-do list, habits, watchlist, packing list and music: get_tasks, complete_task, remove_task, log_habit, remove_stock, add_packing_item, check_packing_item, play_on_device, and open_view to take them to part of the dashboard.',
      // The text prompt has this rule; without it here, spoken requests were
      // getting the title and time right and defaulting everything else.
      'BEFORE you add or change an event, apply what you know about them from above. If they have said which calendar that kind of event belongs on, put it there. If they have said what the location should be, set it. If they have said how long that kind of event runs, work out the end time and pass it. Fill those in silently — they have already told you once, so do not ask again and do not fall back to a default.',
      rule,
      'Answer completely — every event they asked about, both times, all of it — but say it the way a person would.',
      '',
      'SPEAKING',
      'When an action ends the conversation — putting a live channel on the screen, for instance — close it properly: say what is happening and sign off warmly, along the lines of "if you need anything else, you know where to find me". Never end one of those with a question or an offer, because there will be nobody listening for the answer.',
      'You are being read aloud. Natural sentences only: no markdown, no headings, no bullet points, no numbered lists, no symbols like # * or - for layout. Any "use this format" preference applies to written replies, not to speech.',
      'Say numbers, times and prices as words. Keep it tight, but always finish your thought — never trail off.',
      '',
      'LANGUAGE',
      'Reply in the language of what they JUST said, not the language of the conversation so far. They switch languages mid-conversation often: the moment they speak Persian, answer in Persian; the moment they go back to English, answer in English. Never carry the previous turn\'s language into a turn they asked in a different one.',
      'Judge that from the words themselves, not the accent. Persian spoken with English words dropped in ("فردا driving lesson دارم") is still Persian — answer it in Persian.',
      'Write each language in its own alphabet. Persian is written in Persian letters — سلام، چطوری — and never in Latin ones ("salam", "chetori"). The same goes for Arabic, Russian, Greek, Hebrew and every other non-Latin language: never romanise, and never spell one language out in another\'s script.',
      'Use their language\'s own word for ordinary things — تقویم not کلندر, رویداد not ایونت, هفته not ویک. Only real names — songs, places, brands, apps — keep their original spelling.',
    );
    return spoken.join('\n');
  }

  return lines.join('\n');
}
