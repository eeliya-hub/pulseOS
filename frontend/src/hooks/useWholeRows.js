import { useLayoutEffect, useState } from 'react';

/**
 * Sizes a scrolling list to a whole number of rows, so its last visible row is
 * never cut in half by the edge of the column.
 *
 * `frameRef` goes on an element that fills the space available; `listRef` on the
 * scrolling list inside it (both are callback refs, so a list that mounts later
 * is picked up), whose children are the rows (or, for a grid, the
 * cells — every row is assumed to be as tall as the first). Returns the height to
 * give the list. Pair with `.whole-rows` so scrolling also stops on a row.
 */
export default function useWholeRows(itemCount) {
  const [frame, frameRef] = useState(null);
  const [list, listRef] = useState(null);
  const [height, setHeight] = useState();

  useLayoutEffect(() => {
    if (!frame || !list) return undefined;

    const measure = () => {
      const first = list.firstElementChild;
      if (!first) {
        setHeight(undefined);
        return;
      }
      const style = getComputedStyle(list);
      const gap = parseFloat(style.rowGap) || 0;
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      // Layout height, fractional (the root font size scales) and untouched by the rows' entrance transforms.
      const row = parseFloat(getComputedStyle(first).height) || first.offsetHeight;
      const rows = Math.max(1, Math.floor((frame.clientHeight - padding + gap) / (row + gap)));
      setHeight(rows * row + (rows - 1) * gap + padding);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    return () => observer.disconnect();
  }, [frame, list, itemCount]);

  return { frameRef, listRef, height };
}
