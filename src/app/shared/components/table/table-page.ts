import { sortRows } from '../../../core/utils/sort';
import {
    applyFilters,
    DayRange,
    dayRangeInstants,
    NumberRange,
    TableFilters,
    TableFilterValue,
    TableQuery,
} from './table-filters';

/**
 * A page of a table filtered, sorted and paged by the backend (`GET` of a table route): the rows
 * of the page, how many match the filters on every page, and what the page needs besides the rows
 * (`summary`: totals for the footer, options of the filters…).
 */
export interface TablePage<T, S = undefined> {
  items: T[];
  total: number;
  /** From 1. */
  page: number;
  /** `null`: every matching row is in `items`. */
  limit: number | null;
  summary?: S;
}

/** Query parameters of a table route: a value is a string, empty filters are left out. */
export type TableParams = Record<string, string>;

/**
 * The query string of a table route for what the table asks (same format for every table, see
 * the backend's `lib/table/table-query.ts`): `page` (from 1) and `limit` (left out: every row),
 * `sort` and `order`, and one parameter per active filter, its kind read from its value:
 * text `name=abc`, number range `starsMin` / `starsMax`, date range `dateFrom` / `dateBefore`
 * (instants of the local days), yes/no `won=true`, options `result=victory,draw`.
 */
export function tableQueryParams(query: TableQuery): TableParams {
  const params: TableParams = { page: String(query.pageIndex + 1) };
  if (query.pageSize) params['limit'] = String(query.pageSize);
  if (query.sort.active && query.sort.direction) {
    params['sort'] = query.sort.active;
    params['order'] = query.sort.direction;
  }
  for (const [column, value] of Object.entries(query.filters)) {
    Object.assign(params, filterParams(column, value));
  }
  return params;
}

function filterParams(column: string, value: TableFilterValue | undefined): TableParams {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') return value.trim() ? { [column]: value.trim() } : {};
  if (typeof value === 'boolean') return { [column]: String(value) };
  if (Array.isArray(value)) return value.length ? { [column]: value.join(',') } : {};
  if ('min' in value) {
    const { min, max } = value as NumberRange;
    return {
      ...(min !== null ? { [`${column}Min`]: String(min) } : {}),
      ...(max !== null ? { [`${column}Max`]: String(max) } : {}),
    };
  }
  const { from, before } = dayRangeInstants(value as DayRange);
  return {
    ...(from ? { [`${column}From`]: from } : {}),
    ...(before ? { [`${column}Before`]: before } : {}),
  };
}

/**
 * What a backend table route does, done in the browser: for the demo data (`npm run start:mock`),
 * which has no backend. `sortKey` reads the value a column sorts by (the row property named like
 * the column by default); empty values come last.
 */
export function applyTableQuery<T extends object, S = undefined>(
  rows: readonly T[],
  filters: TableFilters<T>,
  query: TableQuery,
  options: {
    sortKey?: (row: T, column: string) => string | number | null | undefined;
    summary?: (matching: readonly T[]) => S;
  } = {},
): TablePage<T, S> {
  const matching = applyFilters(rows, filters, query.filters);
  const key =
    options.sortKey ?? ((row: T, column: string) => (row as Record<string, unknown>)[column]);
  const read = (row: T, column: string) => key(row, column) as string | number;
  const empty = (row: T) => {
    const value = query.sort.active ? key(row, query.sort.active) : 0;
    return value === null || value === undefined || Number.isNaN(value);
  };
  const sorted = query.sort.direction
    ? [
        ...sortRows(
          matching.filter((row) => !empty(row)),
          { field: query.sort.active, direction: query.sort.direction },
          read,
        ),
        ...matching.filter(empty),
      ]
    : [...matching];
  const size = query.pageSize;
  const start = query.pageIndex * size;
  return {
    items: size ? sorted.slice(start, start + size) : sorted,
    total: matching.length,
    page: query.pageIndex + 1,
    limit: size || null,
    ...(options.summary ? { summary: options.summary(matching) } : {}),
  };
}
