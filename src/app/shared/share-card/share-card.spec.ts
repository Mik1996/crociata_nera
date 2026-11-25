import { fitText, hashtagOf, shareCardFileName } from './share-card';

/** Every character as wide as the font size: easy widths to reason about. */
const measure = (text: string, size: number) => [...text].length * size;

describe('fitText', () => {
  it('keeps the largest size at which the text stays on one line', () => {
    expect(fitText('Signore', 700, 100, 40, 2, measure)).toEqual({ size: 100, lines: ['Signore'] });
    // 7 characters in 500 pixels: 70 is the largest even size that fits.
    expect(fitText('Signore', 500, 100, 40, 2, measure)).toEqual({ size: 70, lines: ['Signore'] });
  });

  it('wraps at the smallest size when even that is too wide', () => {
    expect(fitText('Fortezza Inespugnabile', 560, 60, 40, 2, measure)).toEqual({
      size: 40,
      lines: ['Fortezza', 'Inespugnabile'],
    });
  });

  it('ends the last line with an ellipsis beyond the lines allowed', () => {
    const fitted = fitText('uno due tre quattro', 160, 40, 40, 2, measure);

    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines[0]).toBe('uno');
    expect(fitted.lines[1]).toMatch(/…$/);
    expect(measure(fitted.lines[1]!, 40)).toBeLessThanOrEqual(160);
  });
});

describe('hashtagOf', () => {
  it('keeps letters and digits only', () => {
    expect(hashtagOf('Crociata Nera')).toBe('#CrociataNera');
    expect(hashtagOf("Crociata d'Oro")).toBe('#CrociatadOro');
  });
});

describe('shareCardFileName', () => {
  it('names the file after clan, medal and format, without accents or spaces', () => {
    expect(shareCardFileName('Crociata Nera', 'champion-gold', 'square')).toBe(
      'crociata-nera-champion-gold-square.png',
    );
    expect(shareCardFileName('Légion Été', 'chiefHunter', 'story')).toBe(
      'legion-ete-chiefHunter-story.png',
    );
  });
});
