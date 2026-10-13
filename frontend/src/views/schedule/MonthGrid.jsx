import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ensureCalendarRange } from '../../hooks/useCalendarEvents.js';
import { calendarColor, dateKey, keyToDate, occursOn } from '../../hooks/useLifeData.js';

/**
 * The month, at the size a month deserves.
 *
 * What was here before was a row of pills with a dot under each day — which is
 * a date picker, not a calendar, and it sat in a column the same width as the
 * to-do list beside it. You could not look at this screen and see your week.
 *
 * This is the calendar: a cell per day, filling the height it is given, with
 * the events written in it rather than counted. A dot tells you something is on
 * and nothing else; a chip tells you it is the dentist at nine.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MonthGrid({ selectedKey, events, onPick, onOpenEvent }) {
  const [cursor, setCursor] = useState(() => {
    const d = keyToDate(selectedKey);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayKey = dateKey(new Date());

  useEffect(() => {
    const d = keyToDate(selectedKey);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [selectedKey]);

  // Whatever month is on screen has to be loaded; paging past what the
  // dashboard keeps to hand used to show empty days rather than fetching them.
  useEffect(() => {
    ensureCalendarRange(new Date(year, month - 1, 1), new Date(year, month + 2, 1));
  }, [year, month]);

  /*
   * Six rows, always, and the days either side of the month are drawn rather
   * than left blank. A grid that changes height as you page would move the
   * whole view under you, and an empty corner where the 30th should be reads as
   * a bug rather than as "that is next month".
   */
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date, key: dateKey(date), inMonth: date.getMonth() === month };
    });
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const cell of cells) {
      map.set(
        cell.key,
        events
          .filter((event) => occursOn(event, cell.key))
          .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
      );
    }
    return map;
  }, [cells, events]);

  const step = (by) => setCursor(new Date(year, month + by, 1));

  return (
    <div className="cal">
      <header className="cal-head">
        <h2 className="display-type cal-month">
          {cursor.toLocaleDateString('en-GB', { month: 'long' })}
          <span className="cal-year">{year}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="cal-step">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              onPick(todayKey);
            }}
            className="cal-today"
          >
            Today
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next month" className="cal-step">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="cal-grid" role="grid" aria-label="Month">
        {cells.map(({ date, key, inMonth }) => {
          const dayEvents = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const weekend = date.getDay() === 0 || date.getDay() === 6;

          /*
           * Two are written, and the stylesheet hides the second where the
           * cell is too short for it — a sixth of the grid is not much on a
           * laptop. The badge beside the date counts EVERYTHING on the day, so
           * it stays true whichever of the two the cell found room for.
           *
           * Ordered by time, so what is shown is the start of the day rather
           * than an arbitrary slice of it.
           */
          const shown = dayEvents.slice(0, 2);

          return (
            <div
              key={key}
              role="gridcell"
              className={[
                'cal-day',
                inMonth ? '' : 'is-outside',
                isToday ? 'is-today' : '',
                isSelected ? 'is-selected' : '',
                weekend ? 'is-weekend' : '',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => onPick(key)}
                className="cal-day-hit"
                aria-label={`${date.toDateString()}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
              >
                <span className="cal-num">{date.getDate()}</span>
                {dayEvents.length > 1 ? <span className="cal-more">{dayEvents.length}</span> : null}
              </button>

              <div className="cal-events">
                {shown.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent?.(event)}
                    className="cal-chip"
                    style={{ '--chip': event.color || calendarColor(event.calendar) }}
                    title={`${event.time ? `${event.time} · ` : ''}${event.title}`}
                  >
                    {event.time ? <span className="cal-chip-time">{event.time.slice(0, 5)}</span> : null}
                    <span className="truncate">{event.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
