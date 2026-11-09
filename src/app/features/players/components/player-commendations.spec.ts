import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { EarnedCommendation } from '../../../core/backend/backend-api.types';
import { CommendationService } from '../../../core/services/commendation.service';
import { CommendationDialog } from './commendation-dialog';
import { PlayerCommendations } from './player-commendations';

describe('PlayerCommendations', () => {
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
    expect(medals).toHaveLength(28);
    const champion = medals.find((m) => m.querySelector('app-medal-3d-image img')?.getAttribute('src') === 'commendations/champion-gold.svg')!;
    expect(champion.querySelector('.medal__name')!.textContent).toContain('Signore della Guerra');
    expect(champion.querySelector('.medal__count')!.textContent).toContain('3');
    expect(champion.classList).not.toContain('medal--none');
    expect(el.querySelectorAll('li.medal--none')).toHaveLength(26);
    expect(el.querySelector('.summary__total')!.textContent).toContain('4');
  });

  it('shows a one-off commendation as a single legendary medal, with its requirement', async () => {
    const counts: EarnedCommendation[] = [
      { id: '95000028', name: 'cwlAllAttacks-legendary', type: 'cwlAllAttacks', tier: 'legendary', quantity: 2 },
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: CommendationService, useValue: { historyForPlayer: () => of(counts) } }],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#A');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const legendary = el.querySelectorAll('.commendation-row--legendary');
    expect(legendary).toHaveLength(1);
    const medals = legendary[0].querySelectorAll('li.medal');
    expect(medals).toHaveLength(1);
    expect(medals[0].querySelector('app-medal-3d-image img')?.getAttribute('src')).toBe('commendations/cwlAllAttacks-legendary.svg');
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
});
