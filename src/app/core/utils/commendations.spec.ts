import { CommendationTier, CommendationType, CwlSeason, DonationSeason, HistoryAttack, HistoryPeriod, HistoryWar, HistoryWarPlayer, RaidSeason } from '../models';
import {
  awardCommendations,
  awardCwlCommendations,
  awardDonationCommendations,
  awardLegendCommendations,
  awardRaidCommendations,
  awardWarCommendations,
  compareCommendations,
  countCommendations,
  mergeCommendations,
  previousMonth,
  recentWarCommendations,
  tierFor,
  emblemOf,
  medalsOf,
  nameKeyOf,
  styleOf,
  thresholdOf,
} from './commendations';
import { aggregateHistoryPlayers } from './monthly-history';

type PlayerSpec = Partial<HistoryWarPlayer> & { tag: string; stars?: number[] };

function attack(stars: number, defenderTownHall = 16): HistoryAttack {
  return { stars, destruction: stars === 3 ? 100 : 60, defenderTownHall, defenderPosition: 1, order: 0 };
}

function war(day: number, players: PlayerSpec[]): HistoryWar {
  return {
    id: `w${day}`,
    endTime: `2026-10-${String(day).padStart(2, '0')}T20:00:00.000Z`,
    opponent: 'Rivali',
    opponentTag: '#OPP',
    teamSize: players.length,
    attacksPerMember: 2,
    result: 'victory',
    stars: 0,
    starsConceded: 0,
    destruction: 0,
    destructionConceded: 0,
    players: players.map(({ stars = [], ...p }, i) => ({
      name: p.tag,
      townHall: 16,
      mapPosition: i + 1,
      attacksAvailable: 2,
      attacks: stars.map((s) => attack(s)),
      opponentAttacks: 1,
      starsConceded: 2,
      ...p,
    })),
  };
}

function period(wars: HistoryWar[]): HistoryPeriod {
  return { period: '2026-10', updatedAt: null, wars, players: aggregateHistoryPlayers(wars) };
}

/** Tier earned by each player for a type (`undefined` when none). */
function tierOf(wars: HistoryWar[], tag: string, type: CommendationType): CommendationTier | null | undefined {
  return awardCommendations(period(wars)).get(tag)?.find((c) => c.type === type)?.tier;
}

/** `n` wars on consecutive days built by `players(i)`. */
function wars(n: number, players: (i: number) => PlayerSpec[]): HistoryWar[] {
  return Array.from({ length: n }, (_, i) => war(i + 1, players(i)));
}

describe('tierFor', () => {
  it('returns the highest tier reached, honouring the direction of each requirement', () => {
    expect(tierFor('giantSlayer', 1)).toBeNull();
    expect(tierFor('giantSlayer', 2)).toBe('bronze');
    expect(tierFor('giantSlayer', 7)).toBe('silver');
    expect(tierFor('giantSlayer', 10)).toBe('gold');
    // Lower is better: ranking position and stars conceded.
    expect(tierFor('champion', 1)).toBe('gold');
    expect(tierFor('champion', 3)).toBe('bronze');
    expect(tierFor('champion', 4)).toBeNull();
    expect(tierFor('wall', 2)).toBe('gold');
    expect(tierFor('wall', 2.5)).toBe('silver');
    expect(tierFor('wall', 2.9)).toBeNull();
  });
});

