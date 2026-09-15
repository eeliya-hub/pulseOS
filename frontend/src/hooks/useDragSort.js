import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag-to-reorder for a row or a grid of tiles.
 *
 * Deliberately not HTML5 drag-and-drop. That API hands you the browser's own
 * translucent snapshot instead of the real tile, and the obvious way to sort with
 * it — reorder on `dragover` — is a feedback loop: moving the tile changes what
 * is under the cursor, which fires another `dragover`, which moves it back. That
 * oscillation is what "doesn't reorder well" looks like.
 *
 * So: pointer events, and one measurement.
 *
 *  - Every tile's rectangle is measured ONCE, when the drag starts. Both the
 *    target slot and every tile's displacement are computed from those frozen
 *    rectangles, so nothing the drag does can feed back into the drag.
 *  - The DOM order never changes mid-drag. Tiles are moved with `transform`
 *    only — which is why they can glide rather than jump, and why the target
 *    index stays stable while they do.
 *  - The list is committed once, on release.
 *
 * @param {object} p
 * @param {number} p.count                 how many tiles are in the list
 * @param {(from:number, to:number)=>void} p.onReorder  called once, on drop
 */

const THRESHOLD = 4; // px of movement before a press becomes a drag, so taps still open
const EDGE = 44; // distance from the scroller's edge where auto-scroll starts
const EDGE_SPEED = 16; // px per frame at the very edge
const SETTLE_MS = 190; // the dragged tile's glide into its new slot
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/** Where tile `i` should appear once the dragged tile has moved from → to. */
function displayIndex(i, from, to) {
  if (from < to) return i > from && i <= to ? i - 1 : i;
  return i >= to && i < from ? i + 1 : i;
}

