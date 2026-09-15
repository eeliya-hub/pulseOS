/**
 * Tool results → the cards voice mode puts on screen.
 *
 * One job: take what a tool just returned — the events it found, the forecast,
 * the headlines, the trip — and shape it into a card, with the words each row
 * would be recognised by when spoken aloud attached to it.
 *
 * Deciding WHEN a card appears and which row is lit belongs to voiceScript.js,
 * which compiles those keywords and the transcript into a timeline. This file
 * knows nothing about sentences or timing; it only describes the data.
 */

import { keywordsOf, numberWord, pins, pinsPhrase, topicKeywords } from './voiceKeywords.js';

/* ── Tool results → cards ─────────────────────────────────────────────────── */

const isEmpty = (value) => value === null || value === undefined || value === '';

const CALENDAR_READ = new Set(['get_upcoming_events', 'get_past_events', 'get_today', 'find_events']);
const TRAVEL_TOOLS = new Set(['get_trips', 'get_trip']);
const MUSIC_TOOLS = new Set(['play_music', 'get_now_playing', 'pause_music', 'next_track', 'previous_track']);
const CHANNEL_TOOLS = new Set(['watch_news_channel', 'stop_news_channel']);

function calendarItem(event, index) {
  const when = [event.day, event.allDay ? 'All day' : event.start].filter(Boolean).join(' · ');
  return {
    id: event.ref || `event-${index}`,
    role: 'event',
    title: event.title || 'Untitled',
    when,
    day: event.day || event.date || '',
    time: event.allDay ? 'All day' : [event.start, event.end].filter(Boolean).join(' – '),
    location: event.location || '',
    calendar: event.calendar || '',
    color: event.color || null,
    allDay: Boolean(event.allDay),
    keywords: keywordsOf(event.title, pins(event.location), event.day, event.calendar, pins(event.start), pins(event.end)),
  };
}

function calendarPanel(name, result) {
  const events = result?.events ?? [];
  if (!events.length) return null;
  const heading =
    name === 'get_today' ? 'Today' : name === 'get_past_events' ? 'Already happened' : name === 'find_events' ? 'Found' : 'Coming up';
  return {
    kind: 'calendar',
    title: heading,
    subtitle: result?.count > events.length ? `${events.length} of ${result.count}` : null,
    meta: { from: result?.from ?? null, to: result?.to ?? null },
    keywords: topicKeywords('calendar', 'diary', 'schedule', 'coming up', 'on today', 'this week'),
    items: events.slice(0, 12).map(calendarItem),
  };
}

// "17" said aloud is "seventeen degrees" far more often than a bare number, so
// build the spoken form directly rather than leaving "17 degrees" to be expanded.
const degreesOf = (value) => {
  const word = numberWord(Math.round(Number(value)));
  return word ? `${word} degrees` : null;
};

function weatherPanel(result) {
  if (!result || result.error || isEmpty(result.temperature)) return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const days = (result.daily ?? []).slice(0, 6).map((d, i) => {
    // "Tue" is how the data labels it; "Tuesday", "today" and "tomorrow" are how
    // it gets said. All of them should light the row.
    const weekday = d.date ? new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }) : null;
    const offset = d.date ? Math.round((new Date(`${d.date}T00:00:00`) - new Date(`${todayKey}T00:00:00`)) / 86_400_000) : null;
    return {
      id: d.date || `day-${i}`,
      role: 'day',
      title: d.day,
      date: d.date,
      hi: d.hi,
      lo: d.lo,
      icon: d.icon || 'cloud',
      // Every way the day gets said, and the numbers that go with it — "the high
      // is seventeen" now points at this row, where before only the day name did.
      keywords: keywordsOf(
        [d.day, weekday, offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : null],
        d.date,
        pinsPhrase(degreesOf(d.hi)),
        d.hi,
        pinsPhrase(degreesOf(d.lo)),
        d.lo,
      ),
    };
  });
  const now = {
    id: 'now',
    role: 'now',
    title: result.location || 'Now',
    temperature: result.temperature,
    condition: result.condition || '',
    feelsLike: result.feelsLike,
    high: result.high,
    low: result.low,
    wind: result.wind,
    precipitation: result.precipitation,
    icon: (result.condition || '').toLowerCase().includes('rain')
      ? 'rain'
      : (result.condition || '').toLowerCase().includes('cloud')
        ? 'cloud'
        : 'sun',
    // All the ways "now" gets said are equally its name — before, only "right
    // now" was, so "it's currently mild" lit nothing at all. The reading itself
    // is context: the condition, the temperature, what it feels like.
    keywords: keywordsOf(
      ['right now', 'currently', 'at the moment', 'at the minute', 'outside', 'out there', 'feels like'],
      pins(result.condition),
      // With the unit attached as well as bare: "fourteen degrees" is a phrase
      // worth more than the loose number, which on its own could be anything.
      pinsPhrase(degreesOf(result.temperature)),
      result.temperature,
      pinsPhrase(degreesOf(result.feelsLike)),
      result.wind,
    ),
  };
  return {
    kind: 'weather',
    title: result.location || 'Weather',
    meta: { location: result.location },
    keywords: topicKeywords('weather', 'forecast', 'temperature', 'degrees', result.location),
    items: [now, ...days],
  };
}

