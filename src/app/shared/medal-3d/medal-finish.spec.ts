import { LOCKED_FINISH, MEDAL_FINISHES, resolveFinish } from './medal-finish';

describe('resolveFinish', () => {
  it('uses the built-in finish of a tier', () => {
    expect(resolveFinish('gold', false)).toMatchObject(MEDAL_FINISHES.gold);
    expect(resolveFinish('gold', false).clearcoat).toBeGreaterThan(resolveFinish('bronze', false).clearcoat);
  });

  it('makes every locked medal dark, matte and non-metallic', () => {
    for (const finish of ['bronze', 'silver', 'gold'] as const) {
      const locked = resolveFinish(finish, true);
      expect(locked).toMatchObject(LOCKED_FINISH);
      expect(locked.color).toBe('#2a2d34');
      expect(locked.metalness).toBeLessThan(0.1);
      expect(locked.roughness).toBeGreaterThan(0.8);
    }
  });

  it('accepts a custom finish and fills in the optional values', () => {
    const emerald = resolveFinish({ color: '#1f9d6a', metalness: 0.7, roughness: 0.25 }, false);
    expect(emerald).toEqual({
      color: '#1f9d6a',
      metalness: 0.7,
      roughness: 0.25,
      clearcoat: 0,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1,
    });
  });
});
