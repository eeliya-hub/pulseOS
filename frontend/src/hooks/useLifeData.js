import { useEffect, useState } from 'react';

// Local, persistent planner state for the Life Hub. There's no backend, so
// everything lives in localStorage. Events and todos are date-anchored and can
// recur; habits reset each day; projects hold their own to-do lists.

const STORAGE_KEY = 'pulse.life.v1';

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// Named calendars with Apple system-colour equivalents — an event belongs to one,
// and its colour on the grid comes from here. Mirrors the Apple Calendar model so
// it maps cleanly if/when this syncs to a real account.
export const CALENDARS = [
  { id: 'personal', name: 'Personal', color: '#FF453A' },
  { id: 'work', name: 'Work', color: '#0A84FF' },
  { id: 'uni', name: 'University', color: '#BF5AF2' },
  { id: 'family', name: 'Family', color: '#30D158' },
  { id: 'social', name: 'Social', color: '#FF9F0A' },
];

export const calendarColor = (id) =>
  (CALENDARS.find((cal) => cal.id === id) ?? CALENDARS[0]).color;

const uid = () => Math.random().toString(36).slice(2, 10);

// --- date helpers (local time, no timezone drift) ---------------------------
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The day an all-day event falls on, as a `YYYY-MM-DD` key. The backend sends
// all-day starts as bare days, but a stale cache (or a provider quirk) can hand
// over a full instant — reading that with local fields keeps it on the right day
// instead of slicing the UTC text and losing one.
export function allDayKey(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T00:00(?::00)?)?$/.test(value.trim())) {
    return value.trim().slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const atUtcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return atUtcMidnight
    ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    : dateKey(d);
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Does a date-anchored, possibly-recurring item land on the target day?
export function occursOn(item, targetKey) {
  if (!item.date) return false;
  if (item.date === targetKey) return true;
  const start = keyToDate(item.date);
  const target = keyToDate(targetKey);
  if (target < start) return false;
  switch (item.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return start.getDay() === target.getDay();
    case 'monthly':
      return start.getDate() === target.getDate();
    case 'yearly':
      return start.getDate() === target.getDate() && start.getMonth() === target.getMonth();
    default:
      return false;
  }
}

function seed() {
  const today = dateKey(new Date());
  const offsetKey = (days) => dateKey(new Date(Date.now() + days * 86400000));
  return {
    events: [
      { id: uid(), date: today, time: '10:00 – 11:00', title: 'Project Sync', place: 'Google Meet', repeat: 'weekly', calendar: 'work' },
      { id: uid(), date: today, time: '14:00 – 18:00', title: 'Tech Support Shift', place: 'Library IT Desk', repeat: 'weekly', calendar: 'work' },
      { id: uid(), date: today, time: '20:00', title: 'Gym', place: '', repeat: 'daily', calendar: 'personal' },
      { id: uid(), date: offsetKey(2), time: '13:00', title: 'Coffee with Maya', place: 'Soho', repeat: 'none', calendar: 'social' },
      { id: uid(), date: offsetKey(4), time: '09:00', title: 'HCI Lecture', place: 'Room 2.14', repeat: 'weekly', calendar: 'uni' },
    ],
    todos: [
      { id: uid(), date: today, label: 'Buy groceries', done: false, repeat: 'none' },
      { id: uid(), date: today, label: 'Call mom', done: false, repeat: 'none' },
    ],
    habits: [
      { id: uid(), label: 'Morning Workout' },
      { id: uid(), label: 'Read 20 pages' },
      { id: uid(), label: 'Drink 2L Water' },
    ],
    habitLog: {},
    projects: [
      {
        id: uid(),
        name: 'Pulse OS',
        due: null,
        todos: [
          { id: uid(), label: 'Weather card polish', done: true },
          { id: uid(), label: 'Life Hub rebuild', done: false },
        ],
      },
      {
        id: uid(),
        name: 'HCI Coursework',
        due: null,
        todos: [{ id: uid(), label: 'Prototype critique', done: false }],
      },
    ],
  };
}

/* ── Shared store ─────────────────────────────────────────────────────────── */

// One planner for the whole app.
//
// This used to be component state, so every caller — Home, the Life Hub, the
// chat assistant, voice mode — held its OWN copy and wrote the whole thing back
// to the same storage key. A task added by voice went into voice mode's copy,
// never reached the dashboard's, and was then erased the next time anything on
// the dashboard saved over it. Now there is one copy, and every view subscribes.

function loadLife() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw) return { ...seed(), ...JSON.parse(raw) };
  } catch {
    /* corrupt or unavailable — fall back to seed */
  }
  return seed();
}

