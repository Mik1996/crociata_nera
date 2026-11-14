import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { CLAN_CRESTS } from '../../core/api/clan-badge';
import { CocApiService } from '../../core/api/coc-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { Clan, ClanRanks, ClanRecords } from '../../core/models';
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
  capitalDistricts: [
    { id: 70000000, name: 'Capital Peak', level: 10 },
    { id: 70000001, name: 'Barbarian Camp', level: 5 },
    { id: 70000007, name: 'Skeleton Park', level: 4 },
  ],
  clanPoints: 140174,
  capitalPoints: 5365,
  location: 'Italy',
  labels: [{ name: 'Clan Wars', iconUrl: 'https://api-assets.clashofclans.com/labels/64/x.png' }],
  members: [],
};

const records: ClanRecords = {
  perfectWars: { value: 137, achievedAt: null },
  warWinStreak: { value: 50, achievedAt: null },
  cwlLeague: { id: 48000015, name: 'Master League I', achievedAt: null },
  localRank: { value: 37, achievedAt: null },
  localCapitalRank: { value: 12, achievedAt: null },
  capitalPoints: { value: 5380, achievedAt: '2026-11-08T18:00:00.000Z' },
};

describe('WelcomePage', () => {
  async function render(
    data: Clan,
    ranks: ClanRanks = { local: 12, global: null },
    clanRecords: Observable<ClanRecords> = of(records),
    sisterClan: (tag: string) => Observable<Clan> = (tag) =>
      of({ ...clan, tag, name: tag === '#2JU8RPR2G' ? 'Crociata Rossa' : "Crociata d'Oro", description: 'Clan gemello.' }),
  ) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CocApiService,
          useValue: {
            getClan: () => of(data),
            getClanByTag: sisterClan,
            getClanRanks: () => of(ranks),
            getClanRecords: () => clanRecords,
          },
        },
        { provide: APP_CONFIG, useValue: { clanTag: '#2J8JVVCLC' } as AppConfig },
      ],
    });
    const fixture = TestBed.createComponent(WelcomePage);
    await fixture.whenStable();
    // The engine numbers the acts after the first render.
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** Accessible value of a counted number (the visible digits change while scrolling). */
  const valueOf = (el: Element | null) =>
    (el?.querySelector('.cn-visually-hidden') ?? el)?.textContent?.trim();

  it('tells the story in acts, numbered, with an index', async () => {
    const el = await render(clan);

    const acts = Array.from(el.querySelectorAll('.scrolly-act[id]')).map((act) => act.id);
    expect(acts).toEqual(['prologue', 'army', 'capital', 'war', 'annals', 'code', 'code-scroll', 'sister-red', 'sister-gold', 'call']);
    expect(Array.from(el.querySelectorAll('.index__label')).map((l) => l.textContent?.trim())).toEqual([
      'La Crociata',
      "L'Esercito",
      'La Capitale',
      'La Guerra',
      'Gli Annali',
      'Il Codice',
      'Crociata Rossa',
      "Crociata d'Oro",
      'La Chiamata',
    ]);
    expect(el.querySelector('#army .act-heading__kicker')!.textContent).toContain('Atto I');
    expect(el.querySelector('#call .act-heading__kicker')!.textContent).toContain('Atto VIII');
    // The Black Crusader changes pose from act to act.
    const poses = Array.from(el.querySelectorAll('crn-crusader')).map((c) => c.getAttribute('data-pose'));
    expect(poses).toEqual(['stand', 'guard', 'heart', 'fist', 'oath', 'stand', 'stand']);
    // The call gathers the three Crusaders of the Crusade in one picture.
    expect(el.querySelector<HTMLImageElement>('#call .call__figures')!.getAttribute('src')).toBe(
      'images/crusader/crusader-trio-800.webp',
    );
    expect(el.querySelector<HTMLImageElement>('#prologue crn-crusader img')!.getAttribute('src')).toBe(
      'images/crusader/crusader-stand-640.webp',
    );
  });

  it('presents the sister clans like the prologue, each with its Crusader and a link to the game', async () => {
    const el = await render(clan);

    const red = el.querySelector('#sister-red')!;
    expect(red.querySelector('crn-clan-hero')!.classList).toContain('clan-hero--red');
    expect(red.querySelector('h2.clan-name .clan-name__metal')!.textContent!.trim()).toBe('Crociata Rossa');
    expect(red.querySelector('.hero__kicker')!.textContent).toContain('Atto VI · Clan gemello');
    expect(red.querySelector<HTMLImageElement>('crn-crusader img')!.getAttribute('src')).toBe(
      'images/crusader/crusader-red-stand-640.webp',
    );
    const cta = red.querySelector<HTMLAnchorElement>('.hero__cta')!;
    expect(cta.href).toBe('https://link.clashofclans.com/it?action=OpenClanProfile&tag=%232JU8RPR2G');
    expect(cta.target).toBe('_blank');

    const gold = el.querySelector('#sister-gold')!;
    expect(gold.querySelector('.hero__kicker')!.textContent).toContain('Atto VII');
    expect(gold.querySelector<HTMLImageElement>('crn-crusader img')!.getAttribute('src')).toBe(
      'images/crusader/crusader-gold-stand-640.webp',
    );
    // Only Crociata Nera has the page title.
    expect(el.querySelectorAll('h1')).toHaveLength(1);
  });

  it('leaves out a sister clan that cannot be read', async () => {
    const el = await render(clan, undefined, undefined, (tag) =>
      tag === '#2JU8RPR2G' ? throwError(() => new Error('offline')) : of({ ...clan, tag, name: "Crociata d'Oro" }),
    );
    expect(el.querySelector('#sister-red')).toBeNull();
    expect(el.querySelector('#sister-gold .hero__kicker')!.textContent).toContain('Atto VI');
    expect(el.querySelector('#call .act-heading__kicker')!.textContent).toContain('Atto VII');
  });

  it('shows the clan name, badge, capital and leagues', async () => {
    const el = await render(clan);

    expect(el.querySelector('.clan-name__metal')!.textContent!.trim()).toBe('Crociata Nera');
    expect(el.querySelector('.clan-name__fire')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector<HTMLImageElement>('.badge-stage__badge')!.src).toBe(clan.badgeUrl);
    expect(el.querySelector('.hero__motto')!.textContent).toContain('Qui non c’è posto per i deboli.');
    expect(el.querySelector<HTMLImageElement>('.capital__hall')!.getAttribute('src')).toBe(
      'game/capital-halls/capital-hall-10.webp',
    );
    expect(el.querySelector('.capital__caption')!.textContent).toContain('Municipio della Capitale');
    expect(el.querySelector('.capital__ribbon')!.textContent).toContain('Livello 10');
    expect(el.querySelector<HTMLImageElement>('.capital__league img')!.getAttribute('src')).toBe('game/leagues/legend.webp');
    expect(el.textContent).toContain('Legend League');
    expect(valueOf(el.querySelector('.capital__points dd'))).toBe('5.365');
    expect(el.querySelector<HTMLImageElement>('.war__trophy-image')!.getAttribute('src')).toBe(
      'game/war-leagues/master-1.webp',
    );
    expect(el.querySelector('.war__ribbon')!.textContent).toContain('Master League I');
    expect(el.querySelector('.label-chip')!.textContent).toContain('Clan Wars');
  });

  it('falls back to the clan logos when the badges fail to load', async () => {
    const el = await render(clan);
    const heroBadges = () =>
      ['#prologue', '#sister-red', '#sister-gold'].map((act) =>
        el.querySelector<HTMLImageElement>(`${act} .badge-stage__badge`)!,
      );
    heroBadges().forEach((badge) => badge.dispatchEvent(new Event('error')));
    const cards = () => Array.from(el.querySelectorAll('.enlist'));
    cards().forEach((card) => card.querySelector('.enlist__clan-badge')!.dispatchEvent(new Event('error')));
    await TestBed.inject(ApplicationRef).whenStable();

    // Each clan of the Crusade has its own crowned helmet.
    expect(heroBadges().map((badge) => badge.getAttribute('src'))).toEqual([
      CLAN_CRESTS.black,
      CLAN_CRESTS.red,
      CLAN_CRESTS.gold,
    ]);
    expect(cards().map((c) => c.querySelector('.enlist__clan-badge')?.getAttribute('src') ?? null)).toEqual([
      CLAN_CRESTS.black,
      CLAN_CRESTS.red,
      CLAN_CRESTS.gold,
    ]);
  });

  it('shows the districts of the capital around the Capital Hall, each with its name and level', async () => {
    const el = await render(clan);
    const districts = Array.from(el.querySelectorAll('.district')).map((li) => [
      li.querySelector('.district__name')!.textContent!.trim(),
      li.querySelector<HTMLImageElement>('.district__hall')!.getAttribute('src'),
      li.querySelector('.district__level')!.textContent!.trim(),
    ]);
    // Capital Peak is the Capital Hall itself, not one of the islands.
    expect(districts).toEqual([
      ['Accampamento barbaro', 'game/capital-districts/district-hall-5.webp', 'Livello 5'],
      ['Parco degli scheletri', 'game/capital-districts/district-hall-4.webp', 'Livello 4'],
    ]);
    expect(el.querySelector('.capital__districts')!.getAttribute('aria-label')).toBe('Distretti della Capitale');
  });

  it('shows the clan in numbers, counted up to their final value', async () => {
    const el = await render(clan);
    const stats = Array.from(el.querySelectorAll('.stat')).map((li) => [
      valueOf(li.querySelector('.stat__value')),
      li.querySelector('.stat__label')?.textContent?.trim(),
    ]);
    expect(stats).toEqual([
      ['0/50', 'Membri'],
      ['132', 'Guerre vinte'],
      ['50', 'Serie di vittorie attuale'],
      ['140.174', 'Punti clan'],
    ]);
    // Without layout (tests) the page is static: the counters show the final numbers.
    expect(el.querySelector('[data-stat="clanPoints"] [aria-hidden] span')!.textContent).toBe('140.174');
  });

  it('shows the war record, its bar and the win rate', async () => {
    const el = await render(clan);
    const facts = Array.from(el.querySelectorAll('.war__fact')).map((f) => [
      f.querySelector('dt')?.textContent?.trim(),
      valueOf(f.querySelector('dd')),
    ]);
    expect(facts).toEqual([
      ['Vittorie', '132'],
      ['Pareggi', '26'],
      ['Sconfitte', '16'],
      ['% di vittorie', '76%'],
    ]);
    const parts = Array.from(el.querySelectorAll<HTMLElement>('.war__bar-part')).map((p) => Number(p.style.flexGrow).toFixed(2));
    expect(parts).toEqual(['0.76', '0.15', '0.09']);
  });

  it('copes with an unranked clan without capital or description', async () => {
    const el = await render({ ...clan, warLeague: undefined, capitalLeague: undefined, capitalHallLevel: 0, capitalDistricts: [], description: '' });

    expect(el.textContent).toContain('Capitale non ancora fondata');
    expect(el.textContent).toContain('Non classificato');
    expect(el.querySelector('.capital__districts')).toBeNull();
    expect(el.querySelector('#prologue .hero__motto')).toBeNull();
    expect(el.querySelector<HTMLImageElement>('.war__trophy-image')!.getAttribute('src')).toBe('game/misc/clan-war.webp');
  });

  it('shows the positions in the country and worldwide rankings', async () => {
    const el = await render({ ...clan, countryCode: 'IT' }, { local: 12, global: 150 });
    const ranks = Array.from(el.querySelectorAll('.stat--rank')).map((li) => [
      valueOf(li.querySelector('.stat__value')),
      li.querySelector('.stat__label')?.textContent?.trim(),
    ]);
    expect(ranks).toEqual([
      ['#12', 'Classifica Italia'],
      ['#150', 'Classifica mondiale'],
    ]);
  });

  it('shows the worldwide ranking only for the top 200, the country one always', async () => {
    const el = await render({ ...clan, countryCode: 'IT' }, { local: null, global: null });
    const values = Array.from(el.querySelectorAll('.stat--rank .stat__value')).map((v) => valueOf(v));
    expect(values).toEqual(['200+']);
  });

  it('hides the rankings that are not available', async () => {
    const el = await render(clan, { local: undefined, global: undefined });
    expect(el.querySelectorAll('.stat--rank')).toHaveLength(0);
  });

  it('shows the clan records in the annals', async () => {
    const el = await render({ ...clan, countryCode: 'IT' });
    const tiles = Array.from(el.querySelectorAll('.record')).map((li) => [
      li.querySelector('.record__value')?.textContent?.trim(),
      li.querySelector('.record__label')?.textContent?.trim(),
    ]);
    expect(el.querySelector('#records-title')!.textContent).toContain('Gli Annali');
    expect(tiles).toEqual([
      ['137', 'Guerre perfette'],
      ['50', 'Serie di vittorie guerra'],
      ['Master League I', 'Miglior lega CWL'],
      ['#37', 'Miglior posizione Italia'],
      ['#12', 'Miglior posizione capitale Italia'],
      ['5.380', 'Record trofei capitale'],
    ]);
    expect(el.querySelector<HTMLImageElement>('[data-record="cwlLeague"] img')!.getAttribute('src')).toBe(
      'game/war-leagues/master-1.webp',
    );
    // Waving Italian flag for the country ranking, Legend League for the capital one.
    expect(el.querySelectorAll('[data-record="localRank"] .flag__slice').length).toBeGreaterThan(1);
    expect(el.querySelector<HTMLImageElement>('[data-record="localCapitalRank"] img')!.getAttribute('src')).toBe(
      'game/leagues/legend.webp',
    );
    // Only records reached while tracked by the backend have a date.
    expect(el.querySelectorAll('.record__date')).toHaveLength(1);
    expect(el.querySelector('[data-record="capitalPoints"] .record__date')!.textContent).toContain('Raggiunto il');
  });

  it('leaves the annals out when the backend cannot answer', async () => {
    const el = await render(clan, undefined, throwError(() => new Error('offline')));
    expect(el.querySelector('crn-act-annals')).toBeNull();
    expect(Array.from(el.querySelectorAll('.index__label')).map((l) => l.textContent?.trim())).not.toContain('Gli Annali');
    expect(el.querySelector('.clan-name__metal')).not.toBeNull();
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
    expect(el.querySelector('.perks')).toBeNull();
  });

  it('keeps recruitment open while at least one of the three clans has a free spot', async () => {
    const full = Array.from({ length: 50 }, () => clan.members[0]) as Clan['members'];
    const fullSister = (tag: string) => of({ ...clan, tag, name: tag, members: full });

    const open = await render({ ...clan, members: full });
    expect(open.querySelector('.recruit__title')!.textContent).toContain('Unisciti a noi');
    expect(open.querySelector('.recruit__kicker')!.textContent).toContain('Reclutamento aperto');

    TestBed.resetTestingModule();
    const closed = await render({ ...clan, members: full }, undefined, undefined, fullSister);
    const kicker = closed.querySelector('.recruit__kicker')!;
    expect(kicker.textContent).toContain('Reclutamento chiuso');
    expect(kicker.classList).toContain('recruit__kicker--closed');
  });

  it('recruits for Crociata Nera, Crociata Rossa and Crociata d’Oro, in this order', async () => {
    const el = await render(clan);
    const cards = Array.from(el.querySelectorAll('.enlist'));
    expect(cards.map((c) => c.querySelector('.enlist__clan')!.textContent!.trim())).toEqual([
      'Crociata Nera',
      'Crociata Rossa',
      "Crociata d'Oro",
    ]);
    expect(cards.map((c) => c.getAttribute('data-order'))).toEqual(['black', 'red', 'gold']);
    expect(cards.map((c) => c.querySelector<HTMLAnchorElement>('.enlist__cta')!.href)).toEqual([
      'https://link.clashofclans.com/it?action=OpenClanProfile&tag=%232J8JVVCLC',
      'https://link.clashofclans.com/it?action=OpenClanProfile&tag=%232JU8RPR2G',
      'https://link.clashofclans.com/it?action=OpenClanProfile&tag=%232RRYUGQYJ',
    ]);
    // Each card is named after its clan; the hint on the game link is shown once.
    expect(cards[1].getAttribute('aria-labelledby')).toBe(cards[1].querySelector('.enlist__clan')!.id);
    expect(el.querySelectorAll('.recruit__hint')).toHaveLength(1);
  });

  it('shows the clan rules on the scroll of the code', async () => {
    const el = await render(clan);

    expect(el.querySelector('#code crn-clan-rules')!.classList).toContain('clan-rules--scroll');
    expect(el.querySelector('.rules__title')!.textContent).toContain('Le regole del clan');
    expect(el.querySelectorAll('.rule-group')).toHaveLength(5);
    expect(el.textContent).toContain('Assalti alla capitale obbligatori');
    expect(el.textContent).toContain('Villaggi rushati');
  });
});
