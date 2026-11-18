import { TableFilters, TableQuery } from './table-filters';
import { applyTableQuery, tableQueryParams } from './table-page';

const query = (overrides: Partial<TableQuery> = {}): TableQuery => ({
  filters: {},
  pageIndex: 0,
  pageSize: 0,
  sort: { active: '', direction: '' },
  ...overrides,
});

describe('tableQueryParams', () => {
  it('sends the page from 1, its size, the sort and one parameter per active filter', () => {
    const params = tableQueryParams(
      query({
        pageIndex: 2,
        pageSize: 25,
        sort: { active: 'stars', direction: 'desc' },
        filters: {
          name: '  ella ',
          empty: '',
          stars: { min: 1, max: null },
          won: false,
          result: ['victory', 'draw'],
          none: [],
          date: { from: '2026-11-01', to: '2026-11-30' },
        },
      }),
    );
    expect(params).toEqual({
      page: '3',
      limit: '25',
      sort: 'stars',
      order: 'desc',
      name: 'ella',
      starsMin: '1',
      won: 'false',
      result: 'victory,draw',
      // Local midnights, as instants.
      dateFrom: new Date(2026, 10, 1).toISOString(),
      dateBefore: new Date(2026, 11, 1).toISOString(),
    });
  });

  it('leaves out the size of a table without pages and an unsorted column', () => {
    expect(tableQueryParams(query({ sort: { active: 'stars', direction: '' } }))).toEqual({
      page: '1',
    });
  });
});

describe('applyTableQuery', () => {
  interface Row {
    name: string;
    stars: number | null;
  }
  const rows: Row[] = [
    { name: 'Alfa', stars: 2 },
    { name: 'Beta', stars: null },
    { name: 'Gamma', stars: 3 },
  ];
  const filters: TableFilters<Row> = { name: { type: 'text' }, stars: { type: 'number' } };

  it('filters, sorts with empty values last and pages, as the backend does', () => {
    const sorted = applyTableQuery(
      rows,
      filters,
      query({ sort: { active: 'stars', direction: 'asc' } }),
    );
    expect(sorted.items.map((r) => r.name)).toEqual(['Alfa', 'Gamma', 'Beta']);
    expect(sorted).toMatchObject({ total: 3, page: 1, limit: null });

    const paged = applyTableQuery(
      rows,
      filters,
      query({ pageIndex: 1, pageSize: 1, filters: { stars: { min: 2, max: null } } }),
      { summary: (matching) => matching.length },
    );
    expect(paged).toEqual({ items: [rows[2]], total: 2, page: 2, limit: 1, summary: 2 });
  });
});