describe('awardCommendations', () => {
  it('Warlord: gold, silver and bronze to the monthly podium', () => {
    const list = wars(3, () => [
      { tag: '#FIRST', stars: [3, 3] },
      { tag: '#SECOND', stars: [3, 2] },
      { tag: '#THIRD', stars: [2, 2] },
      { tag: '#FOURTH', stars: [2, 1] },
    ]);
    expect(tierOf(list, '#FIRST', 'champion')).toBe('gold');
    expect(tierOf(list, '#SECOND', 'champion')).toBe('silver');
    expect(tierOf(list, '#THIRD', 'champion')).toBe('bronze');
    expect(tierOf(list, '#FOURTH', 'champion')).toBeUndefined();
  });

  it('Unerring Blade: average stars per attack, with at least 4 attacks', () => {
    const list = wars(2, (i) => [
      { tag: '#ACE', stars: [3, 3] },
      { tag: '#SHARP', stars: i === 0 ? [3, 3] : [3, 2] },
      { tag: '#LUCKY', stars: [3] },
    ]);
    expect(tierOf(list, '#ACE', 'perfect')).toBe('gold');
    // 11 stars / 4 attacks = 2.75: bronze (silver needs 2.8).
    expect(tierOf(list, '#SHARP', 'perfect')).toBe('bronze');
    expect(tierOf(list, '#LUCKY', 'perfect')).toBeUndefined();
  });

  it('Bane of Titans: 2, 5 and 10 three-stars against a higher Town Hall', () => {
    // Each war: one 3-star against a higher Town Hall, one against an equal one.
    const slayer = (n: number) =>
      wars(n, () => [{ tag: '#DAVID', townHall: 14, attacks: [attack(3, 15), attack(3, 14)] }]);
    expect(tierOf(slayer(1), '#DAVID', 'giantSlayer')).toBeUndefined();
    expect(tierOf(slayer(2), '#DAVID', 'giantSlayer')).toBe('bronze');
    expect(tierOf(slayer(5), '#DAVID', 'giantSlayer')).toBe('silver');
    expect(tierOf(slayer(10), '#DAVID', 'giantSlayer')).toBe('gold');
  });

  it('Impassable Wall: average stars conceded per war, over at least 3 wars', () => {
    const list = wars(4, (i) => [
      { tag: '#ROCK', stars: [1], starsConceded: i < 2 ? 1 : 2 },
      { tag: '#STONE', stars: [1], starsConceded: i < 2 ? 2 : 3 },
      { tag: '#WOOD', stars: [1], starsConceded: i < 1 ? 2 : 3 },
      { tag: '#OPEN', stars: [1], starsConceded: 3 },
    ]);
    expect(tierOf(list, '#ROCK', 'wall')).toBe('gold');
    expect(tierOf(list, '#STONE', 'wall')).toBe('silver');
    expect(tierOf(list, '#WOOD', 'wall')).toBe('bronze');
    expect(tierOf(list, '#OPEN', 'wall')).toBeUndefined();
    expect(tierOf(wars(2, () => [{ tag: '#ROCK', stars: [1], starsConceded: 0 }]), '#ROCK', 'wall')).toBeUndefined();
  });

  it('Indomitable Arm: no missed attacks over 3, 5 and 8 wars', () => {
    const steady = (n: number) => wars(n, () => [{ tag: '#STEADY', stars: [2, 2] }]);
    expect(tierOf(steady(2), '#STEADY', 'tireless')).toBeUndefined();
    expect(tierOf(steady(3), '#STEADY', 'tireless')).toBe('bronze');
    expect(tierOf(steady(5), '#STEADY', 'tireless')).toBe('silver');
    expect(tierOf(steady(8), '#STEADY', 'tireless')).toBe('gold');
    const lazy = wars(8, (i) => [{ tag: '#LAZY', stars: i === 0 ? [3] : [3, 3] }]);
    expect(tierOf(lazy, '#LAZY', 'tireless')).toBeUndefined();
  });

  it('Always on the Front Line: 50%, 75% and 100% of the month\'s wars with an attack', () => {
    const list = wars(4, (i) => [
      { tag: '#ALWAYS', stars: [2] },
      { tag: '#THREE', stars: i < 3 ? [1] : [] },
      { tag: '#HALF', stars: i < 2 ? [1] : [] },
      { tag: '#ONCE', stars: i < 1 ? [1] : [] },
    ]);
    expect(tierOf(list, '#ALWAYS', 'present')).toBe('gold');
    expect(tierOf(list, '#THREE', 'present')).toBe('silver');
    expect(tierOf(list, '#HALF', 'present')).toBe('bronze');
    expect(tierOf(list, '#ONCE', 'present')).toBeUndefined();
  });

  it('keeps one tier per type, most valuable first', () => {
    const list = wars(8, () => [{ tag: '#ALL', stars: [3, 3], starsConceded: 0 }]);
    const awards = awardCommendations(period(list)).get('#ALL')!;
    expect(awards).toEqual([
      { type: 'champion', tier: 'gold' },
      { type: 'perfect', tier: 'gold' },
      { type: 'wall', tier: 'gold' },
      { type: 'tireless', tier: 'gold' },
      { type: 'present', tier: 'gold' },
    ]);
    expect(
      compareCommendations({ type: 'present', tier: 'gold' }, { type: 'champion', tier: 'silver' }),
    ).toBeLessThan(0);
  });
});

