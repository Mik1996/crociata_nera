import { fitInside } from './prepare-image';

describe('fitInside', () => {
  it('shrinks the longest side to the maximum, keeping the proportions', () => {
    expect(fitInside(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitInside(1170, 2532, 2000)).toEqual({ width: 924, height: 2000 });
  });

  it('never enlarges', () => {
    expect(fitInside(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });

  it('keeps at least one pixel', () => {
    expect(fitInside(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});