function newsPanel(result) {
  const articles = result?.articles ?? [];
  if (!articles.length) return null;
  const scope = result.scope ?? 'world';
  const scopeLabel =
    scope === 'local' ? `Local news · ${result.place ?? ''}`.trim() : scope === 'national' ? 'UK headlines' : 'World headlines';
  return {
    kind: 'news',
    title: scopeLabel,
    meta: { scope },
    // The scope words matter: a brief that reads local, then national, then
    // world needs three news cards that can be told apart by what is said.
    keywords: topicKeywords(
      scope === 'local' ? 'local news' : scope === 'national' ? 'national news' : 'world news',
      scope === 'local' ? result.place : scope === 'national' ? 'across the uk' : 'around the world',
      'headlines',
    ),
    items: articles.slice(0, 6).map((a, i) => ({
      id: a.url || `story-${i}`,
      role: 'story',
      title: a.title || 'Untitled',
      source: a.source || '',
      publishedAt: a.publishedAt || '',
      summary: a.summary || '',
      url: a.url || '',
      keywords: keywordsOf(a.title, a.source),
    })),
  };
}

/**
 * What's on the speakers. One row, so it lights the moment Pulse mentions it —
 * and it is worth showing even when nothing is playing, because "nothing is
 * playing" is itself the answer to "what's this song?".
 */
function musicPanel(name, result) {
  const track = result.track ?? result.playing;
  if (typeof track !== 'string' || !track.trim()) {
    if (name === 'get_now_playing' && result.playing === false) {
      return {
        kind: 'music',
        title: 'Music',
        meta: { state: 'stopped' },
        items: [{ id: 'nothing', role: 'track', title: 'Nothing playing', artists: '', keywords: keywordsOf('nothing playing', 'music', 'song') }],
      };
    }
    return null;
  }
  const state = result.paused ? 'paused' : 'playing';
  return {
    kind: 'music',
    title: name === 'play_music' ? 'Now playing' : 'On the speakers',
    meta: { state },
    keywords: topicKeywords('playing', 'song', 'track', 'music', track, result.artists),
    items: [
      {
        id: 'track',
        role: 'track',
        title: track,
        artists: result.artists || '',
        album: result.album || '',
        image: result.image || null,
        state,
        keywords: keywordsOf(track, result.artists, result.album),
      },
    ],
  };
}

/**
 * Which live channel is on. Mostly seen when a channel is put on WITHOUT taking
 * the whole screen — full screen covers the voice view entirely, by design.
 */
function channelPanel(name, result) {
  if (name === 'stop_news_channel') {
    return {
      kind: 'channel',
      title: 'Live TV',
      meta: { live: false },
      keywords: topicKeywords('news channel', 'live tv', 'turned off'),
      items: [{ id: 'off', role: 'channel', title: 'Off', live: false, keywords: keywordsOf('off', 'stopped', 'closed') }],
    };
  }
  if (!result.watching) return null;
  return {
    kind: 'channel',
    title: result.fullscreen ? 'Full screen' : 'Live TV',
    meta: { live: true },
    keywords: topicKeywords(result.watching, 'news channel', 'live tv', 'watching'),
    items: [
      {
        id: 'channel',
        role: 'channel',
        title: result.watching,
        live: true,
        keywords: keywordsOf(result.watching, 'channel'),
      },
    ],
  };
}

