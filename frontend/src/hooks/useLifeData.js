import { useCallback, useEffect, useState } from 'react';

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

export function useLifeData() {
  const [data, setData] = useState(() => {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) return { ...seed(), ...JSON.parse(raw) };
    } catch {
      /* corrupt or unavailable — fall back to seed */
    }
    return seed();
  });

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage disabled — non-fatal */
    }
  }, [data]);

  const patch = useCallback((updater) => setData((current) => ({ ...current, ...updater(current) })), []);

  // --- events + todos -------------------------------------------------------
  const addEvent = useCallback(
    ({ title, time, place, date, repeat, calendar }) =>
      patch((c) => ({
        events: [
          ...c.events,
          {
            id: uid(),
            title,
            time,
            place: place || '',
            date,
            repeat: repeat || 'none',
            calendar: calendar || 'personal',
          },
        ],
      })),
    [patch],
  );

  const updateEvent = useCallback(
    (id, changes) =>
      patch((c) => ({ events: c.events.map((e) => (e.id === id ? { ...e, ...changes } : e)) })),
    [patch],
  );

  const addTodo = useCallback(
    ({ label, date, repeat }) =>
      patch((c) => ({
        todos: [...c.todos, { id: uid(), label, date, repeat: repeat || 'none', done: false }],
      })),
    [patch],
  );

  const toggleTodo = useCallback(
    (id) =>
      patch((c) => ({ todos: c.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
    [patch],
  );

  const removeTodo = useCallback(
    (id) => patch((c) => ({ todos: c.todos.filter((t) => t.id !== id) })),
    [patch],
  );

  const removeEvent = useCallback(
    (id) => patch((c) => ({ events: c.events.filter((e) => e.id !== id) })),
    [patch],
  );

  // --- habits (daily) -------------------------------------------------------
  const addHabit = useCallback(
    (label) => patch((c) => ({ habits: [...c.habits, { id: uid(), label }] })),
    [patch],
  );

  const removeHabit = useCallback(
    (id) => patch((c) => ({ habits: c.habits.filter((h) => h.id !== id) })),
    [patch],
  );

  const toggleHabit = useCallback(
    (id, dayKey) =>
      patch((c) => {
        const day = c.habitLog[dayKey] ?? [];
        const next = day.includes(id) ? day.filter((x) => x !== id) : [...day, id];
        return { habitLog: { ...c.habitLog, [dayKey]: next } };
      }),
    [patch],
  );

  // --- projects -------------------------------------------------------------
  const addProject = useCallback(
    (name, due = null) =>
      patch((c) => ({ projects: [...c.projects, { id: uid(), name, due, todos: [] }] })),
    [patch],
  );

  const removeProject = useCallback(
    (id) => patch((c) => ({ projects: c.projects.filter((p) => p.id !== id) })),
    [patch],
  );

  const addProjectTodo = useCallback(
    (projectId, label) =>
      patch((c) => ({
        projects: c.projects.map((p) =>
          p.id === projectId ? { ...p, todos: [...p.todos, { id: uid(), label, done: false }] } : p,
        ),
      })),
    [patch],
  );

  const toggleProjectTodo = useCallback(
    (projectId, todoId) =>
      patch((c) => ({
        projects: c.projects.map((p) =>
          p.id === projectId
            ? { ...p, todos: p.todos.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)) }
            : p,
        ),
      })),
    [patch],
  );

  return {
    ...data,
    addEvent,
    updateEvent,
    addTodo,
    toggleTodo,
    removeTodo,
    removeEvent,
    addHabit,
    removeHabit,
    toggleHabit,
    addProject,
    removeProject,
    addProjectTodo,
    toggleProjectTodo,
  };
}
