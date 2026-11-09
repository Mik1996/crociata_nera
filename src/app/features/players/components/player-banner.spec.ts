import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { PlayerCommendations, PlayerProfile } from '../../../core/models';
import { MedalSnapshots } from '../../../shared/medal-3d/medal-snapshots.service';
import { CommendationDialog } from './commendation-dialog';
import { PlayerBanner } from './player-banner';

const PROFILE = {
  tag: '#A',
  name: 'Arciere Nero',
  expLevel: 233,
  townHall: 16,
  trophies: 6081,
  bestTrophies: 6705,
  role: 'leader',
  clan: { tag: '#C', name: 'Crociata Nera', level: 20 },
  warPreference: 'in',
  labels: [],
} as unknown as PlayerProfile;

const COMMENDATIONS: PlayerCommendations = {
  month: '2026-10',
  items: [
    { type: 'wall', tier: 'silver' },
    { type: 'present', tier: 'bronze' },
  ],
};

async function render() {
  const snapshot = vi.fn(async (url: string) => `blob:${url}`);
  const dialog = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: MedalSnapshots, useValue: { snapshot } },
      { provide: MatDialog, useValue: dialog },
    ],
  });
  const fixture = TestBed.createComponent(PlayerBanner);
  fixture.componentRef.setInput('profile', PROFILE);
  fixture.componentRef.setInput('commendations', COMMENDATIONS);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, snapshot, dialog };
}

describe('PlayerBanner', () => {

  it('shows the commendations as still 3D medals in one row, without title or names', async () => {
    const { el, snapshot } = await render();

    const medals = el.querySelectorAll('.banner__medals > li.banner__medal');
    expect(medals).toHaveLength(2);
    expect(medals[0].querySelector('app-medal-3d-image img')!.getAttribute('src')).toBe(
      'blob:commendations/wall-silver.svg',
    );
    expect(snapshot).toHaveBeenCalledWith('commendations/present-bronze.svg', 'bronze', false, 80);
    // Named for screen readers and in the tooltip only.
    expect(medals[0].textContent!.trim()).toBe('');
    expect(medals[0].querySelector('button')!.getAttribute('aria-label')).toContain("Bastione d'Acciaio");
    // The list keeps its accessible name, the visible "Commendations" title is gone.
    expect(el.querySelector('.banner__medals')!.getAttribute('aria-label')).toBe('Encomi');
    expect(el.textContent).not.toMatch(/\bEncomi\b/);
  });

  it('shows the role but not the clan or the war preference', async () => {
    const { el } = await render();

    expect(el.querySelector('.chip--role')!.textContent).toContain('Capo');
    expect(el.querySelectorAll('.chip')).toHaveLength(1);
    expect(el.textContent).not.toContain('Crociata Nera');
  });

  it('opens the medal in 3D with the period it was earned in', async () => {
    const { el, dialog } = await render();

    el.querySelector<HTMLButtonElement>('.banner__medal-button')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());

    expect(dialog.open).toHaveBeenCalledWith(
      CommendationDialog,
      expect.objectContaining({
        data: { type: 'wall', tier: 'silver', period: expect.stringContaining('2026') },
        panelClass: ['cn-medal-dialog', 'cn-medal-dialog--silver'],
      }),
    );
  });
});
