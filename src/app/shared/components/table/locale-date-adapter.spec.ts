import { parseLocalDay } from './locale-date-adapter';

describe('parseLocalDay', () => {
  const day = (date: Date | null | undefined) =>
    date ? [date.getFullYear(), date.getMonth() + 1, date.getDate()] : date;

  it('reads day and month in the order of the language', () => {
    expect(day(parseLocalDay('01/02/2026', 'it-IT'))).toEqual([2026, 2, 1]);
    expect(day(parseLocalDay('1.2.26', 'es-ES'))).toEqual([2026, 2, 1]);
    expect(day(parseLocalDay('01/02/2026', 'en-US'))).toEqual([2026, 1, 2]);
  });

  it('rejects days that do not exist and ignores other texts', () => {
    expect(parseLocalDay('31/02/2026', 'it-IT')).toBeNull();
    expect(parseLocalDay('2026-02-01', 'it-IT')).toBeUndefined();
    expect(parseLocalDay('ieri', 'it-IT')).toBeUndefined();
  });
});
