import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const gridRef = useRef(null);
  // Set by the key handler, so focus is restored to wherever the keys landed —
  // including across a month change, which unmounts the cell it was on.
  const keyboarding = useRef(false);

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
   * Focus follows the selection, but only while it is already in here.
   *
   * Without this an arrow key moves the selection once and then stops: the
   * button it was on has gone to tabIndex -1 and nothing has taken the focus,
   * so the next keystroke reaches nobody. The guard is what stops this view
   * from stealing focus out of a dialogue, or off the search box, every time
   * the day changes for some other reason.
   */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (!keyboarding.current && !grid.contains(document.activeElement)) return;
    /*
     * The day may not be on screen yet. Moving into another month changes the
     * selection first and the month a render later, so the cell to focus does
     * not exist on this pass — hence waiting for it rather than giving up, and
     * why the month is in the dependencies as well as the day.
     */
    const cell = grid.querySelector(`[data-day="${selectedKey}"]`);
    if (!cell) return;
    keyboarding.current = false;
    cell.focus();
  }, [selectedKey, year, month]);

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

  /**
   * The arrow keys, because a calendar you cannot move around with them is a
   * picture of a calendar.
   *
   * Every one of these moves the SELECTION, and the view follows it — which is
   * both how a calendar has worked since they were drawn on paper, and the only
   * version that keeps working. Paging the view alone left the selected day in
   * a month no longer on screen, so its cell unmounted, the focus fell out to
   * the document, and the next keystroke went nowhere.
   */
  const KEYS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const onKeyDown = (event) => {
    const handled = event.key in KEYS || ['PageUp', 'PageDown', 'Home', 'End', 't', 'T'].includes(event.key);
    if (!handled || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    keyboarding.current = true;

    const from = keyToDate(selectedKey);
    const [y, m, d] = [from.getFullYear(), from.getMonth(), from.getDate()];

    if (event.key === 't' || event.key === 'T') return onPick(todayKey);
    if (event.key === 'Home') return onPick(dateKey(new Date(y, m, 1)));
    if (event.key === 'End') return onPick(dateKey(new Date(y, m + 1, 0)));
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      const next = m + (event.key === 'PageDown' ? 1 : -1);
      // The 31st of a month the next one does not have is its last day, not the
      // 3rd of the one after — which is what `new Date(y, m, 31)` would give.
      const last = new Date(y, next + 1, 0).getDate();
      return onPick(dateKey(new Date(y, next, Math.min(d, last))));
    }

    // Built from the parts rather than by adding milliseconds: the clocks go
    // back one Sunday a year, and 24 hours from Saturday is still Saturday.
    onPick(dateKey(new Date(y, m, d + KEYS[event.key])));
  };

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

      {/* One tab stop for the whole month, and the arrows move inside it —
          the roving tabindex below. Forty-two tab stops is not navigation. */}
      <div ref={gridRef} className="cal-grid" role="grid" aria-label="Month" onKeyDown={onKeyDown}>
        {cells.map(({ date, key, inMonth }) => {
          const dayEvents = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const weekend = date.getDay() === 0 || date.getDay() === 6;

          /*
           * Three are written, and the stylesheet hides the ones the cell is
           * too short for — a sixth of the grid is not much on a laptop and is
           * plenty on a desk monitor. The badge beside the date counts
           * EVERYTHING on the day, so it stays true however many of the three
           * the cell found room for.
           *
           * Ordered by time, so what is shown is the start of the day rather
           * than an arbitrary slice of it.
           */
          const shown = dayEvents.slice(0, 3);

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
                data-day={key}
                tabIndex={isSelected ? 0 : -1}
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
                    // A shortcut, not the way through: every one of these is a
                    // row with its own tab stop in the day beside the grid.
                    tabIndex={-1}
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
