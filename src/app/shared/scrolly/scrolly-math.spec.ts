import { easeInOutCubic, easeOutCubic, measureAct, segment, staticMetrics, toRoman } from './scrolly-math';

describe('scrolly maths', () => {
  describe('measureAct (scrollport 800 px tall)', () => {
    it('runs the progress of a pinned act from its top at the top to its bottom at the bottom', () => {
      // 2400 px tall: pinned for 1600 px of scrolling.
      expect(measureAct(0, 2400, 800).progress).toBe(0);
      expect(measureAct(-800, 2400, 800).progress).toBe(0.5);
      expect(measureAct(-1600, 2400, 800).progress).toBe(1);
      expect(measureAct(-2000, 2400, 800).progress).toBe(1);
      expect(measureAct(300, 2400, 800).progress).toBe(0);
    });

    it('runs the progress of a short act from fully visible at the bottom to touching the top', () => {
      expect(measureAct(400, 400, 800).progress).toBe(0);
      expect(measureAct(200, 400, 800).progress).toBe(0.5);
      expect(measureAct(0, 400, 800).progress).toBe(1);
    });

    it('measures how the act enters and leaves, and its whole journey', () => {
      const entering = measureAct(600, 2400, 800);
      expect(entering.enter).toBe(0.25);
      expect(entering.exit).toBe(0);
      expect(entering.span).toBeCloseTo(200 / 3200);

      const leaving = measureAct(-2000, 2400, 800);
      expect(leaving.enter).toBe(1);
      expect(leaving.exit).toBe(0.5);
      expect(leaving.span).toBeCloseTo(2800 / 3200);
    });

    it('tells where the act is and whether it is close to the screen', () => {
      expect(measureAct(800, 400, 800)).toMatchObject({ state: 'before', near: true });
      expect(measureAct(1700, 400, 800)).toMatchObject({ state: 'before', near: false });
      expect(measureAct(-100, 400, 800)).toMatchObject({ state: 'active', near: true });
      expect(measureAct(-400, 400, 800)).toMatchObject({ state: 'after', near: true });
      expect(measureAct(-1300, 400, 800)).toMatchObject({ state: 'after', near: false });
    });

    it('copes with no scrollport', () => {
      const m = measureAct(0, 0, 0);
      expect([m.enter, m.progress, m.exit, m.span]).toEqual([1, 1, 0, 0]);
    });
  });

  it('gives the final state for static pages', () => {
    expect(staticMetrics(500)).toMatchObject({ enter: 1, progress: 1, exit: 0, height: 500, near: true });
  });

  it('maps a value inside a segment of the range', () => {
    expect(segment(0.1, 0.2, 0.6)).toBe(0);
    expect(segment(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(segment(0.9, 0.2, 0.6)).toBe(1);
    // Empty segment: a step.
    expect(segment(0.5, 0.5, 0.5)).toBe(1);
    expect(segment(0.4, 0.5, 0.5)).toBe(0);
  });

  it('eases from 0 to 1', () => {
    for (const ease of [easeOutCubic, easeInOutCubic]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it('writes roman numerals', () => {
    expect([0, 1, 2, 4, 6, 9, 14, 40, 1999].map(toRoman)).toEqual(['', 'I', 'II', 'IV', 'VI', 'IX', 'XIV', 'XL', 'MCMXCIX']);
  });
});
