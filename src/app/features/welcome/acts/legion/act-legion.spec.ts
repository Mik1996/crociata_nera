import { TestBed } from '@angular/core/testing';
import { ClanMember, ClanRole } from '../../../../core/models';
import { ActLegion, buildBanners, LegionClan, MIN_BANNER_NAMES } from './act-legion';

const member = (name: string, role: ClanRole = 'member'): ClanMember => ({
  tag: `#${name}`,
  name,
  role,
  townHall: 17,
  expLevel: 200,
  trophies: 5000,
  donations: 0,
  donationsReceived: 0,
});

const many = (prefix: string, count: number, chiefs: ClanMember[] = []): ClanMember[] => [
  ...chiefs,
  ...Array.from({ length: count - chiefs.length }, (_, i) => member(`${prefix}${String(i).padStart(2, '0')}`)),
];

const clans: LegionClan[] = [
  {
    order: 'black',
    name: 'Crociata Nera',
    members: many('B', 30, [member('Boss', 'leader'), member('Vice1', 'coLeader'), member('Vice2', 'coLeader')]),
  },
  { order: 'red', name: 'Crociata Rossa', members: many('R', 20) },
  { order: 'gold', name: "Crociata d'Oro", members: [member('G1', 'leader'), member('G2')] },
];

describe('buildBanners', () => {
  it('interleaves the banners of the three clans in alternate directions', () => {
    const banners = buildBanners(clans);
    // The gold clan, with two members, gets one banner.
    expect(banners.map((b) => b.order)).toEqual(['black', 'red', 'gold', 'black', 'red']);
    expect(banners.map((b) => b.dir)).toEqual([1, -1, 1, -1, 1]);
  });

  it('puts every member on one banner of their clan, chiefs first and spread over the banners', () => {
    const black = buildBanners(clans).filter((b) => b.order === 'black');
    const real = black.flatMap((b) => b.names.filter((n) => !n.extra).map((n) => n.name));
    expect(real.sort()).toEqual(clans[0].members.map((m) => m.name).sort());
    expect(black[0].names.slice(0, 2).map((n) => [n.name, n.chief])).toEqual([
      ['Boss', true],
      ['Vice2', true],
    ]);
    expect(black[1].names[0]).toEqual({ name: 'Vice1', chief: true, extra: false });
  });

  it('repeats short lists so a banner never shows a gap', () => {
    const gold = buildBanners(clans).find((b) => b.order === 'gold')!;
    expect(gold.names).toHaveLength(MIN_BANNER_NAMES);
    expect(gold.names.filter((n) => !n.extra).map((n) => n.name)).toEqual(['G1', 'G2']);
  });

  it('leaves out a clan without members', () => {
    expect(buildBanners([{ order: 'red', name: 'Crociata Rossa', members: [] }])).toEqual([]);
  });
});

describe('ActLegion', () => {
  it('counts the Crusaders and lists every name, clan by clan, for assistive technologies', async () => {
    const fixture = TestBed.createComponent(ActLegion);
    fixture.componentRef.setInput('actId', 'legion');
    fixture.componentRef.setInput('clans', clans);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.legion__banners')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('.banner')).toHaveLength(5);
    expect(el.querySelector('.legion__number .cn-visually-hidden')!.textContent!.trim()).toBe('52');
    expect(
      Array.from(el.querySelectorAll('.legion__clan')).map((li) =>
        Array.from(li.children).map((span) => span.textContent!.trim()),
      ),
    ).toEqual([
      ['Crociata Nera', '30'],
      ['Crociata Rossa', '20'],
      ["Crociata d'Oro", '2'],
    ]);

    const roll = el.querySelector('section > .cn-visually-hidden')!;
    expect(Array.from(roll.querySelectorAll('h3')).map((h) => h.textContent)).toEqual([
      'Crociata Nera',
      'Crociata Rossa',
      "Crociata d'Oro",
    ]);
    expect(roll.querySelectorAll('li')).toHaveLength(52);
  });
});
