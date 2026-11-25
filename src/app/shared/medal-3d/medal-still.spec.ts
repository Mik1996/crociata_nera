import { medalStillUrl } from './medal-still';

describe('medalStillUrl', () => {
  it('names the pre-rendered still after the flat SVG, in the 3d folder next to it', () => {
    expect(medalStillUrl('commendations/champion-gold.svg', false)).toBe('commendations/3d/champion-gold.webp');
    expect(medalStillUrl('commendations/chiefHunter.svg', true)).toBe('commendations/3d/chiefHunter-locked.webp');
  });
});
