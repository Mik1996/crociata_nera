import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CommendationEmblem } from '../../../core/models';
import { CommendationService } from '../../../core/services/commendation.service';
import { PlayerCommendations } from './player-commendations';

describe('PlayerCommendations', () => {
  it('shows every medal with its name and count, greyscale when never earned', async () => {
    const counts = new Map<CommendationEmblem, number>([
      ['champion-gold', 3],
      ['present-bronze', 1],
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: CommendationService, useValue: { historyForPlayer: () => of(counts) } }],
    });
    const fixture = TestBed.createComponent(PlayerCommendations);
    fixture.componentRef.setInput('tag', '#A');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const medals = Array.from(el.querySelectorAll<HTMLElement>('li.medal'));
    expect(medals).toHaveLength(24);
    const champion = medals.find((m) => m.querySelector('app-commendation-medal img')?.getAttribute('src') === 'commendations/champion-gold.svg')!;
    expect(champion.querySelector('.medal__name')!.textContent).toContain('Signore della Guerra');
    expect(champion.querySelector('.medal__count')!.textContent).toContain('3');
    expect(champion.classList).not.toContain('medal--none');
    expect(el.querySelectorAll('li.medal--none')).toHaveLength(22);
    expect(el.querySelector('.summary__total')!.textContent).toContain('4');
  });
});
