import { ResizableColumns } from './resizable-columns';
import { StickyTableHeader } from './sticky-table-header';

/**
 * Behaviour of every table wrapper (`<div class="cn-table-wrap">`): sticky header and resizable
 * columns. Import this in any component with a table.
 */
export const TABLE_WRAP = [StickyTableHeader, ResizableColumns] as const;
