import { closestDistance, MEDAL_FOV } from './medal-scene';

describe('closestDistance', () => {
  /** Largest apparent radius of a sphere seen from a distance, against the half field of view. */
  const fits = (radius: number, distance: number, halfFov: number) =>
    Math.asin(radius / distance) <= halfFov + 1e-9;
  const half = ((MEDAL_FOV / 2) * Math.PI) / 180;

  it('keeps the whole medal, thickness included, inside a square canvas', () => {
    for (const extent of [1, 1.32]) {
      const distance = closestDistance(extent, 1);
      expect(fits(Math.hypot(extent, 0.3), distance, half)).toBe(true);
    }
  });

  it('steps back on a narrow canvas, where the width is the limit', () => {
    expect(closestDistance(1, 0.5)).toBeGreaterThan(closestDistance(1, 1));
    expect(closestDistance(1, 2)).toBeCloseTo(closestDistance(1, 1));
  });
});
