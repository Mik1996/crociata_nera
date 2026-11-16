import { ResizableColumns } from './resizable-columns';
import { StickyTableHeader } from './sticky-table-header';
import { TableHorizontalScroll } from './table-horizontal-scroll';

/**
 * Behaviour of every table wrapper (`<div class="cn-table-wrap">`): sticky header, resizable
 * columns and, on narrow screens, a fade at the right edge while more columns follow.
 * Import this in any component with a table.
 */
export const TABLE_WRAP = [StickyTableHeader, ResizableColumns, TableHorizontalScroll] as const;