export function useDragSort({ count, onReorder }) {
  const nodes = useRef([]);
  const scroller = useRef(null);
  const drag = useRef(null);
  const raf = useRef(0);
  const settle = useRef(0);
  const [state, setState] = useState(null);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(settle.current);
    },
    [],
  );

  // Rectangles in the scroller's content space, so they stay valid if the list
  // scrolls underneath the drag.
  const measure = useCallback(() => {
    const box = scroller.current;
    const base = box ? box.getBoundingClientRect() : { left: 0, top: 0 };
    const sx = box ? box.scrollLeft : 0;
    const sy = box ? box.scrollTop : 0;
    return nodes.current.slice(0, count).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - base.left + sx, top: r.top - base.top + sy, w: r.width, h: r.height };
    });
  }, [count]);

  const update = useCallback((clientX, clientY) => {
    const d = drag.current;
    if (!d || d.settling) return;
    const box = scroller.current;

    // The tile rides with the content, so a scroll during the drag has to be
    // added back in to keep it under the cursor.
    const scrolledX = box ? box.scrollLeft - d.startScroll.x : 0;
    const scrolledY = box ? box.scrollTop - d.startScroll.y : 0;

    const b = box ? box.getBoundingClientRect() : { left: 0, top: 0 };
    const px = clientX - b.left + (box ? box.scrollLeft : 0);
    const py = clientY - b.top + (box ? box.scrollTop : 0);

    // Nearest slot centre. Measured before the drag began, so it can't chase
    // the tiles it is moving.
    let to = 0;
    let best = Infinity;
    d.rects.forEach((r, i) => {
      const dist = (r.left + r.w / 2 - px) ** 2 + (r.top + r.h / 2 - py) ** 2;
      if (dist < best) {
        best = dist;
        to = i;
      }
    });

    drag.current = {
      ...d,
      to,
      dx: clientX - d.startPointer.x + scrolledX,
      dy: clientY - d.startPointer.y + scrolledY,
      last: { x: clientX, y: clientY },
    };
    setState(drag.current);
  }, []);

  // Hold near an edge and the list scrolls, so a long grid can be reordered
  // without letting go.
  const tick = useCallback(() => {
    const d = drag.current;
    const box = scroller.current;
    if (!d || d.settling || !box) {
      raf.current = 0;
      return;
    }
    const b = box.getBoundingClientRect();
    const push = (pos, min, max) => {
      if (pos < min + EDGE) return -EDGE_SPEED * Math.min(1, (min + EDGE - pos) / EDGE);
      if (pos > max - EDGE) return EDGE_SPEED * Math.min(1, (pos - (max - EDGE)) / EDGE);
      return 0;
    };
    const vy = box.scrollHeight > box.clientHeight ? push(d.last.y, b.top, b.bottom) : 0;
    const vx = box.scrollWidth > box.clientWidth ? push(d.last.x, b.left, b.right) : 0;
    if (vx || vy) {
      const before = [box.scrollLeft, box.scrollTop];
      box.scrollLeft += vx;
      box.scrollTop += vy;
      if (box.scrollLeft !== before[0] || box.scrollTop !== before[1]) update(d.last.x, d.last.y);
    }
    raf.current = requestAnimationFrame(tick);
  }, [update]);

  const stop = useCallback(() => {
    drag.current = null;
    setState(null);
  }, []);

  const onPointerDown = useCallback(
    (index) => (event) => {
      // Left button only, nothing to sort in a list of one, and never start a
      // drag from one of the small controls sitting on top of a tile.
      if (event.button !== 0 || count < 2 || event.target.closest?.('[data-no-drag]')) return;

      const startPointer = { x: event.clientX, y: event.clientY };
      let started = false;

      const move = (e) => {
        if (!started) {
          if (Math.hypot(e.clientX - startPointer.x, e.clientY - startPointer.y) < THRESHOLD) return;
          started = true;
          const box = scroller.current;
          drag.current = {
            from: index,
            to: index,
            dx: 0,
            dy: 0,
            rects: measure(),
            startPointer,
            startScroll: { x: box?.scrollLeft ?? 0, y: box?.scrollTop ?? 0 },
            last: { x: e.clientX, y: e.clientY },
            settling: false,
          };
          setState(drag.current);
          if (!raf.current) raf.current = requestAnimationFrame(tick);
        }
        e.preventDefault(); // no text selection while dragging
        update(e.clientX, e.clientY);
      };

      const finish = () => {
        const d = drag.current;
        if (!d) return stop();
        if (d.from === d.to) return stop();
        // Glide into the new slot instead of vanishing from under the cursor and
        // reappearing somewhere else. The list is committed when it lands.
        const home = d.rects[d.from];
        const target = d.rects[d.to];
        drag.current = { ...d, settling: true, dx: target.left - home.left, dy: target.top - home.top };
        setState(drag.current);
        settle.current = window.setTimeout(() => {
          const done = drag.current;
          stop();
          if (done) onReorder(done.from, done.to);
        }, SETTLE_MS);
        return undefined;
      };

      const detach = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', abort);
        window.removeEventListener('keydown', onKey);
      };
      const up = () => {
        detach();
        // A drag ends with a click event on the tile — which would also launch
        // the app. Swallow that one click (and clean the trap up if, as on
        // touch, no click ever arrives).
        if (started) {
          const swallow = (e) => {
            e.stopPropagation();
            e.preventDefault();
          };
          window.addEventListener('click', swallow, { capture: true, once: true });
          window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
        }
        finish();
      };
      const abort = () => {
        detach();
        stop();
      };
      const onKey = (e) => {
        if (e.key === 'Escape') abort();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', abort);
      window.addEventListener('keydown', onKey);
    },
    [count, measure, onReorder, stop, tick, update],
  );

  /** Props for tile `index`: its ref, its transform, and the drag trigger. */
  const itemProps = useCallback(
    (index) => {
      const d = state;
      const isDragged = Boolean(d) && d.from === index;
      const style = { touchAction: 'none' };

      if (d && isDragged) {
        style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0)${d.settling ? '' : ' scale(1.05)'}`;
        style.transition = d.settling ? `transform ${SETTLE_MS}ms ${EASE}` : 'none';
        style.zIndex = 40;
        style.willChange = 'transform';
        // Nothing is hit-tested during a drag (slots come from geometry), and
        // this keeps hover styles off the tile in your hand.
        style.pointerEvents = 'none';
      } else if (d) {
        const home = d.rects[index];
        const slot = d.rects[displayIndex(index, d.from, d.to)];
        if (home && slot) style.transform = `translate3d(${slot.left - home.left}px, ${slot.top - home.top}px, 0)`;
        style.transition = `transform 200ms ${EASE}`;
      }

      return {
        ref: (el) => {
          nodes.current[index] = el;
        },
        // Anything natively draggable inside a tile (an icon is an <img>) would
        // hijack the press: the browser starts its own drag, fires pointercancel,
        // and this sort never sees a second pointermove.
        draggable: false,
        onDragStart: (e) => e.preventDefault(),
        onPointerDown: onPointerDown(index),
        style,
        'data-dragging': isDragged ? '' : undefined,
      };
    },
    [state, onPointerDown],
  );

  return {
    itemProps,
    /** Ref for the scrolling container the tiles live in (optional). */
    setScroller: (el) => {
      scroller.current = el;
    },
    dragging: state ? state.from : null,
    isDragging: Boolean(state),
  };
}