let lifeState = loadLife();
const lifeSubscribers = new Set();

/** Apply a change computed from the planner as it is at this instant. */
function patch(updater) {
  lifeState = { ...lifeState, ...updater(lifeState) };
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(lifeState));
  } catch {
    /* storage disabled — non-fatal */
  }
  lifeSubscribers.forEach((fn) => fn(lifeState));
}

// Another tab saved: follow it, rather than overwrite it with our next change.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      lifeState = { ...seed(), ...JSON.parse(event.newValue) };
      lifeSubscribers.forEach((fn) => fn(lifeState));
    } catch {
      /* unreadable — keep what we have */
    }
  });
}

/** The planner as it is right now, for code outside React (the assistant's tools). */
export const getLifeData = () => lifeState;

/**
 * Every change the planner supports. Plain functions over the shared store, so
 * they are the same from a component, the chat assistant or voice mode — and
 * several made back to back each build on the last rather than on a stale copy.
 * Creators return what they created.
 */
export const lifeActions = {
  // --- events + todos -------------------------------------------------------
  addEvent({ title, time, place, date, repeat, calendar }) {
    const event = {
      id: uid(),
      title,
      time,
      place: place || '',
      date,
      repeat: repeat || 'none',
      calendar: calendar || 'personal',
    };
    patch((c) => ({ events: [...c.events, event] }));
    return event;
  },

  updateEvent(id, changes) {
    patch((c) => ({ events: c.events.map((e) => (e.id === id ? { ...e, ...changes } : e)) }));
  },

  removeEvent(id) {
    patch((c) => ({ events: c.events.filter((e) => e.id !== id) }));
  },

  addTodo({ label, date, repeat }) {
    const todo = { id: uid(), label, date, repeat: repeat || 'none', done: false };
    patch((c) => ({ todos: [...c.todos, todo] }));
    return todo;
  },

  toggleTodo(id) {
    patch((c) => ({ todos: c.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  },

  /** Set rather than flip — "mark it done" must not undo one that already is. */
  setTodoDone(id, done) {
    patch((c) => ({ todos: c.todos.map((t) => (t.id === id ? { ...t, done } : t)) }));
  },

  removeTodo(id) {
    patch((c) => ({ todos: c.todos.filter((t) => t.id !== id) }));
  },

  // --- habits (daily) -------------------------------------------------------
  addHabit(label) {
    const habit = { id: uid(), label };
    patch((c) => ({ habits: [...c.habits, habit] }));
    return habit;
  },

  removeHabit(id) {
    patch((c) => ({ habits: c.habits.filter((h) => h.id !== id) }));
  },

  toggleHabit(id, dayKey) {
    patch((c) => {
      const day = c.habitLog[dayKey] ?? [];
      const next = day.includes(id) ? day.filter((x) => x !== id) : [...day, id];
      return { habitLog: { ...c.habitLog, [dayKey]: next } };
    });
  },

  /** Set rather than flip, for the same reason as setTodoDone. */
  setHabitDone(id, dayKey, done) {
    patch((c) => {
      const day = (c.habitLog[dayKey] ?? []).filter((x) => x !== id);
      return { habitLog: { ...c.habitLog, [dayKey]: done ? [...day, id] : day } };
    });
  },

  // --- projects -------------------------------------------------------------
  addProject(name, due = null) {
    patch((c) => ({ projects: [...c.projects, { id: uid(), name, due, todos: [] }] }));
  },

  removeProject(id) {
    patch((c) => ({ projects: c.projects.filter((p) => p.id !== id) }));
  },

  addProjectTodo(projectId, label) {
    patch((c) => ({
      projects: c.projects.map((p) =>
        p.id === projectId ? { ...p, todos: [...p.todos, { id: uid(), label, done: false }] } : p,
      ),
    }));
  },

  toggleProjectTodo(projectId, todoId) {
    patch((c) => ({
      projects: c.projects.map((p) =>
        p.id === projectId
          ? { ...p, todos: p.todos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)) }
          : p,
      ),
    }));
  },
};

export function useLifeData() {
  const [data, setData] = useState(lifeState);

  useEffect(() => {
    lifeSubscribers.add(setData);
    setData(lifeState); // sync in case it changed before mount
    return () => lifeSubscribers.delete(setData);
  }, []);

  return { ...data, ...lifeActions };
}
