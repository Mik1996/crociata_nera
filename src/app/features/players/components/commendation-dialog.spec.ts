import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CommendationDialog, CommendationDialogData } from './commendation-dialog';

async function render(data: CommendationDialogData): Promise<HTMLElement> {
  TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(CommendationDialog);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('CommendationDialog', () => {
  // jsdom has no WebGL: the viewer falls back to the flat medal.
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the medal with its name, tier, requirement and count', async () => {
    const el = await render({ type: 'champion', tier: 'gold', count: 3 });

    expect(el.querySelector('.title')!.textContent).toContain('Signore della Guerra');
    expect(el.querySelector('.title__tier')!.textContent).toContain('Oro');
    expect(el.querySelector('.count')!.textContent).toContain('Conquistato 3 volte');
    expect(el.querySelector('.description')!.textContent).toContain('1° posto');
    const fallback = el.querySelector<HTMLImageElement>('crn-medal-3d-viewer img.fallback')!;
    expect(fallback.getAttribute('src')).toBe('commendations/champion-gold.svg');
    expect(fallback.classList).not.toContain('fallback--locked');
  });

  it('shows a medal never earned as locked', async () => {
    const el = await render({ type: 'wall', tier: 'bronze', count: 0 });

    expect(el.querySelector('.count')!.textContent).toContain('Non ancora conquistato');
    expect(el.querySelector('crn-medal-3d-viewer img.fallback')!.classList).toContain('fallback--locked');
  });

  it('shows the period instead of a count when opened from one period', async () => {
    const el = await render({ type: 'wall', tier: 'silver', period: 'ottobre 2026' });

    expect(el.querySelector('.count')!.textContent).toContain('Periodo: ottobre 2026');
    expect(el.querySelector('crn-medal-3d-viewer img.fallback')!.classList).not.toContain('fallback--locked');
  });
});
