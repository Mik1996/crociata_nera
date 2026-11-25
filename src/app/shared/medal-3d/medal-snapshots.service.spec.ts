import { TestBed } from '@angular/core/testing';
import { MedalSnapshots } from './medal-snapshots.service';

describe('MedalSnapshots', () => {
  it('resolves to null without WebGL, without downloading anything, and caches the answer', async () => {
    // jsdom has no WebGL.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const snapshots = TestBed.inject(MedalSnapshots);

    const first = snapshots.still('commendations/wall-gold.svg', 'gold', 400);
    expect(await first).toBeNull();
    expect(snapshots.still('commendations/wall-gold.svg', 'gold', 400)).toBe(first);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
