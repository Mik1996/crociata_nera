import { wrapText } from './pdf-toolkit';

/** One unit per character. */
const measure = (text: string) => [...text].length;

describe('wrapText', () => {
  it('wraps words at the width and keeps the line breaks', () => {
    expect(wrapText('uno due tre quattro\ncinque', 9, measure)).toEqual([
      'uno due',
      'tre',
      'quattro',
      'cinque',
    ]);
  });

  it('keeps empty lines', () => {
    expect(wrapText('a\n\nb', 5, measure)).toEqual(['a', '', 'b']);
  });

  it('cuts a word longer than a line', () => {
    expect(wrapText('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
  });
});
