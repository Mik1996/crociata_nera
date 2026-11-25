import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../../core/backend/auth.service';
import { PlayerCommendations, PlayerProfile } from '../../../core/models';
import { CommendationDialog } from './commendation-dialog';
import { PlayerBanner } from './player-banner';

const PROFILE = {
  tag: '#A',
  name: 'Arciere Nero',
  expLevel: 233,
  townHall: 16,
  trophies: 6081,
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

async function render(myTag = '#ME', commendations: PlayerCommendations = COMMENDATIONS) {
  const dialog = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialog, useValue: dialog },
      { provide: AuthService, useValue: { isMyPlayer: (tag: string) => tag === myTag } },
    ],
  });
  const fixture = TestBed.createComponent(PlayerBanner);
  fixture.componentRef.setInput('profile', PROFILE);
  fixture.componentRef.setInput('commendations', commendations);
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, dialog };
}

describe('PlayerBanner', () => {
  it('shows the commendations as still 3D medals in one row, without title or names', async () => {
    const { el } = await render();

    const medals = el.querySelectorAll('.banner__medals > li.banner__medal');
    expect(medals).toHaveLength(2);
    expect(medals[0].querySelector('crn-medal-3d-image img')!.getAttribute('src')).toBe(
      'commendations/3d/wall-silver.webp',
    );
    expect(medals[1].querySelector('crn-medal-3d-image img')!.getAttribute('src')).toBe(
      'commendations/3d/present-bronze.webp',
    );
    // Named for screen readers and in the tooltip only.
    expect(medals[0].textContent!.trim()).toBe('');
    expect(medals[0].querySelector('button')!.getAttribute('aria-label')).toContain(
      "Bastione d'Acciaio",
    );
    // The list keeps its accessible name, the visible "Commendations" title is gone.
    expect(el.querySelector('.banner__medals')!.getAttribute('aria-label')).toBe('Encomi');
    expect(el.textContent).not.toMatch(/\bEncomi\b/);
  });

  it('shows the role but not the clan or the war preference', async () => {
    const { el } = await render();

    expect(el.querySelector('.banner__role')!.textContent).toContain('Capo');
    expect(el.querySelectorAll('crn-tag')).toHaveLength(1);
    expect(el.textContent).not.toContain('Crociata Nera');
  });

  it('opens the medal in 3D with the period it was earned in', async () => {
    const { el, dialog } = await render();

    el.querySelector<HTMLButtonElement>('.banner__medal-button')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());

    expect(dialog.open).toHaveBeenCalledWith(
      CommendationDialog,
      expect.objectContaining({
        data: { type: 'wall', tier: 'silver', period: '1–31 ottobre 2026' },
        panelClass: ['cn-medal-dialog', 'cn-medal-dialog--silver'],
      }),
    );
  });

  it('lets the owner of the account share the medal, with the name of the account', async () => {
    const { el, dialog } = await render('#A');

    el.querySelector<HTMLButtonElement>('.banner__medal-button')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());

    expect(dialog.open).toHaveBeenCalledWith(
      CommendationDialog,
      expect.objectContaining({
        data: expect.objectContaining({ share: { player: 'Arciere Nero' } }),
      }),
    );
  });

  it('dates each medal with day, month and year of its period', async () => {
    const { el, dialog } = await render('#ME', {
      month: '2026-10',
      raidWeekend: { startTime: '2026-11-20T07:00:00.000Z', endTime: '2026-11-23T07:00:00.000Z' },
      cwlSeason: '2026-11',
      cwlDates: { startTime: '2026-11-03T08:00:00.000Z', endTime: '2026-11-11T08:00:00.000Z' },
      items: [
        { type: 'capitalRaider', tier: 'gold' },
        { type: 'cwlStriker', tier: 'silver' },
        { type: 'chiefHunter', tier: null },
      ],
      warEnds: { chiefHunter: '2026-11-18T19:30:00.000Z' },
    });

    const periods: string[] = [];
    for (const button of Array.from(el.querySelectorAll<HTMLButtonElement>('.banner__medal-button'))) {
      button.click();
      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(periods.length + 1));
      periods.push(dialog.open.mock.calls[periods.length]![1].data.period);
    }
    expect(periods).toEqual(['20–23 novembre 2026', 'CWL 3–11 novembre 2026', '18 novembre 2026']);
  });
});
