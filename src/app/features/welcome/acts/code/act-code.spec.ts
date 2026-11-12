import { measureAct, staticMetrics } from '../../../../shared/scrolly/scrolly-math';
import { scrollReveal } from './act-code';

describe('scrollReveal', () => {
  it('unrolls a scroll that fits completely by the time it is centred', () => {
    // 600 px tall in an 800 px scrollport: centred at top = 100.
    expect(scrollReveal(measureAct(800, 600, 800))).toBe(0);
    expect(scrollReveal(measureAct(450, 600, 800))).toBe(300);
    expect(scrollReveal(measureAct(100, 600, 800))).toBe(600);
    expect(scrollReveal(measureAct(-200, 600, 800))).toBe(600);
  });

  it('keeps the lower roller inside the scrollport while a fitting scroll unrolls', () => {
    for (let top = 800; top >= 100; top -= 50) {
      expect(top + scrollReveal(measureAct(top, 600, 800))).toBeLessThanOrEqual(800);
    }
  });

  it('reveals a taller scroll down to a line near the bottom of the scrollport', () => {
    expect(scrollReveal(measureAct(800, 1200, 800))).toBe(0);
    expect(scrollReveal(measureAct(56, 1200, 800))).toBeCloseTo(600);
    expect(scrollReveal(measureAct(-1000, 1200, 800))).toBe(1200);
  });

  it('shows the whole scroll on a static page', () => {
    expect(scrollReveal(staticMetrics(500))).toBe(500);
  });
});
