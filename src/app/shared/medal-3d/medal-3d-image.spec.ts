import { TestBed } from '@angular/core/testing';
import { Medal3dImage } from './medal-3d-image';
import { MedalSnapshots } from './medal-snapshots.service';

async function render(snapshot: () => Promise<string | null>, locked = false) {
  TestBed.configureTestingModule({
    providers: [{ provide: MedalSnapshots, useValue: { snapshot: vi.fn(snapshot) } }],
  });
  const fixture = TestBed.createComponent(Medal3dImage);
  fixture.componentRef.setInput('svgUrl', 'commendations/wall-gold.svg');
  fixture.componentRef.setInput('finish', 'gold');
  fixture.componentRef.setInput('locked', locked);
  await fixture.whenStable();
  return {
    el: fixture.nativeElement as HTMLElement,
    snapshots: TestBed.inject(MedalSnapshots) as unknown as { snapshot: ReturnType<typeof vi.fn> },
  };
}

describe('Medal3dImage', () => {
  it('shows the still 3D medal once drawn, asking for it at its size', async () => {
    const { el, snapshots } = await render(async () => 'blob:medal');

    expect(el.querySelector('img.medal')!.getAttribute('src')).toBe('blob:medal');
    expect(snapshots.snapshot).toHaveBeenCalledWith('commendations/wall-gold.svg', 'gold', false, 104);
  });

  it('keeps the flat medal without WebGL, greyed out when locked', async () => {
    const { el } = await render(async () => null, true);

    const flat = el.querySelector('img.flat')!;
    expect(flat.getAttribute('src')).toBe('commendations/wall-gold.svg');
    expect(flat.classList).toContain('flat--locked');
    expect(el.querySelector('img.medal')).toBeNull();
  });
});
