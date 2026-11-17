import { z } from 'zod';
import { validate } from '@/lib/validation/parse';

/**
 * Tables of the site filtered, sorted and paged by the backend. A table is declared once
 * ({@link defineTable}): its columns, with the filter of each (text, number range, date range,
 * yes/no, options) and whether it sorts. From that come the query string it accepts (validated by
 * zod and documented in OpenAPI) and the rows it answers ({@link queryTable}).
 *
 * Query string (the same for every table):
 * - `page` (from 1) and `limit` (rows per page; left out: every row);
 * - `sort` (a sortable column) and `order` (`asc` / `desc`);
 * - one parameter per filter: text `<column>=abc`, number range `<column>Min` / `<column>Max`,
 *   date range `<column>From` / `<column>Before` (ISO 8601 instants), yes/no `<column>=true|false`,
 *   options `<column>=a,b` (any of them).
 *
 * The rows are built in memory (a few hundred at most) and filtered, sorted and paged there.
 */

export type TableFilterType = 'text' | 'number' | 'date' | 'boolean' | 'select';
export type SortOrder = 'asc' | 'desc';
type SortKey = string | number | null | undefined;

export interface TableColumn<T> {
  /** What the column holds, for the documentation of its parameters (e.g. "the opponent's name or tag"). */
  label: string;
  filter?: TableFilterType;
  /** Values a select filter accepts; any value when left out. */
  options?: readonly string[];
  /**
   * Value the filter reads from a row (text filters may read several texts); the row property
   * named like the column by default.
   */
  value?: (row: T) => unknown;
  /** The column sorts: `true` by its value, or by the key returned. */
  sort?: boolean | ((row: T) => SortKey);
}

export type TableColumns<T> = Readonly<Record<string, TableColumn<T>>>;

/** Most rows per page. */
export const MAX_TABLE_LIMIT = 500;

/** What a filter matches, by type. */
export type TableFilterValue =
  | { type: 'text'; text: string }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'date'; from?: Date; before?: Date }
  | { type: 'boolean'; value: boolean }
  | { type: 'select'; values: string[] };

export interface TableQuery {
  page: number;
  /** `null`: every row. */
  limit: number | null;
  sort: string;
  order: SortOrder;
  /** Active filters by column. */
  filters: Record<string, TableFilterValue>;
}

/** A page of rows. */
export interface TablePage<T> {
  items: T[];
  /** Rows matching the filters, on every page. */
  total: number;
  page: number;
  /** `null`: every row is in `items`. */
  limit: number | null;
}

export interface TableDefinition<T> {
  columns: TableColumns<T>;
  /** Sort when the query names none. */
  sort: string;
  order: SortOrder;
  /** Query string schema (to `extend` with the parameters of a route). */
  schema: z.ZodObject;
  /** The table query of a validated query string. */
  read(parsed: Record<string, unknown>): TableQuery;
}

/** `true` / `false` in a query string. */
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
/** Text filter: empty means no filter. */
const textQuery = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || undefined);
const instantQuery = z.iso.datetime({ offset: true }).optional();

/** Names of the query parameters of a filter. */
export function filterParams(column: string, type: TableFilterType): string[] {
  switch (type) {
    case 'number':
      return [`${column}Min`, `${column}Max`];
    case 'date':
      return [`${column}From`, `${column}Before`];
    default:
      return [column];
  }
}

function selectQuery(options: readonly string[] | undefined) {
  const values = options?.length ? z.array(z.enum(options as [string, ...string[]])) : z.array(z.string().max(64)).max(50);
  return z
    .string()
    .transform((list) =>
      list
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    )
    .pipe(values)
    .optional();
}

/** Declares a table: its columns and its default sort. */
export function defineTable<T>(columns: TableColumns<T>, defaults: { sort: string; order: SortOrder }): TableDefinition<T> {
  const sortable = Object.entries(columns)
    .filter(([, column]) => column.sort)
    .map(([id]) => id);
  if (!sortable.includes(defaults.sort)) throw new Error(`Default sort ${defaults.sort} is not a sortable column`);

  const shape: Record<string, z.ZodType> = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_TABLE_LIMIT).optional(),
    sort: z.enum(sortable as [string, ...string[]]).default(defaults.sort),
    order: z.enum(['asc', 'desc']).default(defaults.order),
  };
  for (const [id, column] of Object.entries(columns)) {
    if (!column.filter) continue;
    const [first, second] = filterParams(id, column.filter);
    switch (column.filter) {
      case 'text':
        shape[first!] = textQuery;
        break;
      case 'number':
        shape[first!] = z.coerce.number().optional();
        shape[second!] = z.coerce.number().optional();
        break;
      case 'date':
        shape[first!] = instantQuery;
        shape[second!] = instantQuery;
        break;
      case 'boolean':
        shape[first!] = booleanQuery.optional();
        break;
      case 'select':
        shape[first!] = selectQuery(column.options);
        break;
    }
  }

  return {
    columns,
    sort: defaults.sort,
    order: defaults.order,
    schema: z.object(shape),
    read: (parsed) => readQuery(columns, parsed),
  };
}

