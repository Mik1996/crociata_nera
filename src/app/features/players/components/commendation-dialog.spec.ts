import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { CommendationDialog, CommendationDialogData } from './commendation-dialog';
import { CommendationShareDialog } from './commendation-share-dialog';

async function renderWithDialog(data: CommendationDialogData) {
  TestBed.configureTestingModule({ providers: [{ provide: MAT_DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(CommendationDialog);
  // MatDialogModule gives the component a MatDialog of its own.
  const open = vi
    .spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
    .mockReturnValue(undefined as never);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, open };
}

async function render(data: CommendationDialogData): Promise<HTMLElement> {
  return (await renderWithDialog(data)).el;
}

describe('CommendationDialog', () => {
  // jsdom has no WebGL: the viewer shows the pre-rendered still for good.
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
    expect(el.querySelector('crn-medal-3d-viewer img.still')!.getAttribute('src')).toBe(
      'commendations/3d/champion-gold.webp',
    );
    expect(el.querySelector('crn-medal-3d-viewer img.fallback')).toBeNull();
  });

  it('shows a one-off commendation with its name and requirement, and no tier', async () => {
    const el = await render({ type: 'chiefHunter', tier: null, count: 2 });

    expect(el.querySelector('.title')!.textContent).toContain('Cacciatore di Capi');
    expect(el.querySelector('.title__tier')).toBeNull();
    expect(el.querySelector('.description')!.textContent).toContain('numero 1 avversario');
    expect(el.querySelector('crn-medal-3d-viewer img.still')!.getAttribute('src')).toBe('commendations/3d/chiefHunter.webp');
  });

  it('shows a medal never earned as locked', async () => {
    const el = await render({ type: 'wall', tier: 'bronze', count: 0 });

    expect(el.querySelector('.count')!.textContent).toContain('Non ancora conquistato');
    expect(el.querySelector('crn-medal-3d-viewer img.still')!.getAttribute('src')).toBe(
      'commendations/3d/wall-bronze-locked.webp',
    );
  });

  it('shows the period instead of a count when opened from one period', async () => {
    const el = await render({ type: 'wall', tier: 'silver', period: 'ottobre 2026' });

    expect(el.querySelector('.count')!.textContent!.trim()).toBe('ottobre 2026');
    expect(el.querySelector('crn-medal-3d-viewer img.still')!.getAttribute('src')).toBe(
      'commendations/3d/wall-silver.webp',
    );
  });

  it('offers no sharing for medals of other players', async () => {
    const el = await render({ type: 'wall', tier: 'silver', count: 2 });

    expect(el.querySelector('button.share')).toBeNull();
  });

  it('offers no sharing for a medal not earned yet, even of the own account', async () => {
    const el = await render({ type: 'wall', tier: 'silver', count: 0, share: { player: 'Arciere' } });

    expect(el.querySelector('button.share')).toBeNull();
  });

  it('opens the share card of an own medal with how many times it was earned', async () => {
    const { el, open } = await renderWithDialog({
      type: 'wall',
      tier: 'silver',
      count: 2,
      share: { player: 'Arciere' },
    });

    const button = el.querySelector<HTMLButtonElement>('button.share')!;
    expect(button.textContent).toContain('Condividi');
    button.click();

    expect(open).toHaveBeenCalledWith(
      CommendationShareDialog,
      expect.objectContaining({
        data: { type: 'wall', tier: 'silver', player: 'Arciere', detail: 'Conquistato 2 volte' },
      }),
    );
  });

  it('puts the period on the share card when opened from one period', async () => {
    const { el, open } = await renderWithDialog({
      type: 'chiefHunter',
      tier: null,
      period: 'ottobre 2026',
      share: { player: 'Arciere' },
    });

    el.querySelector<HTMLButtonElement>('button.share')!.click();

    expect(open).toHaveBeenCalledWith(
      CommendationShareDialog,
      expect.objectContaining({
        data: { type: 'chiefHunter', tier: null, player: 'Arciere', detail: 'ottobre 2026' },
      }),
    );
  });

  it('shows the flat medal when neither WebGL nor the still picture are available', async () => {
    const { el } = await renderWithDialog({ type: 'wall', tier: 'bronze', count: 0 });

    el.querySelector('crn-medal-3d-viewer img.still')!.dispatchEvent(new Event('error'));
    await TestBed.inject(ApplicationRef).whenStable();

    const fallback = el.querySelector('crn-medal-3d-viewer img.fallback')!;
    expect(fallback.getAttribute('src')).toBe('commendations/wall-bronze.svg');
    expect(fallback.classList).toContain('fallback--locked');
    expect(el.querySelector('crn-medal-3d-viewer img.still')).toBeNull();
  });
});
