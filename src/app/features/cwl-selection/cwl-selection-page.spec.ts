import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/backend/auth.service';
import { CwlSelection, CwlSelectionPlayer } from '../../core/backend/backend-api.types';
import { CwlSelectionService } from '../../core/backend/cwl-selection.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { CwlSelectionPage } from './cwl-selection-page';

function player(rank: number, status: CwlSelectionPlayer['status']): CwlSelectionPlayer {
  return {
    rank,
    tag: `#P${rank}`,
    name: `Player ${rank}`,
    role: rank === 1 ? 'coLeader' : 'member',
    townHallLevel: status === 'ineligible' ? 15 : 17,
    eligible: status !== 'ineligible' && status !== 'excluded',
    status,
    score: 100 - rank,
    breakdown: {
      cwlCommendations: 25,
      cwlPerformance: 15,
      war: 20,
      heroes: 12,
      townHall: 10,
      missedAttacks: rank === 2 ? -3 : 0,
      activity: rank === 3 ? -10 : 0,
    },
    war: {
      wars: 3,
      attacksUsed: 5,
      attacksAvailable: 6,
      averageStarsPerAttack: 2.6,
      averageDestruction: 91,
    },
    cwl: {
      allAttacks: rank === 1 ? 2 : 0,
      gold: rank === 1 ? 1 : 0,
      silver: 0,
      bronze: 0,
      wars: 7,
      attacks: rank === 2 ? 6 : 7,
      missed: rank === 2 ? 1 : 0,
      averageStarsPerAttack: 2.4,
      averageDestruction: 88,
    },
    heroes: rank === 4 ? null : { levels: 92, equipment: 80 },
    activity: {
      joinedAt: rank === 5 ? '2026-11-10T00:00:00.000Z' : null,
      newcomer: rank === 5,
      inactive: rank === 3,
      recentAttacks: rank === 3 ? 0 : 2,
    },
    exclusion:
      status === 'excluded'
        ? { reason: 'Away all month', excludedBy: 'boss', excludedAt: '2026-11-13T10:00:00.000Z' }
        : null,
  };
}

const SELECTION: CwlSelection = {
  generatedAt: '2026-11-14T10:00:00.000Z',
  starters: 15,
  reserves: 3,
  maxTownHall: 17,
  minEligibleTownHall: 16,
  seasons: ['2026-10', '2026-09'],
  warWindow: { from: '2026-08-16T10:00:00.000Z', days: 90, wars: 20 },
  players: [
    player(1, 'excluded'),
    ...Array.from({ length: 15 }, (_, i) => player(i + 2, 'starter')),
    ...[17, 18, 19].map((rank) => player(rank, 'reserve')),
    player(20, 'bench'),
    player(21, 'ineligible'),
  ],
};

describe('CwlSelectionPage', () => {
  /** With mock data (the default of the tests) the actions are shown, as for administrators. */
  async function render() {
    const service = {
      get: vi.fn(() => of(SELECTION)),
      exclude: vi.fn(),
      readmit: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideCocApiTest(),
        { provide: CwlSelectionService, useValue: service },
      ],
    });
    const fixture = TestBed.createComponent(CwlSelectionPage);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, service, fixture };
  }

  it('keeps the order of the ranking and highlights starters, reserves and excluded players', async () => {
    const { el } = await render();
    const rows = [...el.querySelectorAll<HTMLTableRowElement>('tr.mat-mdc-row')];
    expect(rows).toHaveLength(21);
    expect(rows.map((r) => r.querySelector('td.rank')!.textContent!.trim())).toEqual(
      SELECTION.players.map((p) => String(p.rank)),
    );
    expect(el.querySelectorAll('tr.row--starter')).toHaveLength(15);
    expect(el.querySelectorAll('tr.row--reserve')).toHaveLength(3);
    expect(rows[0].classList).toContain('row--excluded');
    expect(rows[19].className).not.toMatch(/row--(starter|reserve)/);
    expect(rows[20].classList).toContain('row--ineligible');
  });

  it('labels the status in words, shows the reason of an exclusion and the CWL medals', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].querySelector('.status')!.textContent).toContain('Escluso');
    expect(rows[0].querySelector('.reason')!.textContent).toContain('Away all month');
    expect(rows[1].querySelector('.status')!.textContent).toContain('Schierato');
    expect(rows[16].querySelector('.status')!.textContent).toContain('Riserva');
    expect(rows[0].querySelectorAll('crn-commendation-medal')).toHaveLength(2);
    expect(rows[0].textContent).toContain('Co-capo');
  });

  it('shows league attacks missed, penalties, new and inactive players and heroes', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[1].querySelector('.missing')!.textContent).toContain('1 saltati');
    expect(rows[1].querySelector('.penalty')!.textContent).toContain('-3');
    expect(rows[2].querySelector('.flag--alert')!.textContent).toContain('Inattivo in guerra');
    expect(rows[4].querySelector('.flag')!.textContent).toContain('Nuovo');
    expect(rows[3].textContent).toContain('In attesa');
    expect(rows[0].textContent).toContain('92%');
    // The score explains its parts.
    expect(rows[1].querySelector('.score')!.getAttribute('aria-label')).toContain(
      'Attacchi di Lega saltati: -3,0',
    );
  });

  it('explains the eligible town halls and the data considered', async () => {
    const { el } = await render();
    const facts = el.querySelector('.facts')!.textContent!;
    expect(facts).toContain('TH 16–17');
    expect(facts).toContain('Ultimi 90 giorni (20 guerre)');
    expect(el.querySelector('.legend')!.textContent).toContain('Esclusi: 1');
  });

  it('lets only administrators exclude and take back players', async () => {
    const { el, service, fixture } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows[1].querySelector('td.actions button')!.textContent).toContain('Escludi');
    const readmit = rows[0].querySelector<HTMLButtonElement>('td.actions button')!;
    expect(readmit.textContent).toContain('Riammetti');
    readmit.click();
    await fixture.whenStable();
    expect(service.readmit).toHaveBeenCalledWith('#P1');
    expect(service.get).toHaveBeenCalledTimes(2);
  });

  it('hides the actions from leaders who are not administrators', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideCocApiTest({ useMockApi: false }),
        { provide: CwlSelectionService, useValue: { get: () => of(SELECTION) } },
      ],
    });
    const fixture = TestBed.createComponent(CwlSelectionPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(AuthService).isAdmin()).toBe(false);
    expect(el.querySelector('tr.mat-mdc-row')).not.toBeNull();
    expect(el.querySelector('td.actions')).toBeNull();
  });
});
