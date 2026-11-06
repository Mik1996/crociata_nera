import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { Clan } from '../../core/models';
import { WelcomePage } from './welcome-page';

const clan: Clan = {
  tag: '#2J8JVVCLC',
  name: 'Crociata Nera',
  level: 16,
  description: 'Qui non c’è posto per i deboli.',
  badgeUrl: 'https://api-assets.clashofclans.com/badges/512/x.png',
  warWins: 132,
  warLosses: 16,
  warTies: 26,
  warWinStreak: 50,
  isWarLogPublic: true,
  warLeague: { id: 48000015, name: 'Master League I' },
  capitalLeague: 'Legend League',
  capitalHallLevel: 10,
  clanPoints: 140174,
  capitalPoints: 5365,
  location: 'Italy',
  labels: [{ name: 'Clan Wars', iconUrl: 'https://api-assets.clashofclans.com/labels/64/x.png' }],
  members: [],
};

describe('WelcomePage', () => {
  async function render(data: Clan) {
    TestBed.configureTestingModule({ providers: [{ provide: CocApiService, useValue: { getClan: () => of(data) } }] });
    const fixture = TestBed.createComponent(WelcomePage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the clan name, badge, capital, leagues and description', async () => {
    const el = await render(clan);

    expect(el.querySelector('.clan-name__metal')!.textContent!.trim()).toBe('Crociata Nera');
    expect(el.querySelector('.clan-name__fire')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector<HTMLImageElement>('.badge-stage__badge')!.src).toBe(clan.badgeUrl);
    expect(el.querySelector<HTMLImageElement>('.pillar__image--hall')!.getAttribute('src')).toBe(
      'game/capital-halls/capital-hall-10.webp',
    );
    expect(el.querySelector('.pillar__hero figcaption')!.textContent).toContain('Municipio della Capitale');
    expect(el.querySelector('.level-ribbon')!.textContent).toContain('Livello 10');
    expect(el.querySelector<HTMLImageElement>('.fact--league img')!.getAttribute('src')).toBe('game/leagues/legend.webp');
    expect(el.textContent).toContain('Legend League');
    expect(el.querySelector<HTMLImageElement>('.pillar__image--trophy')!.getAttribute('src')).toBe(
      'game/war-leagues/master-1.webp',
    );
    expect(el.textContent).toContain('Master League I');
    expect(el.querySelector('.creed__text')!.textContent).toContain('Qui non c’è posto per i deboli.');
    expect(el.querySelector('.label-chip')!.textContent).toContain('Clan Wars');
  });

  it('copes with an unranked clan without capital or description', async () => {
    const el = await render({ ...clan, warLeague: undefined, capitalLeague: undefined, capitalHallLevel: 0, description: '' });

    expect(el.textContent).toContain('Capitale non ancora fondata');
    expect(el.textContent).toContain('Non classificato');
    expect(el.querySelector('.creed')).toBeNull();
  });
});