/** Validates the query string of a table (400 `ERROR.INVALID_FIELD` on bad values). */
export function parseTableQuery<T>(request: Request, table: TableDefinition<T>): TableQuery {
  return table.read(validate(table.schema, Object.fromEntries(new URL(request.url).searchParams)));
}

function readQuery<T>(columns: TableColumns<T>, parsed: Record<string, unknown>): TableQuery {
  const filters: Record<string, TableFilterValue> = {};
  for (const [id, column] of Object.entries(columns)) {
    if (!column.filter) continue;
    const [first, second] = filterParams(id, column.filter).map((param) => parsed[param]);
    switch (column.filter) {
      case 'text':
        if (typeof first === 'string') filters[id] = { type: 'text', text: first };
        break;
      case 'number':
        if (first !== undefined || second !== undefined) {
          filters[id] = { type: 'number', min: first as number | undefined, max: second as number | undefined };
        }
        break;
      case 'date':
        if (first !== undefined || second !== undefined) {
          filters[id] = {
            type: 'date',
            from: first ? new Date(first as string) : undefined,
            before: second ? new Date(second as string) : undefined,
          };
        }
        break;
      case 'boolean':
        if (typeof first === 'boolean') filters[id] = { type: 'boolean', value: first };
        break;
      case 'select':
        if (Array.isArray(first) && first.length) filters[id] = { type: 'select', values: first as string[] };
        break;
    }
  }
  return {
    page: parsed.page as number,
    limit: (parsed.limit as number | undefined) ?? null,
    sort: parsed.sort as string,
    order: parsed.order as SortOrder,
    filters,
  };
}

/** The rows matching the filters, sorted (ties keep the order of `rows`) and paged. */
export function queryTable<T>(rows: readonly T[], table: TableDefinition<T>, query: TableQuery): TablePage<T> {
  const matching = filterRows(rows, table.columns, query.filters);
  const sorted = sortRows(matching, table.columns, query.sort, query.order);
  const items = query.limit === null ? sorted : sorted.slice((query.page - 1) * query.limit, query.page * query.limit);
  return { items, total: matching.length, page: query.page, limit: query.limit };
}

/** The rows passing every filter, in the same order. */
export function filterRows<T>(rows: readonly T[], columns: TableColumns<T>, filters: Record<string, TableFilterValue>): T[] {
  const active = Object.entries(filters).filter(([id]) => columns[id]?.filter);
  return rows.filter((row) => active.every(([id, filter]) => matches(cellValue(row, id, columns[id]!), filter)));
}

function cellValue<T>(row: T, id: string, column: TableColumn<T>): unknown {
  return column.value ? column.value(row) : (row as Record<string, unknown>)[id];
}

/** Lowercase, without accents and surrounding spaces. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
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

function matches(cell: unknown, filter: TableFilterValue): boolean {
  switch (filter.type) {
    case 'text': {
      const query = normalize(filter.text);
      const texts = Array.isArray(cell) ? cell : [cell];
      return texts.some((text) => text != null && normalize(String(text)).includes(query));
    }
    case 'number':
      if (typeof cell !== 'number' || Number.isNaN(cell)) return false;
      return (filter.min === undefined || cell >= filter.min) && (filter.max === undefined || cell <= filter.max);
    case 'date': {
      const time = toTime(cell);
      if (time === null) return false;
      return (!filter.from || time >= filter.from.getTime()) && (!filter.before || time < filter.before.getTime());
    }
    case 'boolean':
      return cell === filter.value;
    case 'select':
      return cell != null && filter.values.includes(String(cell));
  }
}

const COLLATOR = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

/** Sorted copy: numbers by value, texts alphabetically (case and accents ignored), empty values last. */
function sortRows<T>(rows: T[], columns: TableColumns<T>, sort: string, order: SortOrder): T[] {
  const column = columns[sort];
  if (!column?.sort) return rows;
  const key = typeof column.sort === 'function' ? column.sort : (row: T) => cellValue(row, sort, column) as SortKey;
  const sign = order === 'asc' ? 1 : -1;
  const keyed = rows.map((row, index) => ({ row, index, key: key(row) }));
  keyed.sort((a, b) => {
    const emptyA = a.key === null || a.key === undefined || Number.isNaN(a.key);
    const emptyB = b.key === null || b.key === undefined || Number.isNaN(b.key);
    if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1;
    const cmp =
      typeof a.key === 'number' && typeof b.key === 'number' ? a.key - b.key : COLLATOR.compare(String(a.key), String(b.key));
    return cmp * sign || a.index - b.index;
  });
  return keyed.map((entry) => entry.row);
}
