import {
  applyFilters,
  countActiveFilters,
  emptyFilterValue,
  isFilterActive,
  TableFilters,
} from './table-filters';

interface Row {
  name: string;
  tag: string;
  stars: number | null;
  joined: string;
  active: boolean;
  role: string;
}

const ROWS: Row[] = [
  {
    name: 'Àlfa',
    tag: '#AAA',
    stars: 3,
    joined: '2026-01-10T20:00:00',
    active: true,
    role: 'leader',
  },
  {
    name: 'Beta',
    tag: '#BBB',
    stars: 1.5,
    joined: '2026-02-01T08:00:00',
    active: false,
    role: 'elder',
  },
  {
    name: 'Gamma',
    tag: '#CCC',
    stars: null,
    joined: '2026-03-05T12:00:00',
    active: true,
    role: 'member',
  },
];

const FILTERS: TableFilters<Row> = {
  name: { type: 'text', value: (r) => [r.name, r.tag] },
  stars: { type: 'number' },
  joined: { type: 'date' },
  active: { type: 'boolean' },
  role: {
    type: 'select',
    options: [
      { value: 'leader', label: 'Leader' },
      { value: 'elder', label: 'Elder' },
      { value: 'member', label: 'Member' },
    ],
  },
};

const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe('table filters', () => {
  it('keeps every row, in the same array, when no filter is active', () => {
    const values = {
      name: '  ',
      stars: { min: null, max: null },
      joined: { from: null, to: null },
      active: null,
      role: [],
    };
    expect(applyFilters(ROWS, FILTERS, values)).toBe(ROWS);
    expect(countActiveFilters(FILTERS, values)).toBe(0);
  });

  it('matches text ignoring case and accents, on any of the texts of the row', () => {
    expect(names(applyFilters(ROWS, FILTERS, { name: 'alf' }))).toEqual(['Àlfa']);
    expect(names(applyFilters(ROWS, FILTERS, { name: '#bb' }))).toEqual(['Beta']);
  });

  it('keeps numbers between the bounds, both included; rows without a number are left out', () => {
    expect(names(applyFilters(ROWS, FILTERS, { stars: { min: 1.5, max: null } }))).toEqual([
      'Àlfa',
      'Beta',
    ]);
    expect(names(applyFilters(ROWS, FILTERS, { stars: { min: null, max: 1.5 } }))).toEqual([
      'Beta',
    ]);
    expect(names(applyFilters(ROWS, FILTERS, { stars: { min: 0, max: 0 } }))).toEqual([]);
  });

  it('keeps dates between two days, both whole days included', () => {
    expect(
      names(applyFilters(ROWS, FILTERS, { joined: { from: '2026-01-10', to: '2026-02-01' } })),
    ).toEqual(['Àlfa', 'Beta']);
    expect(
      names(applyFilters(ROWS, FILTERS, { joined: { from: '2026-02-02', to: null } })),
    ).toEqual(['Gamma']);
  });

  it('filters yes or no', () => {
    expect(names(applyFilters(ROWS, FILTERS, { active: false }))).toEqual(['Beta']);
    expect(names(applyFilters(ROWS, FILTERS, { active: true }))).toEqual(['Àlfa', 'Gamma']);
  });

  it('keeps the rows with one of the chosen options', () => {
    expect(names(applyFilters(ROWS, FILTERS, { role: ['leader', 'member'] }))).toEqual([
      'Àlfa',
      'Gamma',
    ]);
  });

  it('combines the filters of several columns', () => {
    const values = { active: true, stars: { min: 2, max: null } };
    expect(names(applyFilters(ROWS, FILTERS, values))).toEqual(['Àlfa']);
    expect(countActiveFilters(FILTERS, values)).toBe(2);
  });

  it('treats the empty value of every type as inactive', () => {
    for (const type of ['text', 'number', 'date', 'boolean', 'select'] as const)
      expect(isFilterActive(type, emptyFilterValue(type))).toBe(false);
  });
});
