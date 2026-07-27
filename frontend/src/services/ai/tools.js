import { dateKey, keyToDate, occursOn } from '../../hooks/useLifeData.js';
import { spotifyPlayer } from '../../hooks/useSpotifyPlayer.js';
import { api } from '../api/backendClient.js';
import { getWeatherSummary } from '../api/weather.js';

const firstTime = (t) => (t || '').match(/\d{1,2}:\d{2}/)?.[0] || '';
const minutesOf = (t) => {
  const m = firstTime(t);
  if (!m) return 0;
  const [h, mm] = m.split(':').map(Number);
  return h * 60 + mm;
};
const fullDay = (key) => keyToDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const clockTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

// Guard the music tools: return a friendly error object when the shared Spotify
// player can't play yet (not connected / not Premium / still starting up).
function musicNotReady() {
  const { status } = spotifyPlayer.getSnapshot();
  if (status === 'ready') return null;
  if (status === 'not-premium') return { error: 'In-app playback needs Spotify Premium.' };
  if (status === 'needs-auth' || status === 'error') {
    return { error: 'Spotify isn’t connected. Open the Music tab and connect Spotify first.' };
  }
  return { error: 'The Spotify player is still starting up — try again in a moment.' };
}

const ordinal = (n) => {
  if (n == null) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// Compress one followed team's card into a compact, accurate summary for the model.
function summarizeSport(follow, card) {
  if (!card || card.found === false) {
    return { team: follow.team, sport: follow.sport, note: 'No live data right now (may be off-season).' };
  }
  if (card.kind === 'f1') {
    return {
      sport: 'Formula 1',
      nextRace: card.fixture
        ? `${card.fixture.name} — ${card.fixture.date}${card.fixture.time ? ` ${card.fixture.time}` : ''}${card.fixture.venue ? ` (${card.fixture.venue})` : ''}`
        : null,
      lastRace: card.lastRace
        ? {
            race: card.lastRace.name,
            podium: (card.lastRace.podium ?? []).map((p) => `${p.position}. ${p.driver} (${p.team})`),
          }
        : null,
      driverStandings: (card.driverStandings ?? []).slice(0, 5).map((d) => `${d.position}. ${d.driverName} — ${d.points} pts`),
      constructorStandings: (card.constructorStandings ?? []).slice(0, 5).map((c) => `${c.position}. ${c.constructor} — ${c.points} pts`),
    };
  }
  const me = (card.standings ?? []).find((s) => s.me);
  return {
    team: card.name ?? follow.team,
    sport: card.sport ?? follow.sport,
    league: card.league,
    nextFixture: card.fixture
      ? `${card.fixture.name}${card.fixture.date ? ` — ${card.fixture.date}` : ''}${card.fixture.time ? ` ${card.fixture.time}` : ''}`
      : null,
    recentResults: (card.results ?? [])
      .slice(0, 5)
      .map((r) => `${r.homeTeam} ${r.homeScore ?? '–'}–${r.awayScore ?? '–'} ${r.awayTeam}`),
    standing: me
      ? `${ordinal(me.rank)} in ${card.league} — ${me.points} pts${
          me.record ? ` (${me.record})` : me.played != null ? ` (P${me.played} W${me.won} L${me.lost})` : ''
        }`
      : null,
  };
}

// Keep the news payload small — the model just needs headline, source + gist.
const trimArticles = (articles = []) =>
  articles.slice(0, 8).map((a) => ({
    title: a.title,
    source: a.source,
    publishedAt: a.publishedAt,
    summary: a.description,
    url: a.url,
  }));

// Flatten local + connected events that ALREADY happened into a most-recent-first
// list. Remote events are re-fetched for the requested window (the shared store
// only keeps this month onward); local events are expanded via their recurrence.
async function buildPast(life, settings, days = 14) {
  const now = new Date();
  const back = Math.min(120, Math.max(1, days || 14));
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const todayKey = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const feedUrls = (settings.icalFeeds ?? []).map((f) => f.url).filter(Boolean).join(',');
  const { events: remote = [] } = await api.calendar
    .events({ source: 'all', url: feedUrls, timeMin: start.toISOString(), timeMax: now.toISOString() })
    .catch(() => ({ events: [] }));

  const out = [];
  for (const e of remote) {
    const startD = e.start ? new Date(e.start) : null;
    if (!startD || Number.isNaN(startD.getTime()) || startD > now) continue;
    const key = e.allDay && typeof e.start === 'string' ? e.start.slice(0, 10) : dateKey(startD);
    out.push({
      date: key,
      day: fullDay(key),
      time: e.allDay ? 'all day' : clockTime(startD),
      title: e.title || '(untitled)',
      where: e.location || e.calendarName || '',
      source: e.source || 'remote',
      sortVal: startD.getTime(),
    });
  }

  // Local events (repeat by day) — walk back over each past day.
  for (let i = back; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dateKey(d);
    for (const e of life.events ?? []) {
      if (!occursOn(e, key)) continue;
      const mins = minutesOf(e.time);
      if (key === todayKey && mins > nowMin) continue; // still upcoming today
      out.push({
        date: key,
        day: fullDay(key),
        time: e.time || 'all day',
        title: e.title,
        where: e.place || '',
        source: e.source || 'local',
        sortVal: keyToDate(key).getTime() + mins * 60_000,
      });
    }
  }

  return out
    .sort((a, b) => b.sortVal - a.sortVal)
    .map((e) => ({ date: e.date, day: e.day, time: e.time, title: e.title, where: e.where, source: e.source }));
}

// Flatten local + connected events into an upcoming list from now. Remote events
// are re-fetched fresh for the requested window across ALL connected calendars +
// iCal feeds (not just the ~75-day dashboard cache), so the assistant genuinely
// sees everything on the user's schedule. The already-loaded calendar store is
// merged in (deduped) as a safety net, so a transient provider blip on the fresh
// fetch can't make the assistant claim "nothing on". Local events expand via
// recurrence.
async function buildUpcoming(life, calendar, settings, days = 14) {
  const now = new Date();
  const ahead = Math.min(120, Math.max(1, days || 14));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, 23, 59, 59);
  const endKey = dateKey(end);
  const todayKey = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const feedUrls = (settings.icalFeeds ?? []).map((f) => f.url).filter(Boolean).join(',');
  const { events: remote = [] } = await api.calendar
    .events({ source: 'all', url: feedUrls, timeMin: now.toISOString(), timeMax: end.toISOString() })
    .catch(() => ({ events: [] }));

  const out = [];
  const seen = new Set();
  const push = (e) => {
    const key = `${e.date}|${firstTime(e.time)}|${(e.title || '').trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };

  // 1. Fresh remote fetch (authoritative, spans every calendar incl. hidden ones).
  for (const e of remote) {
    const startD = e.start ? new Date(e.start) : null;
    if (!startD || Number.isNaN(startD.getTime())) continue;
    if (!e.allDay && startD < now) continue; // already finished today
    const key = e.allDay && typeof e.start === 'string' ? e.start.slice(0, 10) : dateKey(startD);
    if (key < todayKey) continue;
    push({
      date: key,
      day: fullDay(key),
      time: e.allDay ? 'all day' : clockTime(startD),
      title: e.title || '(untitled)',
      where: e.location || e.calendarName || '',
      source: e.source || 'remote',
      sortVal: startD.getTime(),
    });
  }

  // 2. The cached calendar store (already expanded) for the same window — covers
  //    anything the fresh fetch transiently missed. Dedup drops overlaps.
  for (const e of calendar?.events ?? []) {
    if (!e.date || e.date < todayKey || e.date > endKey) continue;
    const mins = minutesOf(e.time);
    if (e.date === todayKey && !e.allDay && mins < nowMin) continue;
    push({
      date: e.date,
      day: fullDay(e.date),
      time: e.allDay ? 'all day' : e.time || '',
      title: e.title,
      where: e.place || e.calendarName || '',
      source: e.source || 'remote',
      sortVal: keyToDate(e.date).getTime() + mins * 60_000,
    });
  }

  // 3. Local events (manually added, may repeat) — walk each day forward.
  for (let i = 0; i <= ahead; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(d);
    for (const e of life.events ?? []) {
      if (!occursOn(e, key)) continue;
      const allDay = !firstTime(e.time);
      const mins = minutesOf(e.time);
      if (key === todayKey && !allDay && mins < nowMin) continue;
      push({
        date: key,
        day: fullDay(key),
        time: e.time || 'all day',
        title: e.title,
        where: e.place || '',
        source: e.source || 'local',
        sortVal: keyToDate(key).getTime() + mins * 60_000,
      });
    }
  }

  return out
    .sort((a, b) => a.sortVal - b.sortVal)
    .map((e) => ({ date: e.date, day: e.day, time: e.time, title: e.title, where: e.where, source: e.source }));
}

/**
 * Builds the tool registry the AI agent executes against. `getData` returns the
 * live hook values ({ life, settings, update, calendar }) so tools always read
 * and write the latest app state.
 */
export function createToolExecutor(getData) {
  const tools = {
    async get_upcoming_events({ days } = {}) {
      const { life, calendar, settings } = getData();
      return { events: (await buildUpcoming(life, calendar, settings, Math.min(90, days || 14))).slice(0, 60) };
    },

    async get_past_events({ days } = {}) {
      const { life, settings } = getData();
      return { events: (await buildPast(life, settings, days)).slice(0, 25) };
    },

    async get_today() {
      const { life, calendar } = getData();
      const key = dateKey(new Date());
      const events = [...life.events, ...calendar.events]
        .filter((e) => occursOn(e, key))
        .sort((a, b) => minutesOf(a.time) - minutesOf(b.time))
        .map((e) => ({ time: e.time || 'all day', title: e.title, where: e.place || e.calendarName || '' }));
      const todos = life.todos.filter((t) => occursOn(t, key)).map((t) => ({ text: t.label, done: t.done }));
      return { date: key, events, todos };
    },

    async get_weather({ location } = {}) {
      const { settings } = getData();
      const place = (location || '').trim() || settings.location;
      const w = await getWeatherSummary(place);
      return {
        location: w.location,
        temperature: w.temperature,
        condition: w.condition,
        high: w.high,
        low: w.low,
        feelsLike: w.feelsLike,
        wind: w.wind,
        precipitation: w.precipitation,
        airQuality: w.airQuality,
      };
    },

    async get_sports({ team } = {}) {
      const { settings } = getData();
      const follows = settings.follows ?? [];
      const needle = (team || '').trim().toLowerCase();
      const picked = needle
        ? follows.filter((f) => `${f.team} ${f.leagueLabel} ${f.sport}`.toLowerCase().includes(needle))
        : follows;

      if (!picked.length) {
        return needle
          ? {
              error: `You're not following "${team}". Followed teams: ${follows.map((f) => f.team).join(', ') || 'none'}.`,
            }
          : { teams: [], note: 'No teams followed yet — add some in Settings.' };
      }

      const cards = await Promise.all(
        picked.map((f) =>
          api.sports
            .team(f.team, f.sport, f.leagueId, f.leagueLabel)
            .then((c) => summarizeSport(f, c))
            .catch(() => ({ team: f.team, sport: f.sport, note: 'Could not load right now.' })),
        ),
      );
      return { teams: cards };
    },

    async get_news({ query, scope } = {}) {
      const { settings } = getData();
      const q = (query || '').trim();
      // Local news uses free RSS feeds (always available); world search uses the
      // headlines/search provider, falling back to national RSS if it's not set up.
      try {
        if (scope === 'local') {
          const res = await api.news.local(settings.location || 'UK');
          let articles = res.articles ?? [];
          if (q) {
            const needle = q.toLowerCase();
            const hits = articles.filter((a) =>
              `${a.title || ''} ${a.description || ''}`.toLowerCase().includes(needle),
            );
            if (hits.length) articles = hits;
          }
          return { scope: 'local', place: res.place, articles: trimArticles(articles) };
        }

        const res = q ? await api.news.search(q) : await api.news.headlines({});
        return { scope: 'world', articles: trimArticles(res.articles ?? []) };
      } catch {
        // World provider needs an API key; fall back to the national RSS feed so
        // there is always live news rather than an error.
        try {
          const res = await api.news.local('UK');
          return { scope: 'national', place: res.place, articles: trimArticles(res.articles ?? []) };
        } catch {
          return { error: 'Could not fetch news right now.' };
        }
      }
    },

    async get_stocks() {
      const { settings } = getData();
      const symbols = settings.stocks ?? [];
      if (!symbols.length) return { stocks: [] };
      const { quotes } = await api.stocks.quotes(symbols).catch(() => ({ quotes: [] }));
      return {
        stocks: (quotes ?? []).map((q) => ({
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          changePercent: q.changePercent,
        })),
      };
    },

    async list_calendars() {
      const { calendar } = getData();
      return {
        calendars: (calendar.calendars ?? []).map((c) => ({
          name: c.name,
          source: c.source,
          canAddEvents: Boolean(c.writable),
        })),
      };
    },

    async create_calendar_event({ title, date, start_time, end_time, location, calendar: calName } = {}) {
      const { calendar } = getData();
      const writable = calendar.writableCalendars ?? [];
      if (!writable.length) {
        return { error: 'No writable calendar is connected — connect Google or Apple in the Life Hub first.' };
      }

      // Route to a named calendar (e.g. an Apple sub-calendar) when asked;
      // otherwise use the primary. Match exact name → contains → reverse-contains.
      let cal = writable[0];
      if (calName && calName.trim()) {
        const needle = calName.trim().toLowerCase();
        cal =
          writable.find((c) => (c.name || '').toLowerCase() === needle) ||
          writable.find((c) => (c.name || '').toLowerCase().includes(needle)) ||
          writable.find((c) => needle.includes((c.name || '').toLowerCase()));
        if (!cal) {
          return {
            error: `No calendar named "${calName}". You can add events to: ${writable.map((c) => c.name).join(', ')}.`,
          };
        }
      }

      const allDay = !start_time;
      const start = allDay ? `${date}T00:00:00` : `${date}T${start_time}:00`;
      const end = end_time
        ? `${date}T${end_time}:00`
        : allDay
          ? `${date}T00:00:00`
          : new Date(new Date(start).getTime() + 3_600_000).toISOString();
      await calendar.createEvent({ source: cal.source, calendarId: cal.id, title, location, start, end, allDay });
      return { created: true, title, date, calendar: cal.name, source: cal.source };
    },

    async delete_calendar_event({ title, date } = {}) {
      const { calendar } = getData();
      const needle = (title || '').toLowerCase();
      const matches = (calendar.events ?? []).filter(
        (e) => (e.title || '').toLowerCase().includes(needle) && (!date || e.date === date),
      );
      if (!matches.length) return { deleted: 0, note: 'No matching event found.' };
      const seen = new Set();
      let deleted = 0;
      for (const e of matches) {
        const key = e.recurringEventId || e.providerUrl || e.eventId;
        if (seen.has(key) || !e.writable) continue;
        seen.add(key);
        await calendar.deleteEvent(e, 'all');
        deleted += 1;
      }
      return { deleted, title };
    },

    async add_task({ text, date } = {}) {
      const { life } = getData();
      life.addTodo({ label: text, date: date || dateKey(new Date()), repeat: 'none' });
      return { added: true, text };
    },

    async complete_task({ text } = {}) {
      const { life } = getData();
      const needle = (text || '').toLowerCase();
      const todo = life.todos.find((t) => (t.label || '').toLowerCase().includes(needle) && !t.done);
      if (!todo) return { note: 'No matching open task found.' };
      life.toggleTodo(todo.id);
      return { completed: true, text: todo.label };
    },

    async add_habit({ name } = {}) {
      const { life } = getData();
      life.addHabit(name);
      return { added: true, name };
    },

    async set_location({ location } = {}) {
      getData().update({ location });
      return { location };
    },

    async add_stock({ symbol } = {}) {
      const { settings, update } = getData();
      const sym = (symbol || '').toUpperCase().trim();
      const current = settings.stocks ?? [];
      const next = current.includes(sym) ? current : [...current, sym];
      update({ stocks: next });
      return { watchlist: next };
    },

    // ── Long-term memory ─────────────────────────────────────────────────
    async remember({ fact } = {}) {
      const { settings, update } = getData();
      const text = (fact || '').trim();
      if (!text) return { error: 'Nothing to remember.' };
      const memories = settings.memories ?? [];
      // Skip near-duplicates so memory doesn't fill with restatements.
      const norm = text.toLowerCase();
      const dup = memories.some((m) => {
        const t = (m.text || '').toLowerCase();
        return t === norm || t.includes(norm) || norm.includes(t);
      });
      if (dup) return { remembered: true, note: 'Already knew something like that.' };
      const next = [
        ...memories,
        { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, at: Date.now() },
      ].slice(-200);
      update({ memories: next });
      return { remembered: true, fact: text };
    },

    async forget({ about } = {}) {
      const { settings, update } = getData();
      const needle = (about || '').trim().toLowerCase();
      if (!needle) return { error: 'Say what to forget.' };
      const memories = settings.memories ?? [];
      const kept = memories.filter((m) => !(m.text || '').toLowerCase().includes(needle));
      update({ memories: kept });
      return { forgotten: memories.length - kept.length };
    },

    async list_memories() {
      const { settings } = getData();
      return { memories: (settings.memories ?? []).map((m) => m.text) };
    },

    async open_app({ name } = {}) {
      await api.launch(name).catch(() => {});
      return { opened: name };
    },

    // ── Spotify playback (shared in-app player) ──────────────────────────
    async play_music({ query } = {}) {
      spotifyPlayer.ensureInit();
      const notReady = musicNotReady();
      if (notReady) return notReady;

      if (query && query.trim()) {
        const { tracks } = await api.music.search(query.trim()).catch(() => ({ tracks: [] }));
        const top = (tracks ?? [])[0];
        if (!top) return { error: `Couldn't find "${query}" on Spotify.` };
        await spotifyPlayer.controls.playContext({ uris: [top.uri] });
        return { playing: top.track, artists: Array.isArray(top.artists) ? top.artists.join(', ') : top.artists };
      }

      await spotifyPlayer.controls.resume();
      return { resumed: true };
    },

    async pause_music() {
      const notReady = musicNotReady();
      if (notReady) return notReady;
      await spotifyPlayer.controls.pause();
      return { paused: true };
    },

    async next_track() {
      const notReady = musicNotReady();
      if (notReady) return notReady;
      await spotifyPlayer.controls.next();
      return { skipped: true };
    },

    async previous_track() {
      const notReady = musicNotReady();
      if (notReady) return notReady;
      await spotifyPlayer.controls.previous();
      return { back: true };
    },

    async get_now_playing() {
      const s = spotifyPlayer.getSnapshot().state;
      if (!s || !s.track) return { playing: false };
      return { playing: !s.paused, paused: s.paused, track: s.track, artists: s.artists };
    },
  };

  return {
    async execute(name, args) {
      const fn = tools[name];
      if (!fn) return { error: `Unknown tool: ${name}` };
      try {
        return await fn(args || {});
      } catch (e) {
        return { error: e?.message || 'Tool failed' };
      }
    },
  };
}