function travelPanel(name, result) {
  if (!result || result.error) return null;

  if (name === 'get_trips') {
    const trips = result.trips ?? [];
    if (!trips.length) return null;
    return {
      kind: 'travel',
      title: 'Your trips',
      meta: { mode: 'list' },
      keywords: topicKeywords('trips', 'travel', 'going away'),
      items: trips.slice(0, 8).map((t, i) => ({
        id: t.id || `trip-${i}`,
        role: 'trip',
        title: t.name || t.destination || 'Trip',
        destination: t.destination || '',
        dates: [t.start, t.end].filter(Boolean).join(' → '),
        phase: t.phase || '',
        countdown: t.countdown ?? null,
        keywords: keywordsOf(t.name, t.destination, t.country),
      })),
    };
  }

  const trip = result.trip ?? result;
  const items = [];
  for (const flight of trip.flights ?? []) {
    items.push({
      id: `flight-${flight.code || items.length}`,
      role: 'flight',
      title: [flight.code, flight.label].filter(Boolean).join(' · ') || 'Flight',
      when: flight.date || '',
      color: '#60a5fa',
      keywords: keywordsOf(flight.code, flight.label, 'flight', flight.date),
    });
  }
  if (trip.stay?.name) {
    items.push({
      id: 'stay',
      role: 'stay',
      title: trip.stay.name,
      when: 'Where you stay',
      color: '#f472b6',
      keywords: keywordsOf(trip.stay.name, 'hotel', 'stay'),
    });
  }
  for (const day of trip.itinerary ?? []) {
    for (const item of day.items ?? []) {
      items.push({
        id: item.id || `plan-${items.length}`,
        role: 'plan',
        title: item.title || 'Plan',
        when: [day.label || day.date, item.time].filter(Boolean).join(' · '),
        day: day.date || '',
        time: item.time || '',
        place: item.place || '',
        color: item.color || null,
        type: item.type || 'plan',
        keywords: keywordsOf(item.title, pins(item.place), pins(item.time), day.label, day.date),
      });
    }
  }
  if (!items.length) return null;
  return {
    kind: 'travel',
    title: trip.name || trip.destination || 'Trip',
    subtitle: [trip.destination, [trip.start, trip.end].filter(Boolean).join(' → ')].filter(Boolean).join(' · '),
    meta: { mode: 'trip', countdown: trip.countdown ?? null, phase: trip.phase ?? '' },
    keywords: topicKeywords(trip.name, trip.destination, 'trip', 'travel', 'itinerary'),
    items: items.slice(0, 14),
  };
}

/**
 * One followed team → one card. Kept separate per team on purpose: asked about
 * four teams, Pulse talks about them one at a time, so the screen should follow
 * it one at a time rather than showing a wall of every sport at once.
 */
function sportsPanels(result) {
  const teams = result?.teams ?? (result?.sport || result?.team ? [result] : []);
  return teams
    .filter((t) => t && !t.note)
    .map((t, index) => {
      const name = t.team || t.sport || 'Sport';
      const items = [];

      if (t.fixture) {
        items.push({
          id: `fixture-${index}`,
          role: 'fixture',
          title: t.fixture.name,
          when: [t.fixture.date, t.fixture.time].filter(Boolean).join(' · '),
          venue: t.fixture.venue || '',
          keywords: keywordsOf(t.fixture.name, 'next', 'fixture', 'kick off', t.fixture.venue, t.fixture.date),
        });
      }
      for (const [i, row] of (t.table ?? []).entries()) {
        items.push({
          id: `row-${index}-${i}`,
          role: 'standing',
          rank: row.rank,
          title: row.team,
          points: row.points,
          played: row.played,
          record: row.record,
          me: row.me,
          keywords: keywordsOf(row.team, row.me ? name : null, 'table', 'standings'),
        });
      }
      for (const [i, r] of (t.results ?? []).entries()) {
        items.push({
          id: `result-${index}-${i}`,
          role: 'result',
          title: `${r.homeTeam} ${r.homeScore ?? '–'}–${r.awayScore ?? '–'} ${r.awayTeam}`,
          when: r.date || '',
          keywords: keywordsOf(r.homeTeam, r.awayTeam, 'result', 'beat', 'won', 'lost'),
        });
      }
      if (!items.length) return null;

      return {
        kind: 'sports',
        title: name,
        subtitle: t.league || t.sport || null,
        meta: { standing: t.standing || null, sport: t.sport || null },
        keywords: topicKeywords(name, t.league, t.sport, 'table', 'standings', 'fixture'),
        items,
      };
    })
    .filter(Boolean);
}

/**
 * A tool result → the cards to put on screen, in the order they should appear.
 * Usually one; sometimes several (a sports check across four followed teams);
 * often none, when the tool has nothing worth showing (a note taken, a memory
 * saved, music paused).
 */
