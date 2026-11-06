import { matchesText, sortRows } from './sort';

describe('sort utils', () => {
  const rows = [
    { name: 'Ragnar', stars: 4 },
    { name: 'arciere', stars: 6 },
    { name: 'Èlfa', stars: 1 },
  ];

  it('sorts numbers ascending and descending', () => {
    expect(sortRows(rows, { field: 'stars', direction: 'asc' }).map((r) => r.stars)).toEqual([1, 4, 6]);
    expect(sortRows(rows, { field: 'stars', direction: 'desc' }).map((r) => r.stars)).toEqual([6, 4, 1]);
  });

  it('sorts text ignoring case and accents', () => {
    expect(sortRows(rows, { field: 'name', direction: 'asc' }).map((r) => r.name)).toEqual([
      'arciere',
      'Èlfa',
      'Ragnar',
    ]);
  });

  it('without a direction keeps the original order without mutating the array', () => {
    const result = sortRows(rows, { field: 'stars', direction: '' });
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it('matchesText ignores case, accents and whitespace', () => {
    expect(matchesText('Re Artù', '  artu ')).toBe(true);
    expect(matchesText('Ragnar', 'xyz')).toBe(false);
  });
});
