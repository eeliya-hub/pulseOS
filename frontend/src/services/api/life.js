import { waitForMock } from './mockLatency.js';

export async function getLifeHubData() {
  // TODO: Replace with actual fetch to Google Calendar, Todoist, Notion, or university systems.
  await waitForMock(390);

  return {
    today: [
      { time: '09:00', title: 'Systems seminar', meta: 'Room 2.14', color: 'bg-cyan-300' },
      { time: '11:30', title: 'Finance sheet review', meta: 'Personal admin', color: 'bg-emerald-300' },
      { time: '14:00', title: 'Deep work: Pulse OS', meta: 'Focus block', color: 'bg-purple-300' },
      { time: '18:30', title: 'Gym', meta: 'Upper body', color: 'bg-pink-300' },
    ],
    tomorrow: [
      { time: '10:00', title: 'AI coursework sprint', meta: 'Draft evaluation', color: 'bg-purple-300' },
      { time: '13:00', title: 'Coffee with Maya', meta: 'Soho', color: 'bg-amber-300' },
      { time: '16:00', title: 'Portfolio polish', meta: 'Case study images', color: 'bg-cyan-300' },
    ],
    habits: [
      { id: 'hydrate', label: 'Hydration', streak: '12 day streak', done: true },
      { id: 'read', label: 'Read 20 pages', streak: '4 day streak', done: false },
      { id: 'run', label: 'Zone 2 cardio', streak: '2 sessions this week', done: false },
      { id: 'journal', label: 'Evening journal', streak: '8 day streak', done: true },
    ],
    deadlines: [
      { title: 'Machine Learning report', module: 'COMP3021', due: '12 Jun', priority: 'High' },
      { title: 'HCI prototype critique', module: 'COMP2060', due: '17 Jun', priority: 'Medium' },
      { title: 'Reading response', module: 'DES101', due: '21 Jun', priority: 'Low' },
    ],
  };
}
