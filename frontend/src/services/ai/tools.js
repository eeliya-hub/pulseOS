import { dateKey, keyToDate, occursOn } from '../../hooks/useLifeData.js';
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

// Flatten local + connected events into an upcoming list from now.
function buildUpcoming(life, calendar, days = 14) {
  const all = [...(life.events ?? []), ...(calendar.events ?? [])];
  const now = new Date();
  const todayKey = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = dateKey(d);
    for (const e of all) {
      if (!occursOn(e, key)) continue;
      const allDay = !firstTime(e.time);
      const mins = minutesOf(e.time);
      if (key === todayKey && !allDay && mins < nowMin) continue;
      out.push({
        date: key,
        day: fullDay(key),
        time: e.time || 'all day',
        title: e.title,
        where: e.place || e.calendarName || '',
        source: e.source || 'local',
        sortVal: i * 10000 + mins,
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
      const { life, calendar } = getData();
      return { events: buildUpcoming(life, calendar, Math.min(60, days || 14)).slice(0, 25) };
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

    async get_weather() {
      const { settings } = getData();
      const w = await getWeatherSummary(settings.location);
      return {
        location: w.location,
        temperature: w.temperature,
        condition: w.condition,
        high: w.high,
        low: w.low,
        feelsLike: w.feelsLike,
        wind: w.wind,
      };
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

    async create_calendar_event({ title, date, start_time, end_time, location } = {}) {
      const { calendar } = getData();
      const cal = (calendar.writableCalendars ?? [])[0];
      if (!cal) return { error: 'No writable calendar is connected — connect Google or Apple in the Life Hub first.' };
      const allDay = !start_time;
      const start = allDay ? `${date}T00:00:00` : `${date}T${start_time}:00`;
      const end = end_time
        ? `${date}T${end_time}:00`
        : allDay
          ? `${date}T00:00:00`
          : new Date(new Date(start).getTime() + 3_600_000).toISOString();
      await calendar.createEvent({ source: cal.source, calendarId: cal.id, title, location, start, end, allDay });
      return { created: true, title, date, calendar: cal.name };
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

    async open_app({ name } = {}) {
      await api.launch(name).catch(() => {});
      return { opened: name };
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
