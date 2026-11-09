import { TestBed } from '@angular/core/testing';
import { MedalSnapshots } from './medal-snapshots.service';

describe('MedalSnapshots', () => {
  it('resolves to null without WebGL, without downloading anything, and caches the answer', async () => {
    // jsdom has no WebGL.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const snapshots = TestBed.inject(MedalSnapshots);

    const first = snapshots.snapshot('commendations/wall-gold.svg', 'gold', false, 104);
    expect(await first).toBeNull();
    expect(snapshots.snapshot('commendations/wall-gold.svg', 'gold', false, 104)).toBe(first);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
