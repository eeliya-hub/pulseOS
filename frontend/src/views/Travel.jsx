import {
  BedDouble,
  Check,
  Clock,
  CloudSun,
  Luggage,
  Plane,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import GlassCard from '../components/GlassCard.jsx';
import ViewHeader from '../components/ViewHeader.jsx';
import { AddRow, EditableAmount, EditableDate, EditableText, RemoveButton } from '../components/InlineEdit.jsx';
import { useTravelStore } from '../hooks/useTravelStore.js';

const HOME = { symbol: '£', tz: 'Europe/London' };
const DEST = { symbol: '¥' };
const QUICK_AMOUNTS = [20, 50, 100, 250];

const defaultPacking = [
  { id: 'p1', label: 'Passport & JR Pass', done: true },
  { id: 'p2', label: 'Power adapter (Type A)', done: false },
  { id: 'p3', label: 'Portable charger', done: false },
  { id: 'p4', label: 'eSIM / pocket wifi', done: false },
  { id: 'p5', label: 'Light rain jacket', done: false },
  { id: 'p6', label: 'Comfortable walking shoes', done: true },
  { id: 'p7', label: 'Travel insurance printout', done: false },
];

const uid = () => Math.random().toString(36).slice(2, 9);

function useChecklist(storageKey, initial) {
  const [items, setItems] = useState(() => {
    try {
      const raw = window.localStorage?.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return initial;
  });

  useEffect(() => {
    try {
      window.localStorage?.setItem(storageKey, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, storageKey]);

  const toggle = (id) => setItems((list) => list.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const rename = (id, label) => setItems((list) => list.map((i) => (i.id === id ? { ...i, label } : i)));
  const add = (label) => setItems((list) => [...list, { id: uid(), label, done: false }]);
  const remove = (id) => setItems((list) => list.filter((i) => i.id !== id));
  return { items, toggle, rename, add, remove };
}

function hoursAhead(destTz, homeTz, date) {
  const hour = (tz) =>
    Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date));
  let diff = hour(destTz) - hour(homeTz);
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff;
}

export default function Travel() {
  const { data, setField, reset } = useTravelStore();
  const [now, setNow] = useState(() => new Date());
  const [amount, setAmount] = useState('50');
  const [activeDayId, setActiveDayId] = useState(null);
  const packing = useChecklist('pulse.travel.packing', defaultPacking);

  const activeDay = data.itinerary.find((day) => day.id === activeDayId) ?? data.itinerary[0] ?? null;

  const updateDay = (dayId, patch) =>
    setField('itinerary', data.itinerary.map((day) => (day.id === dayId ? { ...day, ...patch } : day)));

  const nextDate = () => {
    const last = data.itinerary[data.itinerary.length - 1];
    if (last?.date) {
      const d = new Date(`${last.date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      // Build YYYY-MM-DD from local parts — toISOString() would shift by the UTC offset.
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
    return data.start || '';
  };

  const addDay = () => {
    const day = {
      id: `day-${Date.now()}`,
      label: `Day ${data.itinerary.length + 1}`,
      date: nextDate(),
      items: [],
    };
    setField('itinerary', [...data.itinerary, day]);
    setActiveDayId(day.id);
  };

  const removeDay = (dayId) => {
    const remaining = data.itinerary.filter((day) => day.id !== dayId);
    setField('itinerary', remaining);
    if (activeDay?.id === dayId) setActiveDayId(remaining[0]?.id ?? null);
  };

  const mapDay = (dayId, mapItems) =>
    setField('itinerary', data.itinerary.map((day) => (day.id === dayId ? { ...day, items: mapItems(day.items) } : day)));

  const addTask = (dayId) =>
    mapDay(dayId, (items) => [...items, { id: `t-${Date.now()}`, time: '', title: 'New plan', done: false }]);
  const updateTask = (dayId, taskId, patch) =>
    mapDay(dayId, (items) => items.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
  const removeTask = (dayId, taskId) =>
    mapDay(dayId, (items) => items.filter((task) => task.id !== taskId));

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const start = new Date(`${data.start}T00:00:00`);
  const end = new Date(`${data.end}T00:00:00`);
  const daysToGo = Math.max(0, Math.ceil((start - now) / 86400000));
  const nights = Math.max(0, Math.round((end - start) / 86400000));
  const fmt = (date, opts) => new Intl.DateTimeFormat('en-GB', opts).format(date);

  const destTime = fmt(now, { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const destDate = fmt(now, { timeZone: data.timeZone, weekday: 'long', day: 'numeric', month: 'short' });
  const ahead = hoursAhead(data.timeZone, HOME.tz, now);

  const rate = Number(data.rate) || 0;
  const converted = Math.round((Number(amount) || 0) * rate);
  const packDone = packing.items.filter((i) => i.done).length;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        lead="Upcoming"
        accent="Travel"
        subtitle={`${data.city} · ${daysToGo} days to go`}
        action={
          <button
            type="button"
            onClick={reset}
            className="soft-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </button>
        }
      />

      <section className="my-auto grid max-h-[34rem] min-h-0 w-full flex-1 grid-cols-12 grid-rows-[1.1fr_1fr] gap-4">
        {/* Trip hero */}
        <GlassCard
          tone="cyan"
          className="relative col-span-8 flex min-h-0 flex-col justify-between overflow-hidden"
        >
          <div
            className="breathe pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(116,242,255,0.12), transparent 68%)' }}
            aria-hidden="true"
          />
          <div className="relative z-10">
            <span className="accent-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]">
              <Plane className="h-3 w-3" aria-hidden="true" />
              {daysToGo} days to go
            </span>
            <h1 className="display-type mt-3 text-5xl font-extralight tracking-wide text-white text-glow md:text-6xl">
              <EditableText
                value={data.city}
                onChange={(value) => setField('city', value)}
                aria-label="City"
                auto
              />
              {', '}
              <EditableText
                value={data.country}
                onChange={(value) => setField('country', value)}
                aria-label="Country"
                auto
              />
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-light text-white/58">
              <EditableDate
                value={data.start}
                onChange={(value) => setField('start', value)}
                aria-label="Start date"
              />
              <span aria-hidden="true">–</span>
              <EditableDate
                value={data.end}
                onChange={(value) => setField('end', value)}
                aria-label="End date"
              />
              <span>· {nights} nights</span>
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3">
            <TripInfo
              Icon={Plane}
              label={
                <span className="inline-flex items-baseline gap-1">
                  Flight
                  <EditableText
                    value={data.flightCode}
                    onChange={(value) => setField('flightCode', value)}
                    aria-label="Flight code"
                    auto
                  />
                </span>
              }
              value={data.flightRoute}
              onValue={(value) => setField('flightRoute', value)}
              sub={data.flightDetail}
              onSub={(value) => setField('flightDetail', value)}
            />
            <TripInfo
              Icon={BedDouble}
              label="Hotel"
              value={data.hotelName}
              onValue={(value) => setField('hotelName', value)}
              sub={data.hotelDetail}
              onSub={(value) => setField('hotelDetail', value)}
            />
          </div>
        </GlassCard>

        {/* Destination now — local time + weather */}
        <GlassCard tone="purple" delay={80} className="col-span-4 flex min-h-0 flex-col justify-between overflow-hidden">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {data.city} · local time
            </p>
            <p className="clock-figures mt-2 text-5xl font-extralight leading-none text-white text-glow">
              {destTime}
            </p>
            <p className="mt-1.5 text-xs text-white/50">{destDate}</p>
          </div>

          <div className="soft-row flex items-center gap-3 rounded-2xl p-3">
            <CloudSun className="h-8 w-8 shrink-0 text-cyan-100/85" strokeWidth={1.5} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="clock-figures flex items-baseline text-lg font-light leading-none text-white">
                <EditableAmount
                  value={data.weatherTemp}
                  onChange={(value) => setField('weatherTemp', value)}
                  aria-label="Temperature"
                  auto
                />
                °
              </p>
              <EditableText
                value={data.weatherCondition}
                onChange={(value) => setField('weatherCondition', value)}
                aria-label="Weather condition"
                className="mt-0.5 w-full text-xs text-white/50"
              />
            </div>
            <span className="ml-auto shrink-0 text-right text-[11px] font-medium text-white/45">
              {ahead >= 0 ? `+${ahead}h` : `${ahead}h`}
              <br />
              vs home
            </span>
          </div>
        </GlassCard>

        {/* Currency converter */}
        <GlassCard tone="green" delay={140} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">Currency</p>

          <div className="my-auto">
            <label className="flex items-baseline gap-2">
              <span className="text-lg font-light text-white/45">{HOME.symbol}</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                aria-label="Amount in pounds"
                className="clock-figures w-full min-w-0 bg-transparent text-3xl font-light text-white focus:outline-none"
              />
            </label>
            <div className="mt-2 flex items-baseline gap-2 border-t border-white/10 pt-2.5">
              <span className="text-lg font-light text-cyan-100/80">{DEST.symbol}</span>
              <span className="clock-figures truncate text-3xl font-light text-cyan-100">
                {converted.toLocaleString('en-GB')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  className="soft-button rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  {HOME.symbol}
                  {value}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 flex items-center gap-0.5 text-[10px] font-medium text-white/38">
            1 {HOME.symbol} = {DEST.symbol}
            <EditableAmount
              value={data.rate}
              onChange={(value) => setField('rate', value)}
              aria-label="Exchange rate"
              auto
              className="text-white/55"
            />
          </p>
        </GlassCard>

        {/* Packing checklist */}
        <GlassCard tone="amber" delay={200} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
              <Luggage className="h-3.5 w-3.5" aria-hidden="true" />
              Packing
            </p>
            <span className="clock-figures text-xs font-medium text-white/48">
              {packDone}/{packing.items.length}
            </span>
          </div>

          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-200 to-cyan-200 transition-all duration-500"
              style={{ width: `${packing.items.length ? (packDone / packing.items.length) * 100 : 0}%` }}
            />
          </div>

          <div className="glass-scroll mt-2.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {packing.items.map((item) => (
              <div key={item.id} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-white/5">
                <button
                  type="button"
                  onClick={() => packing.toggle(item.id)}
                  className="flex shrink-0 items-center focus:outline-none"
                  aria-label={item.done ? 'Mark not packed' : 'Mark packed'}
                >
                  <span
                    className={[
                      'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-all',
                      item.done ? 'glow-ring border-cyan-100/60 bg-cyan-100/15' : 'border-white/28',
                    ].join(' ')}
                  >
                    {item.done && <Check className="h-3 w-3 text-cyan-100" aria-hidden="true" />}
                  </span>
                </button>
                <EditableText
                  value={item.label}
                  onChange={(value) => packing.rename(item.id, value)}
                  aria-label="Packing item"
                  className={`min-w-0 flex-1 text-[13px] font-medium ${item.done ? 'text-white/38 line-through' : 'text-white/78'}`}
                />
                <button
                  type="button"
                  onClick={() => packing.remove(item.id)}
                  aria-label="Remove"
                  className="shrink-0 rounded-md p-1 text-white/25 opacity-0 transition hover:text-white/70 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <PackAdd onAdd={packing.add} />
        </GlassCard>

        {/* Itinerary — pick a day, plan its to-do list with optional times */}
        <GlassCard delay={260} className="col-span-4 flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">Itinerary</p>
            {activeDay ? (
              <span className="clock-figures text-[11px] font-medium text-white/45">
                {activeDay.items.filter((task) => task.done).length}/{activeDay.items.length}
              </span>
            ) : null}
          </div>

          {/* Day toggle */}
          <div className="hide-scrollbar mt-2.5 flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5">
            {data.itinerary.map((day) => {
              const active = activeDay?.id === day.id;
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setActiveDayId(day.id)}
                  className={[
                    'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition focus:outline-none',
                    active ? 'accent-pill glow-ring' : 'soft-button text-white/55',
                  ].join(' ')}
                >
                  {day.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={addDay}
              aria-label="Add day"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-white/25 text-white/40 transition hover:border-cyan-100/55 hover:text-cyan-100/70 focus:outline-none"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>

          {activeDay ? (
            <>
              <div className="mt-2.5 flex shrink-0 items-center gap-2">
                <EditableText
                  value={activeDay.label}
                  onChange={(value) => updateDay(activeDay.id, { label: value })}
                  aria-label="Day label"
                  auto
                  className="text-[13px] font-medium text-white/85"
                />
                <span className="text-white/20" aria-hidden="true">
                  ·
                </span>
                <EditableDate
                  value={activeDay.date}
                  onChange={(value) => updateDay(activeDay.id, { date: value })}
                  aria-label="Day date"
                  className="text-[12px] text-cyan-100/70"
                />
                {data.itinerary.length > 1 ? (
                  <RemoveButton onClick={() => removeDay(activeDay.id)} label="Remove day" className="ml-auto" />
                ) : null}
              </div>

              <div className="glass-scroll mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                {activeDay.items.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-center gap-2 rounded-lg px-1 py-1.5 transition hover:bg-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => updateTask(activeDay.id, task.id, { done: !task.done })}
                      aria-label={task.done ? 'Mark not done' : 'Mark done'}
                      className="shrink-0 focus:outline-none"
                    >
                      <span
                        className={[
                          'grid h-[16px] w-[16px] place-items-center rounded-md border transition-all',
                          task.done ? 'glow-ring border-cyan-100/60 bg-cyan-100/15' : 'border-white/28',
                        ].join(' ')}
                      >
                        {task.done && <Check className="h-2.5 w-2.5 text-cyan-100" aria-hidden="true" />}
                      </span>
                    </button>
                    <input
                      type="time"
                      value={task.time ?? ''}
                      onChange={(event) => updateTask(activeDay.id, task.id, { time: event.target.value })}
                      aria-label="Time (optional)"
                      className="editable-field editable-date clock-figures w-[4.4rem] shrink-0 bg-transparent text-[11px] text-cyan-100/70 outline-none"
                    />
                    <EditableText
                      value={task.title}
                      onChange={(value) => updateTask(activeDay.id, task.id, { title: value })}
                      aria-label="Plan"
                      className={`min-w-0 flex-1 text-[13px] ${task.done ? 'text-white/35 line-through' : 'text-white/82'}`}
                    />
                    <RemoveButton onClick={() => removeTask(activeDay.id, task.id)} />
                  </div>
                ))}
                <AddRow label="Plan" onClick={() => addTask(activeDay.id)} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <AddRow label="Add your first day" onClick={addDay} />
            </div>
          )}
        </GlassCard>
      </section>
    </div>
  );
}

function TripInfo({ Icon, label, value, onValue, sub, onSub }) {
  return (
    <div className="soft-row flex items-center gap-3 rounded-2xl p-3">
      <span className="glow-ring grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/6">
        <Icon className="h-4 w-4 text-cyan-100" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</p>
        <EditableText value={value} onChange={onValue} aria-label="Detail" className="w-full text-sm font-medium text-white/90" />
        <EditableText value={sub} onChange={onSub} aria-label="Note" className="w-full text-[11px] text-white/45" />
      </div>
    </div>
  );
}

function PackAdd({ onAdd }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText('');
  };
  return (
    <form onSubmit={submit} className="mt-2 flex shrink-0 items-center gap-1.5 border-t border-white/8 pt-2 pl-1">
      <Plus className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add item"
        className="w-full bg-transparent text-xs text-white placeholder:text-white/35 focus:outline-none"
      />
    </form>
  );
}