describe('Raid Weekend, CWL and donation commendations', () => {
  it('capital raiders need MORE than 25 000, 27 500 and 30 000 Capital Gold', () => {
    expect(tierFor('capitalRaider', 25_000)).toBeNull();
    expect(tierFor('capitalRaider', 25_001)).toBe('bronze');
    expect(tierFor('capitalRaider', 27_500)).toBe('bronze');
    expect(tierFor('capitalRaider', 27_501)).toBe('silver');
    expect(tierFor('capitalRaider', 30_001)).toBe('gold');
  });

  it('CWL strikers need an average of at least 2.5, 2.75 and 3 stars', () => {
    expect(tierFor('cwlStriker', 2.49)).toBeNull();
    expect(tierFor('cwlStriker', 2.5)).toBe('bronze');
    expect(tierFor('cwlStriker', 2.75)).toBe('silver');
    expect(tierFor('cwlStriker', 3)).toBe('gold');
  });

  it('awards the capital raiders of a weekend', () => {
    const member = (tag: string, looted: number) => ({ tag, name: tag, attacks: 6, attackLimit: 6, looted });
    const season = { members: [member('#GOLD', 31_000), member('#SILVER', 28_000), member('#NONE', 20_000)] } as RaidSeason;
    const awards = awardRaidCommendations(season);
    expect(awards.get('#GOLD')).toEqual([{ type: 'capitalRaider', tier: 'gold' }]);
    expect(awards.get('#SILVER')).toEqual([{ type: 'capitalRaider', tier: 'silver' }]);
    expect(awards.has('#NONE')).toBe(false);
  });

  it('awards the CWL strikers on the exact average, with at least 3 attacks', () => {
    const player = (tag: string, attacks: number, stars: number) =>
      ({ tag, name: tag, townHall: 16, wars: 7, attacks, stars, threeStars: 0, averageStars: 0, averageDestruction: 0 });
    const season = {
      players: [player('#PERFECT', 7, 21), player('#ALMOST', 7, 20), player('#LUCKY', 2, 6), player('#GOOD', 4, 11)],
    } as CwlSeason;
    const awards = awardCwlCommendations(season);
    const striker = (tag: string) => awards.get(tag)?.filter((c) => c.type === 'cwlStriker');
    expect(striker('#PERFECT')).toEqual([{ type: 'cwlStriker', tier: 'gold' }]);
    // 20 / 7 = 2.857: silver, even though it would round to 2.86.
    expect(striker('#ALMOST')).toEqual([{ type: 'cwlStriker', tier: 'silver' }]);
    expect(awards.has('#LUCKY')).toBe(false);
    expect(striker('#GOOD')).toEqual([{ type: 'cwlStriker', tier: 'silver' }]);
  });

  it('awards the one-off cwlAllAttacks to who attacked every day in the line-up, with at least 3 days', () => {
    const player = (tag: string, wars: number, attacks: number) =>
      ({ tag, name: tag, townHall: 16, wars, attacks, stars: attacks, threeStars: 0, averageStars: 0, averageDestruction: 0 });
    const season = {
      players: [player('#ALL7', 7, 7), player('#ALL3', 3, 3), player('#TWO', 2, 2), player('#MISSED', 7, 6)],
    } as CwlSeason;
    const awards = awardCwlCommendations(season);
    const allAttacks = { type: 'cwlAllAttacks', tier: null };
    expect(awards.get('#ALL7')).toContainEqual(allAttacks);
    expect(awards.get('#ALL3')).toContainEqual(allAttacks);
    expect(awards.has('#TWO')).toBe(false);
    expect(awards.get('#MISSED') ?? []).not.toContainEqual(allAttacks);
  });

  it('a one-off commendation comes before any gold one', () => {
    const merged = mergeCommendations(
      new Map([['#A', [{ type: 'champion' as const, tier: 'gold' as const }]]]),
      new Map([['#A', [{ type: 'cwlAllAttacks' as const, tier: null }]]]),
    );
    expect(merged.get('#A')!.map((c) => c.type)).toEqual(['cwlAllAttacks', 'champion']);
  });

  it('donors need at least 5 000, 7 500 and 10 000 troops', () => {
    expect(tierFor('donor', 4_999)).toBeNull();
    expect(tierFor('donor', 5_000)).toBe('bronze');
    expect(tierFor('donor', 7_499)).toBe('bronze');
    expect(tierFor('donor', 7_500)).toBe('silver');
    expect(tierFor('donor', 10_000)).toBe('gold');
  });

  it('awards the donors of a season', () => {
    const player = (tag: string, donations: number) => ({ tag, name: tag, donations });
    const season = { players: [player('#GOLD', 12_000), player('#BRONZE', 5_000), player('#NONE', 900)] } as DonationSeason;
    const awards = awardDonationCommendations(season);
    expect(awards.get('#GOLD')).toEqual([{ type: 'donor', tier: 'gold' }]);
    expect(awards.get('#BRONZE')).toEqual([{ type: 'donor', tier: 'bronze' }]);
    expect(awards.has('#NONE')).toBe(false);
  });

  it('merges the commendations of different periods, most valuable first', () => {
    const merged = mergeCommendations(
      new Map([['#A', [{ type: 'present' as const, tier: 'silver' as const }]]]),
      new Map([['#A', [{ type: 'capitalRaider' as const, tier: 'gold' as const }]]]),
      new Map([['#A', [{ type: 'cwlStriker' as const, tier: 'silver' as const }]]]),
    );
    expect(merged.get('#A')).toEqual([
      { type: 'capitalRaider', tier: 'gold' },
      { type: 'cwlStriker', tier: 'silver' },
      { type: 'present', tier: 'silver' },
    ]);
  });
});

