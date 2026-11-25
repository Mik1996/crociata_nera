import { TestBed } from '@angular/core/testing';
import { Medal3dImage } from './medal-3d-image';

async function render(locked = false) {
  const fixture = TestBed.createComponent(Medal3dImage);
  fixture.componentRef.setInput('svgUrl', 'commendations/wall-gold.svg');
  fixture.componentRef.setInput('locked', locked);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Medal3dImage', () => {
  it('shows the pre-rendered still 3D medal', async () => {
    const { el } = await render();

    expect(el.querySelector('img.medal')!.getAttribute('src')).toBe('commendations/3d/wall-gold.webp');
  });

  it('shows the dark still of a medal not earned yet', async () => {
    const { el } = await render(true);

    expect(el.querySelector('img.medal')!.getAttribute('src')).toBe('commendations/3d/wall-gold-locked.webp');
  });

  it('falls back to the flat medal, greyed out when locked, when the still cannot be loaded', async () => {
    const { fixture, el } = await render(true);

    el.querySelector('img.medal')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();

    const flat = el.querySelector('img.flat')!;
    expect(flat.getAttribute('src')).toBe('commendations/wall-gold.svg');
    expect(flat.classList).toContain('flat--locked');
    expect(el.querySelector('img.medal')).toBeNull();
  });
});
