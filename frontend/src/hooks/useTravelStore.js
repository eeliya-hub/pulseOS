import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pulse.travel.v2';

// Editable, persisted copy of the trip. Flat fields keep inline editing simple.
// The itinerary is a list of days, each holding its own to-do list of plans with
// an optional `time` — so a day can be toggled open for detailed planning.
export const travelDefaults = {
  city: 'Tokyo',
  country: 'Japan',
  start: '2026-08-20',
  end: '2026-09-02',
  timeZone: 'Asia/Tokyo',
  flightCode: 'BA007',
  flightRoute: 'LHR → HND',
  flightDetail: '20 Aug · 09:10',
  hotelName: 'Trunk Hotel · Yoyogi',
  hotelDetail: 'Check-in 15:00',
  weatherTemp: 29,
  weatherCondition: 'Warm · humid',
  rate: 189,
  itinerary: [
    {
      id: 'day-1',
      label: 'Day 1',
      date: '2026-08-20',
      items: [
        { id: 't-1', time: '09:10', title: 'Land at Haneda', done: false },
        { id: 't-2', time: '15:00', title: 'Hotel check-in · Yoyogi', done: false },
        { id: 't-3', time: '', title: 'Shibuya crossing walk', done: false },
        { id: 't-4', time: '19:30', title: 'Ramen reset', done: false },
      ],
    },
    {
      id: 'day-2',
      label: 'Day 2',
      date: '2026-08-21',
      items: [
        { id: 't-5', time: '', title: 'Harajuku & Omotesando', done: false },
        { id: 't-6', time: '13:00', title: 'Meiji Shrine', done: false },
        { id: 't-7', time: '', title: 'Coffee in Shimokitazawa', done: false },
      ],
    },
    {
      id: 'day-3',
      label: 'Day 3',
      date: '2026-08-22',
      items: [
        { id: 't-8', time: '10:00', title: 'teamLab Planets', done: false },
        { id: 't-9', time: '20:00', title: 'Roppongi dinner', done: false },
      ],
    },
    {
      id: 'day-4',
      label: 'Day 4',
      date: '2026-08-23',
      items: [{ id: 't-10', time: '08:00', title: 'Shinkansen day trip to Kyoto', done: false }],
    },
  ],
};

// Coerce any saved itinerary into the current nested shape (days → items) so a
// copy from an earlier data model can never crash the view. Legacy flat entries
// ({ day, title }) become a day holding a single task.
function normalizeItinerary(itinerary) {
  if (!Array.isArray(itinerary)) return travelDefaults.itinerary;
  return itinerary.map((day, index) => {
    const id = day?.id ?? `day-${index + 1}`;
    const label = day?.label ?? day?.day ?? `Day ${index + 1}`;
    const date = day?.date ?? '';
    if (Array.isArray(day?.items)) {
      const items = day.items.map((task, taskIndex) => ({
        id: task?.id ?? `t-${index}-${taskIndex}`,
        time: task?.time ?? '',
        title: task?.title ?? '',
        done: Boolean(task?.done),
      }));
      return { id, label, date, items };
    }
    // legacy flat shape: { id, day, title }
    const items = day?.title
      ? [{ id: `t-${index}-0`, time: '', title: day.title, done: false }]
      : [];
    return { id, label, date, items };
  });
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // merge over defaults so newly-added fields survive an older saved copy
      const merged = { ...travelDefaults, ...parsed };
      return { ...merged, itinerary: normalizeItinerary(merged.itinerary) };
    }
  } catch {
    // ignore malformed storage and seed fresh
  }
  return travelDefaults;
}

export function useTravelStore() {
  const [data, setData] = useState(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage unavailable — keep working in-memory
    }
  }, [data]);

  const setField = useCallback((key, value) => {
    setData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((listKey, id, patch) => {
    setData((prev) => ({
      ...prev,
      [listKey]: prev[listKey].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const addItem = useCallback((listKey, item) => {
    setData((prev) => ({
      ...prev,
      [listKey]: [...prev[listKey], { id: `${listKey}-${Date.now()}`, ...item }],
    }));
  }, []);

  const removeItem = useCallback((listKey, id) => {
    setData((prev) => ({
      ...prev,
      [listKey]: prev[listKey].filter((item) => item.id !== id),
    }));
  }, []);

  const reset = useCallback(() => setData(travelDefaults), []);

  return { data, setField, updateItem, addItem, removeItem, reset };
}