describe('chiefHunter (three stars on the enemy number 1)', () => {
  /** A 2v2 war (6 stars) from attacks `[attacker, defender position, stars]` in order. */
  function chiefWar(...attacks: [string, number, number][]): HistoryWar {
    return war(4, [{ tag: '#A' }, { tag: '#B' }].map((p) => ({
      ...p,
      attacks: attacks.flatMap(([attacker, defenderPosition, stars], order) =>
        attacker === p.tag ? [{ ...attack(stars), defenderPosition, order: order + 1 }] : [],
      ),
    })));
  }
  const hunters = (w: HistoryWar) => [...awardWarCommendations(w)].map(([tag, items]) => [tag, items]);
  const medal = [{ type: 'chiefHunter', tier: null }];

  it('goes to the first three stars on the number 1', () => {
    expect(hunters(chiefWar(['#A', 1, 2], ['#B', 1, 3]))).toEqual([['#B', medal]]);
    expect(hunters(chiefWar(['#A', 2, 3], ['#A', 1, 2]))).toEqual([]);
    expect(medalsOf('chiefHunter')).toEqual([{ type: 'chiefHunter', tier: null }]);
  });

  it('a repeat three stars on the number 1 only once every star of the war was taken', () => {
    expect(hunters(chiefWar(['#A', 1, 3], ['#B', 1, 3], ['#B', 2, 3]))).toEqual([['#A', medal]]);
    expect(hunters(chiefWar(['#A', 1, 3], ['#A', 2, 3], ['#B', 1, 3]))).toEqual([['#A', medal], ['#B', medal]]);
  });

  it('replays the attacks in war order, one medal per player and war', () => {
    expect(hunters(chiefWar(['#B', 1, 3], ['#A', 1, 3]))).toEqual([['#B', medal]]);
    expect(hunters(chiefWar(['#A', 1, 3], ['#B', 2, 3], ['#A', 1, 3]))).toEqual([['#A', medal]]);
  });

  it('lists it once in the recent months, however many wars earned it', () => {
    const month = period([chiefWar(['#A', 1, 3]), chiefWar(['#A', 1, 3])]);
    expect([...recentWarCommendations([month]).awards]).toEqual([['#A', medal]]);
  });
});

