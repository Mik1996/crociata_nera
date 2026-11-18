/** Vertical scroll state of a scrolling box. */
export interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Where a wheel (or touchpad) movement over the table goes. */
export type WheelTarget = 'table' | 'page';

/** Below this distance from an edge, the edge counts as reached. */
const EDGE = 1;

/** Whether the box can still scroll by `delta` (positive: down). */
export function canScroll(box: ScrollBox, delta: number): boolean {
  return delta > 0
    ? box.scrollTop + box.clientHeight < box.scrollHeight - EDGE
    : box.scrollTop > EDGE;
}

/**
 * Who scrolls when the wheel moves over a table that scrolls inside a scrolling page:
 * - the table, only while it is entirely in view and can still scroll that way;
 * - the page otherwise: first it brings the table entirely into view, then it takes over as soon
 *   as the table reaches its top or bottom (in the same movement, which browsers do only on the
 *   next one), so the table never traps the scroll of the page.
 * When the page cannot scroll that way either, the table keeps it.
 */
export function wheelTarget(
  delta: number,
  table: ScrollBox,
  page: ScrollBox,
  tableInView: boolean,
): WheelTarget {
  if (tableInView && canScroll(table, delta)) return 'table';
  return canScroll(page, delta) ? 'page' : 'table';
}
