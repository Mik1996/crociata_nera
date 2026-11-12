import { LOCKED_FINISH, MEDAL_FINISHES, resolveFinish } from './medal-finish';

describe('resolveFinish', () => {
  const root = document.documentElement;

  beforeEach(() => {
    // The palette tokens, as the global styles define them.
    root.style.setProperty('--cn-medal-3d-gold', '#f7c552');
    root.style.setProperty('--cn-medal-locked-dark', '#2a2d34');
  });

  afterEach(() => {
    root.style.removeProperty('--cn-medal-3d-gold');
    root.style.removeProperty('--cn-medal-locked-dark');
  });

  it('uses the built-in finish of a tier, with the colour read from the palette', () => {
    const { color, ...gold } = MEDAL_FINISHES.gold;
    expect(color).toBe('--cn-medal-3d-gold');
    expect(resolveFinish('gold', false)).toMatchObject({ ...gold, color: '#f7c552' });
    expect(resolveFinish('gold', false).clearcoat).toBeGreaterThan(resolveFinish('bronze', false).clearcoat);
  });

  it('leaves the colour empty when the palette is not loaded', () => {
    root.style.removeProperty('--cn-medal-3d-gold');
    expect(resolveFinish('gold', false).color).toBe('');
  });

  it('makes every locked medal dark, matte and non-metallic', () => {
    const { color: _, ...lockedFinish } = LOCKED_FINISH;
    for (const finish of ['bronze', 'silver', 'gold'] as const) {
      const locked = resolveFinish(finish, true);
      expect(locked).toMatchObject(lockedFinish);
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