// eslint-disable-next-line no-unused-vars -- same (name, args, result) shape as receiptsFromTool; a lookup's card needs only its result
export function panelsFromTool(name, args = {}, result = {}) {
  if (!name || !result || result.error) return [];
  const one = (panel) => (panel ? [panel] : []);
  if (CALENDAR_READ.has(name)) return one(calendarPanel(name, result));
  if (name === 'get_weather') return one(weatherPanel(result));
  if (MUSIC_TOOLS.has(name)) return one(musicPanel(name, result));
  if (CHANNEL_TOOLS.has(name)) return one(channelPanel(name, result));
  if (name === 'get_news') return one(newsPanel(result));
  if (TRAVEL_TOOLS.has(name)) return one(travelPanel(name, result));
  if (name === 'get_sports') return sportsPanels(result);
  return [];
}

/** Back-compat single-card helper — the first card a tool produces, or null. */
export function panelFromTool(name, args = {}, result = {}) {
  return panelsFromTool(name, args, result)[0] ?? null;
}

/* ── What was done → one receipt for the turn ─────────────────────────────── */

const shortDay = (key) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!match) return '';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const joined = (...parts) => parts.filter(Boolean).join(' · ');

function receiptRow(id, { verb, kind, title, date, start, end, allDay, location, calendar, note }) {
  const day = shortDay(date);
  const time = start ? (end ? `${start} – ${end}` : start) : allDay ? 'All day' : '';
  return {
    id,
    role: 'action',
    verb,
    kind,
    title: title || 'Untitled',
    detail: joined(day, time, location, calendar),
    note: note || '',
    // Named by its title; told apart from its neighbours by the day and time,
    // which is how a reply confirms two of the same appointment.
    keywords: keywordsOf(title, pins(day), pins(start), pins(location)),
  };
}

/**
 * What one write tool did, as rows for the receipt — one per thing it touched.
 * Failures are rows too, so something that didn't happen is seen not to have,
 * rather than assumed to have. Lookups return nothing here; they have cards.
 */
