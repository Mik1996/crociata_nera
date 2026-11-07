import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
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
    TestBed.configureTestingModule({
      providers: [
        { provide: CocApiService, useValue: { getClan: () => of(data) } },
        { provide: APP_CONFIG, useValue: { clanTag: '#2J8JVVCLC' } as AppConfig },
      ],
    });
    const fixture = TestBed.createComponent(WelcomePage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the clan name, badge, capital and leagues', async () => {
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
    expect(el.querySelector('.label-chip')!.textContent).toContain('Clan Wars');
  });

  it('copes with an unranked clan without capital or description', async () => {
    const el = await render({ ...clan, warLeague: undefined, capitalLeague: undefined, capitalHallLevel: 0, description: '' });

    expect(el.textContent).toContain('Capitale non ancora fondata');
    expect(el.textContent).toContain('Non classificato');
  });

  it('invites players to join, with the in-game link and the open spots', async () => {
    const el = await render({
      ...clan,
      members: Array.from({ length: 47 }, () => clan.members[0]) as Clan['members'],
      requiredTownHall: 14,
      requiredLeague: { name: 'Master League I', iconUrl: 'https://api-assets.clashofclans.com/leaguetiers/326/x.png' },
    });

    const cta = el.querySelector<HTMLAnchorElement>('.enlist__cta')!;
    // The `#` of the tag is encoded, otherwise it would become a URL fragment.
    expect(cta.href).toBe('https://link.clashofclans.com/it?action=OpenClanProfile&tag=%232J8JVVCLC');
    expect(cta.target).toBe('_blank');
    expect(cta.rel).toContain('noopener');
    expect(el.querySelector('.enlist__slots')!.textContent).toContain('3');
    const requirements = el.querySelector('.enlist__requirements')!;
    const [townHall, league] = Array.from(requirements.querySelectorAll<HTMLImageElement>('.enlist__badge'));
    expect(townHall.getAttribute('src')).toBe('game/town-halls/th-14.webp');
    expect(requirements.textContent).toContain('Municipio 14');
    expect(league.getAttribute('src')).toBe('https://api-assets.clashofclans.com/leaguetiers/326/x.png');
    expect(requirements.textContent).toContain('Lega richiesta');
    expect(requirements.textContent).toContain('Master League I');
    expect(el.querySelectorAll('.perk')).toHaveLength(8);
  });

  it('shows the clan rules', async () => {
    const el = await render(clan);

    expect(el.querySelector('.rules__title')!.textContent).toContain('Le regole del clan');
    expect(el.querySelectorAll('.rule-group')).toHaveLength(5);
    expect(el.textContent).toContain('Assalti alla capitale obbligatori');
    expect(el.textContent).toContain('Villaggi rushati');
  });
});
