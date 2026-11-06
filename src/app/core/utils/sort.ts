export type SortDirection = 'asc' | 'desc' | '';

export interface SortState {
  field: string;
  direction: SortDirection;
}

/**
 * Sorts a copy of the array by a field.
 * `accessor` allows mapping computed columns; otherwise the property with the same name is used.
 */
export function sortRows<T extends object>(
  rows: readonly T[],
  state: SortState,
  accessor?: (row: T, field: string) => string | number,
): T[] {
  if (!state.field || !state.direction) {
    return [...rows];
  }
  const read =
    accessor ?? ((row: T, field: string) => (row as Record<string, unknown>)[field] as string | number);
  const sign = state.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = read(a, state.field);
    const vb = read(b, state.field);
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'it', { sensitivity: 'base' });
    return cmp * sign;
  });
}

/** Lenient text match (case, accents, whitespace). */
export function matchesText(value: string, query: string): boolean {
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return normalize(value).includes(normalize(query));
}