export function receiptsFromTool(name, args = {}, result = {}, key = name) {
  const r = result ?? {};
  const id = (suffix = 0) => `${key}:${suffix}`;
  const failed = (kind, title, extra = {}) =>
    receiptRow(id(), { verb: r.matches ? 'unclear' : 'failed', kind, title, note: r.error || r.note, ...extra });

  switch (name) {
    case 'create_calendar_event': {
      const event = { kind: 'event', title: r.title ?? args.title, date: r.date ?? args.date, start: r.start ?? null, end: r.end ?? null, allDay: r.all_day, location: r.location ?? args.location, calendar: r.calendar };
      if (r.created) return [receiptRow(id(), { ...event, verb: 'added' })];
      if (r.duplicate) return [receiptRow(id(), { ...event, verb: 'exists', note: 'Already on your calendar — not added twice' })];
      return [failed('event', event.title, { date: event.date })];
    }
    case 'update_calendar_event':
      if (r.updated) {
        return [
          receiptRow(id(), {
            verb: 'updated',
            kind: 'event',
            title: r.title,
            date: r.date,
            start: r.start,
            end: r.end,
            allDay: r.all_day,
            location: r.location,
            calendar: r.calendar,
            note: r.previous_title ? `Was “${r.previous_title}”` : '',
          }),
        ];
      }
      return [failed('event', args.title, { date: args.date })];
    case 'delete_calendar_event': {
      const rows = (r.removed ?? []).map((e, i) =>
        receiptRow(id(i), { verb: 'removed', kind: 'event', title: e.title, date: e.date, start: e.start, calendar: e.calendar }),
      );
      (r.failed ?? []).forEach((text, i) => rows.push(receiptRow(id(`f${i}`), { verb: 'failed', kind: 'event', title: text })));
      if (rows.length) return rows;
      return [failed('event', args.title, { date: args.date, note: r.error || r.note || 'Nothing matched' })];
    }
    case 'add_task':
      return r.added
        ? [receiptRow(id(), { verb: 'added', kind: 'task', title: r.text, date: r.date })]
        : [failed('task', args.text)];
    case 'complete_task':
      return r.completed
        ? [receiptRow(id(), { verb: 'completed', kind: 'task', title: r.text, note: r.already ? 'Was already ticked off' : '' })]
        : [failed('task', args.text)];
    case 'remove_task':
      return r.removed ? [receiptRow(id(), { verb: 'removed', kind: 'task', title: r.text })] : [failed('task', args.text)];
    case 'add_habit':
      if (r.added) return [receiptRow(id(), { verb: 'added', kind: 'habit', title: r.name })];
      if (r.duplicate) return [receiptRow(id(), { verb: 'exists', kind: 'habit', title: r.name, note: r.note })];
      return [failed('habit', args.name)];
    case 'log_habit':
      return r.logged
        ? [receiptRow(id(), { verb: r.done ? 'completed' : 'updated', kind: 'habit', title: r.name, note: r.done ? 'Logged for today' : 'Unmarked for today' })]
        : [failed('habit', args.name)];
    case 'remove_habit':
      return r.removed ? [receiptRow(id(), { verb: 'removed', kind: 'habit', title: r.name })] : [failed('habit', args.name)];
    case 'add_stock':
      if (r.added) return [receiptRow(id(), { verb: r.already ? 'exists' : 'added', kind: 'stock', title: r.added, note: r.already ? 'Already on your watchlist' : '' })];
      return [failed('stock', args.symbol)];
    case 'remove_stock':
      return r.removed ? [receiptRow(id(), { verb: 'removed', kind: 'stock', title: r.removed })] : [failed('stock', args.symbol)];
    case 'remember':
      if (!r.remembered) return [failed('memory', args.fact)];
      return [receiptRow(id(), { verb: r.note ? 'exists' : 'noted', kind: 'memory', title: r.fact ?? args.fact, note: r.note })];
    case 'forget':
      if (r.error) return [failed('memory', args.about)];
      return [receiptRow(id(), { verb: 'removed', kind: 'memory', title: `Anything about “${args.about}”`, note: `${r.forgotten ?? 0} forgotten` })];
    case 'set_location':
      return r.location ? [receiptRow(id(), { verb: 'updated', kind: 'location', title: r.location, note: 'Weather and local news follow this' })] : [failed('location', args.location)];
    case 'add_packing_item':
      if (r.added) return [receiptRow(id(), { verb: 'added', kind: 'packing', title: r.item, note: r.trip })];
      if (r.duplicate) return [receiptRow(id(), { verb: 'exists', kind: 'packing', title: r.item, note: r.note })];
      return [failed('packing', args.item)];
    case 'check_packing_item':
      return r.item && !r.error
        ? [receiptRow(id(), { verb: r.checked ? 'completed' : 'updated', kind: 'packing', title: r.item, note: r.trip })]
        : [failed('packing', args.item)];
    default:
      return [];
  }
}

// How each outcome is counted in the receipt's subtitle, in reading order.
const TALLY = [
  ['added', 'added'],
  ['updated', 'updated'],
  ['removed', 'removed'],
  ['completed', 'done'],
  ['noted', 'noted'],
  ['exists', 'already there'],
  ['unclear', 'need a detail'],
  ['failed', 'didn’t work'],
];

/** The receipt card: every change this turn made, however many calls it took. */
export function actionsPanel(items) {
  const count = (verb) => items.filter((row) => row.verb === verb).length;
  const problems = count('failed') + count('unclear');
  return {
    kind: 'actions',
    // Shown for as long as the answer lasts and after it, whether or not the
    // reply names what was done — see voiceScript and useVoiceScript.
    receipt: true,
    title: !problems ? 'Done' : problems === items.length ? 'Not done' : 'Partly done',
    subtitle: TALLY.map(([verb, label]) => (count(verb) ? `${count(verb)} ${label}` : null))
      .filter(Boolean)
      .join(' · '),
    meta: { problems },
    keywords: topicKeywords(
      'added', 'booked', 'created', 'done', 'sorted', 'updated', 'moved', 'changed', 'removed', 'deleted',
      'cancelled', 'calendar', 'diary', 'to do list', 'tasks', 'watchlist', 'habit', 'packing list', 'noted',
    ),
    items,
  };
}

/**
 * Fold new receipt rows into a turn's cards: into the receipt already there, or
 * onto the end as a new one. A request that took two batches of calls still
 * gets one receipt.
 */
export function withReceipts(panels, rows) {
  if (!rows?.length) return panels;
  const index = panels.findIndex((panel) => panel.kind === 'actions');
  if (index < 0) return [...panels, actionsPanel(rows)];
  const next = [...panels];
  next[index] = actionsPanel([...panels[index].items, ...rows]);
  return next;
}
