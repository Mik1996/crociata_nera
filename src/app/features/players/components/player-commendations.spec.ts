import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../../core/backend/auth.service';
import { EarnedCommendation } from '../../../core/backend/backend-api.types';
import { CommendationService } from '../../../core/services/commendation.service';
import { CommendationDialog } from './commendation-dialog';
import { PlayerCommendations } from './player-commendations';

describe('PlayerCommendations', () => {
  // The signed-in user owns the account #ME.
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { isMyPlayer: (tag: string) => tag === '#ME' } }],
    });
  });

  it('shows every medal with its name and count, greyscale when never earned', async () => {
    const counts: EarnedCommendation[] = [
      { id: '95000003', name: 'champion-gold', type: 'champion', tier: 'gold', quantity: 3 },
      { id: '95000022', name: 'present-bronze', type: 'present', tier: 'bronze', quantity: 1 },
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: CommendationService, useValue: { historyForPlayer: () => of(counts) } }],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#A');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const medals = Array.from(el.querySelectorAll<HTMLElement>('li.medal'));
    expect(medals).toHaveLength(32);
    const champion = medals.find((m) => m.querySelector('crn-medal-3d-image img')?.getAttribute('src') === 'commendations/champion-gold.svg')!;
    expect(champion.querySelector('.medal__name')!.textContent).toContain('Signore della Guerra');
    expect(champion.querySelector('.medal__count')!.textContent).toContain('3');
    expect(champion.classList).not.toContain('medal--none');
    expect(el.querySelectorAll('li.medal--none')).toHaveLength(30);
    expect(el.querySelector('.summary__total')!.textContent).toContain('4');

    // One description per graded commendation, under its three medals; none on the one-off rows.
    const summaries = el.querySelectorAll('.commendation-row__summary');
    expect(summaries).toHaveLength(9);
    expect(champion.closest('.commendation-row')!.querySelector('.commendation-row__summary')!.textContent).toContain(
      'Podio della classifica del mese',
    );
    expect(el.querySelector('.commendation-row--single .commendation-row__summary')).toBeNull();
  });

  it('shows a one-off commendation as a single medal on a panel of its colour, with its requirement', async () => {
    const counts: EarnedCommendation[] = [
      { id: '95000028', name: 'cwlAllAttacks', type: 'cwlAllAttacks', tier: null, quantity: 2 },
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: CommendationService, useValue: { historyForPlayer: () => of(counts) } }],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#A');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    // A row per one-off commendation, in its colour (the medals never earned in greyscale).
    // Order: Tra i Diecimila, Certezza di Lega, Guerra Perfetta, Cacciatore di Capi, Fortezza Inespugnabile.
    const single = Array.from(el.querySelectorAll('.commendation-row--single'));
    expect(single.map((row) => [...row.classList].find((c) => /--(?!single)/.test(c)))).toEqual([
      'commendation-row--obsidian',
      'commendation-row--crimson',
      'commendation-row--pearl',
      'commendation-row--sapphire',
      'commendation-row--emerald',
    ]);
    const hunter = single[3].querySelectorAll('li.medal');
    expect(hunter).toHaveLength(1);
    expect(hunter[0].classList).toContain('medal--none');
    expect(hunter[0].querySelector('crn-medal-3d-image img')?.getAttribute('src')).toBe('commendations/chiefHunter.svg');
    expect(hunter[0].querySelector('.medal__name')!.textContent).toContain('Cacciatore di Capi');
    const medals = single[1].querySelectorAll('li.medal');
    expect(medals).toHaveLength(1);
    expect(medals[0].querySelector('crn-medal-3d-image img')?.getAttribute('src')).toBe('commendations/cwlAllAttacks.svg');
    // No tier for a one-off commendation.
    expect(medals[0].querySelector('button')!.getAttribute('aria-label')).toMatch(/^Certezza di Lega: /);
    expect(medals[0].querySelector('.medal__name')!.textContent).toContain('Certezza di Lega');
    expect(medals[0].querySelector('.medal__count')!.textContent).toContain('2');
    expect(medals[0].querySelector('.medal__description')!.textContent).toContain('almeno 3 giornate');
  });

  it('keeps showing saved commendations that are not among the current ones, translated from type and tier', async () => {
    // A tier the current rules do not have (e.g. a retired "platinum"), with its translation still in place.
    const saved: EarnedCommendation[] = [
      { id: '95000003', name: 'champion-gold', type: 'champion', tier: 'gold', quantity: 1 },
      { id: '95000099', name: 'giantSlayer-platinum', type: 'giantSlayer', tier: 'platinum', quantity: 2 },
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: CommendationService, useValue: { historyForPlayer: () => of(saved) } }],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#A');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    // Without a translation for that key, the key itself is shown: the history is never lost.
    expect(el.querySelector('.others')!.textContent).toContain('commendations.giantSlayer.platinum');
    expect(el.querySelector('.others')!.textContent).toContain('2');
    expect(el.querySelector('.summary__total')!.textContent).toContain('3');
  });

  it('opens the medal in 3D when it is clicked', async () => {
    const counts: EarnedCommendation[] = [
      { id: '95000003', name: 'champion-gold', type: 'champion', tier: 'gold', quantity: 3 },
    ];
    const dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: CommendationService, useValue: { historyForPlayer: () => of(counts) } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#A');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const button = Array.from(el.querySelectorAll<HTMLButtonElement>('.medal__button')).find(
      (b) => b.querySelector('img')?.getAttribute('src') === 'commendations/champion-gold.svg',
    )!;
    expect(button.getAttribute('aria-label')).toContain('Guarda la medaglia in 3D');
    button.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());

    expect(dialog.open).toHaveBeenCalledWith(
      CommendationDialog,
      expect.objectContaining({ data: { type: 'champion', tier: 'gold', count: 3 } }),
    );
  });

  it("offers to share the medals of the user's own account, with its name", async () => {
    const counts: EarnedCommendation[] = [
      { id: '95000003', name: 'champion-gold', type: 'champion', tier: 'gold', quantity: 1 },
    ];
    const dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: CommendationService, useValue: { historyForPlayer: () => of(counts) } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#ME');
    fixture.componentRef.setInput('playerName', 'Arciere Nero');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('.medal__button')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());

    expect(dialog.open).toHaveBeenCalledWith(
      CommendationDialog,
      expect.objectContaining({
        data: expect.objectContaining({ share: { player: 'Arciere Nero' } }),
      }),
    );
  });
});