describe('fortress and perfectWar (one-off medals of a war)', () => {
  // The fixtures' attacks hit the enemy number 1 (they also earn chiefHunter): only these two kinds are looked at.
  const kinds = (items: { type: string }[]) => items.map((c) => c.type).filter((type) => type !== 'chiefHunter');
  const typesOf = (w: HistoryWar, tag: string) => kinds(awardWarCommendations(w).get(tag) ?? []);

  it('fortress: attacked at least twice and never three-starred', () => {
    const w = war(4, [
      { tag: '#WALL', opponentAttacks: 2, starsConceded: 2 },
      { tag: '#FALLEN', opponentAttacks: 3, starsConceded: 3 },
      { tag: '#QUIET', opponentAttacks: 1, starsConceded: 0 },
    ]);
    expect(typesOf(w, '#WALL')).toEqual(['fortress']);
    expect(typesOf(w, '#FALLEN')).toEqual([]);
    expect(typesOf(w, '#QUIET')).toEqual([]);
  });

  it('perfectWar: three stars with every attack, in a war won with every star', () => {
    const players = [
      { tag: '#IN', stars: [3, 3], opponentAttacks: 0 },
      { tag: '#OUT', opponentAttacks: 0 },
      { tag: '#SHORT', stars: [3, 2], opponentAttacks: 0 },
    ];
    const perfect = { ...war(4, players), stars: 9 };
    expect(typesOf(perfect, '#IN')).toEqual(['perfectWar']);
    expect(typesOf(perfect, '#OUT')).toEqual([]);
    expect(typesOf(perfect, '#SHORT')).toEqual([]);
    expect(typesOf({ ...perfect, stars: 8 }, '#IN')).toEqual([]);
    expect(typesOf({ ...perfect, result: 'draw' }, '#IN')).toEqual([]);
  });

  it('the recent months list each kind once per player, keeping every kind earned', () => {
    const fortress = war(4, [{ tag: '#A', opponentAttacks: 2, starsConceded: 1 }]);
    const perfect = { ...war(5, [{ tag: '#A', stars: [3], opponentAttacks: 0 }]), stars: 3 };
    const month = period([fortress, perfect, fortress]);
    expect(kinds(recentWarCommendations([month]).awards.get('#A')!)).toEqual(['fortress', 'perfectWar']);
  });

  it('the last completed month and the one in progress, each kind with the last war it was earned in', () => {
    const fortress = war(4, [{ tag: '#A', opponentAttacks: 2, starsConceded: 1 }]);
    const later = { ...fortress, id: 'later', endTime: '2026-11-03T20:00:00.000Z' };
    const october = period([fortress]);
    const november = { ...period([later]), period: '2026-11' };
    // Given in any order; a month without wars (null) is skipped.
    const recent = recentWarCommendations([november, null, october]);
    expect(kinds(recent.awards.get('#A')!)).toEqual(['fortress']);
    expect(recent.wars.get('#A')!.fortress).toBe('2026-11-03T20:00:00.000Z');
    expect(recentWarCommendations([october]).wars.get('#A')!.fortress).toBe('2026-10-04T20:00:00.000Z');
  });

  it('legendTop: the members of the last Legend League season among the first 10,000', () => {
    const season = {
      seasonId: 'v2-2026-10-26T05:00:00Z',
      endTime: '2026-10-26T05:00:00.000Z',
      results: [{ tag: '#TOP', name: 'Top', clanTag: '#C', rank: 812 }],
    };
    expect([...awardLegendCommendations(season)]).toEqual([['#TOP', [{ type: 'legendTop', tier: null }]]]);
  });
});

describe('medals and their look', () => {
  it('a graded commendation has bronze, silver and gold in the metal of each tier', () => {
    expect(medalsOf('donor').map((m) => m.tier)).toEqual(['gold', 'silver', 'bronze']);
    expect(medalsOf('donor').map(styleOf)).toEqual(['gold', 'silver', 'bronze']);
    expect(emblemOf({ type: 'donor', tier: 'gold' })).toBe('donor-gold');
    expect(nameKeyOf({ type: 'donor', tier: 'gold' })).toBe('commendations.donor.gold');
    expect(thresholdOf({ type: 'donor', tier: 'silver' })).toBe(7_500);
  });

  it('a one-off commendation has one medal, no tier, its own colour', () => {
    const allAttacks = { type: 'cwlAllAttacks' as const, tier: null };
    const hunter = { type: 'chiefHunter' as const, tier: null };
    expect(medalsOf('cwlAllAttacks')).toEqual([allAttacks]);
    expect([styleOf(allAttacks), styleOf(hunter)]).toEqual(['crimson', 'sapphire']);
    expect([emblemOf(allAttacks), emblemOf(hunter)]).toEqual(['cwlAllAttacks', 'chiefHunter']);
    expect(nameKeyOf(hunter)).toBe('commendations.chiefHunter.name');
    expect(thresholdOf(allAttacks)).toBe(3);
  });
});

describe('countCommendations', () => {
  it('counts how many times each player earned each medal, over several periods', () => {
    const gold = { type: 'present' as const, tier: 'gold' as const };
    const raid = { type: 'capitalRaider' as const, tier: 'bronze' as const };
    const counts = countCommendations([
      new Map([['#A', [gold]], ['#B', [gold]]]),
      new Map([['#A', [gold, raid]]]),
    ]);
    expect(counts.get('#A')).toEqual(new Map([['present-gold', 2], ['capitalRaider-bronze', 1]]));
    expect(counts.get('#B')).toEqual(new Map([['present-gold', 1]]));
    expect(counts.has('#C')).toBe(false);
  });
});

describe('previousMonth', () => {
  it('returns the last completed month in the Italian time zone', () => {
    expect(previousMonth(new Date('2026-11-06T12:00:00Z'))).toBe('2026-10');
    expect(previousMonth(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12');
    // 23:30 UTC on 31 October is already November in Italy.
    expect(previousMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
  });
});
