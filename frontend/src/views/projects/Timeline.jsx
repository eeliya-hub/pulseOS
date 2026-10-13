import { useMemo } from 'react';
import { colourOf, dueState, timelineOf } from '../../services/projects/board.js';
import { readDate } from '../../services/mail/dates.js';

/**
 * The same cards, against time.
 *
 * One row per card that has a date, a bar from its start to its due, and a line
 * where today is. Cards with no date at all are not drawn — there is nowhere to
 * draw them — but they are counted at the foot, because a timeline that quietly
 * omits half the board is worse than one that admits it.
 *
 * The span, the bars and the undated count all come from `timelineOf`, which is
 * tested; this file is the picture of it.
 */
export default function ProjectTimeline({ project, cards, today, onOpenCard }) {
  const line = useMemo(() => timelineOf(cards, { today }), [cards, today]);

  // A column per day is unreadable past a few weeks, so the day width shrinks
  // as the span grows and the chart scrolls rather than squeezing to nothing.
  const dayWidth = line.days <= 21 ? 44 : line.days <= 60 ? 22 : 10;
  const width = line.days * dayWidth;
  const todayAt = Math.max(0, daysFrom(line.start, today)) * dayWidth;

  const months = useMemo(() => monthSpans(line.start, line.days), [line.start, line.days]);

  if (!line.bars.length) {
    return (
      <div className="proj-empty">
        <p className="t-title">Nothing has a date yet</p>
        <p className="t-meta mt-2 max-w-[26rem]">
          Give a card a start or a due date — on the card, or in the table — and it appears here.
          {line.undated ? ` ${line.undated} ${line.undated === 1 ? 'card is' : 'cards are'} waiting.` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="proj-timeline">
      <div className="proj-tl-scroll glass-scroll">
        <div className="proj-tl-inner" style={{ width: `${width}px` }}>
          {/* The months across the top, so a long span can still be read. */}
          <div className="proj-tl-months">
            {months.map((m) => (
              <span key={m.key} style={{ left: `${m.offset * dayWidth}px`, width: `${m.days * dayWidth}px` }}>
                {m.label}
              </span>
            ))}
          </div>

          {/* A line per week, faint, so a bar's length can be judged. */}
          <div className="proj-tl-grid" aria-hidden="true">
            {Array.from({ length: Math.ceil(line.days / 7) }, (_, i) => (
              <span key={i} style={{ left: `${i * 7 * dayWidth}px` }} />
            ))}
          </div>

          <div className="proj-tl-today" style={{ left: `${todayAt}px` }} aria-hidden="true">
            <span>Today</span>
          </div>

          <div className="proj-tl-rows">
            {line.bars.map(({ card, offset, length }) => {
              const state = dueState(card, today);
              const tint = colourOf(
                project.labels.find((l) => l.id === card.labels?.[0])?.colour ?? project.colour,
              ).hex;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpenCard(card.id)}
                  className={`proj-bar proj-bar--${state ?? 'plain'} ${card.done ? 'is-done' : ''} ${length * dayWidth < 110 ? 'is-short' : ''}`}
                  style={{
                    left: `${offset * dayWidth}px`,
                    width: `${length * dayWidth}px`,
                    '--bar': tint,
                  }}
                  title={`${card.title} · ${card.start ? `${readDate(card.start)} – ` : ''}${readDate(card.due ?? card.start)}`}
                >
                  <span className="truncate">{card.title || 'Untitled'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {line.undated ? (
        <p className="proj-tl-foot">
          {line.undated} {line.undated === 1 ? 'card has' : 'cards have'} no date, so {line.undated === 1 ? 'it is' : 'they are'} not drawn here.
        </p>
      ) : null}
    </div>
  );
}

const DAY = 86_400_000;
const daysFrom = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / DAY);

/** The months a span covers, each with where it starts and how long it runs. */
function monthSpans(start, days) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00`);
  for (let i = 0; i < days; i += 1) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    const last = out.at(-1);
    if (last?.key === key) last.days += 1;
    else {
      out.push({
        key,
        offset: i,
        days: 1,
        label: cursor.toLocaleDateString('en-GB', { month: 'long', year: out.length ? undefined : 'numeric' }),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
