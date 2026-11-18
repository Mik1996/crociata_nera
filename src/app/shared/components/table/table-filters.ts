import { matchesText } from '../../../core/utils/sort';

/** Value of a date filter bound: a day as written by `<input type="date">` (`YYYY-MM-DD`). */
export type IsoDay = string;

/** One choice of a select filter. `label` is a translation key (plain text works too). */
export interface TableFilterOption {
  value: string | number;
  label: string;
  /** Parameters of the translation of `label`. */
  params?: Record<string, unknown>;
}

/**
 * Filter of one column, shown in the filter row under the header. `value` reads what the filter
 * compares from a row; without it the row property named like the column is used.
 */
export type TableFilter<T> =
  | {
      /** Contains the text (case, accents and surrounding spaces ignored); any of several texts. */
      type: 'text';
      value?: (row: T) => string | readonly string[] | null | undefined;
      /** Translation key of the placeholder. */
      placeholder?: string;
    }
  | {
      /** Between a minimum and a maximum, both included and both optional. */
      type: 'number';
      value?: (row: T) => number | null | undefined;
    }
  | {
      /** From a day to a day, both included and both optional. */
      type: 'date';
      value?: (row: T) => Date | string | number | null | undefined;
    }
  | {
      /** Yes or no. */
      type: 'boolean';
      value?: (row: T) => boolean | null | undefined;
    }
  | {
      /** One of the chosen options (several allowed; none chosen means any). */
      type: 'select';
      options: readonly TableFilterOption[];
      value?: (row: T) => string | number | null | undefined;
    };

export type TableFilterType = TableFilter<unknown>['type'];

/** Filters by column id. */
export type TableFilters<T> = Readonly<Partial<Record<string, TableFilter<T>>>>;

export interface NumberRange {
  min: number | null;
  max: number | null;
}

export interface DayRange {
  from: IsoDay | null;
  to: IsoDay | null;
}

/** What the user entered in each filter, by type. */
export interface TableFilterValueByType {
  text: string;
  number: NumberRange;
  date: DayRange;
  boolean: boolean | null;
  select: readonly (string | number)[];
}

export type TableFilterValue = TableFilterValueByType[TableFilterType];

/** Values of the filters by column id; a missing column is not filtered. */
export type TableFilterValues = Readonly<Record<string, TableFilterValue | undefined>>;

/** True when the value restricts the rows (an empty field does not). */
export function isFilterActive(
  type: TableFilterType,
  value: TableFilterValue | undefined,
): boolean {
  if (value === undefined || value === null) return false;
  switch (type) {
    case 'text':
      return (value as string).trim() !== '';
    case 'number': {
      const { min, max } = value as NumberRange;
      return isNumber(min) || isNumber(max);
    }
    case 'date': {
      const { from, to } = value as DayRange;
      return !!from || !!to;
    }
    case 'boolean':
      return typeof value === 'boolean';
    case 'select':
      return (value as readonly unknown[]).length > 0;
  }
}

/** Number of columns whose filter restricts the rows. */
export function countActiveFilters<T>(filters: TableFilters<T>, values: TableFilterValues): number {
  return Object.entries(filters).filter(
    ([column, filter]) => filter && isFilterActive(filter.type, values[column]),
  ).length;
}

/** Rows passing every active filter, in the same order. */
export function applyFilters<T>(
  rows: readonly T[],
  filters: TableFilters<T>,
  values: TableFilterValues,
): readonly T[] {
  const active = Object.entries(filters).filter(
    (entry): entry is [string, TableFilter<T>] =>
      !!entry[1] && isFilterActive(entry[1].type, values[entry[0]]),
  );
  if (!active.length) return rows;
  return rows.filter((row) =>
    active.every(([column, filter]) => matchesFilter(row, column, filter, values[column]!)),
  );
}

/** Whether one row passes the filter of one column (the value must be active). */
export function matchesFilter<T>(
  row: T,
  column: string,
  filter: TableFilter<T>,
  value: TableFilterValue,
): boolean {
  const read = (filter.value ?? ((r: T) => (r as Record<string, unknown>)[column])) as (
    row: T,
  ) => unknown;
  const cell = read(row);

  switch (filter.type) {
    case 'text': {
      const query = value as string;
      const texts = Array.isArray(cell) ? cell : [cell];
      return texts.some((text) => text != null && matchesText(String(text), query));
    }
    case 'number': {
      const { min, max } = value as NumberRange;
      if (typeof cell !== 'number' || Number.isNaN(cell)) return false;
      return (!isNumber(min) || cell >= min) && (!isNumber(max) || cell <= max);
    }
    case 'date': {
      const { from, to } = value as DayRange;
      const time = toTime(cell);
      if (time === null) return false;
      const start = from ? dayStart(from) : null;
      const end = to ? dayStart(to, 1) : null;
      return (start === null || time >= start) && (end === null || time < end);
    }
    case 'boolean':
      return cell === value;
    case 'select':
      return (value as readonly (string | number)[]).includes(cell as string | number);
  }
}

/** The value of a filter with nothing entered. */
export function emptyFilterValue(type: TableFilterType): TableFilterValue {
  switch (type) {
    case 'text':
      return '';
    case 'number':
      return { min: null, max: null };
    case 'date':
      return { from: null, to: null };
    case 'boolean':
      return null;
    case 'select':
      return [];
  }
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function toTime(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value) {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
}

/** Local midnight of the day (`YYYY-MM-DD`), plus some days. */
function dayStart(day: IsoDay, plusDays = 0): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(+match[1], +match[2] - 1, +match[3] + plusDays).getTime();
}

/**
 * What a table that leaves filtering, sorting and paging to the backend (`serverSide`) asks for:
 * the active filters by column, the page (from 0) and its size, the sort column and direction.
 */
export interface TableQuery {
  filters: TableFilterValues;
  pageIndex: number;
  pageSize: number;
  sort: { active: string; direction: 'asc' | 'desc' | '' };
}

/** The values of the filters that restrict the rows, by column. */
export function activeFilterValues<T>(
  filters: TableFilters<T>,
  values: TableFilterValues,
): Record<string, TableFilterValue> {
  const active: Record<string, TableFilterValue> = {};
  for (const [column, filter] of Object.entries(filters)) {
    const value = values[column];
    if (filter && value !== undefined && isFilterActive(filter.type, value)) active[column] = value;
  }
  return active;
}

/**
 * Instants of a date filter for a backend: from the local midnight of the first day, before the
 * local midnight after the last day (ISO 8601).
 */
export function dayRangeInstants(range: DayRange | undefined): { from?: string; before?: string } {
  const from = range?.from ? dayStart(range.from) : null;
  const before = range?.to ? dayStart(range.to, 1) : null;
  return {
    ...(from !== null ? { from: new Date(from).toISOString() } : {}),
    ...(before !== null ? { before: new Date(before).toISOString() } : {}),
  };
}
