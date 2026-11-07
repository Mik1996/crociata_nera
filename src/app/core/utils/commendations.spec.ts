import { CommendationTier, CommendationType, CwlSeason, HistoryAttack, HistoryPeriod, HistoryWar, HistoryWarPlayer, RaidSeason } from '../models';
import {
  awardCommendations,
  awardCwlCommendations,
  awardRaidCommendations,
  compareCommendations,
  countCommendations,
  mergeCommendations,
  previousMonth,
  tierFor,
} from './commendations';
import { aggregateHistoryPlayers } from './monthly-history';

type PlayerSpec = Partial<HistoryWarPlayer> & { tag: string; stars?: number[] };

function attack(stars: number, defenderTownHall = 16): HistoryAttack {
  return { stars, destruction: stars === 3 ? 100 : 60, defenderTownHall, defenderPosition: 1 };
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
function tierOf(wars: HistoryWar[], tag: string, type: CommendationType): CommendationTier | undefined {
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
    expect(tierFor('wall', 1.5)).toBe('gold');
    expect(tierFor('wall', 2.6)).toBeNull();
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
      { tag: '#STONE', stars: [1], starsConceded: 2 },
      { tag: '#WOOD', stars: [1], starsConceded: i < 2 ? 2 : 3 },
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

describe('Raid Weekend and CWL commendations', () => {
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
    expect(awards.get('#PERFECT')).toEqual([{ type: 'cwlStriker', tier: 'gold' }]);
    // 20 / 7 = 2.857: silver, even though it would round to 2.86.
    expect(awards.get('#ALMOST')).toEqual([{ type: 'cwlStriker', tier: 'silver' }]);
    expect(awards.has('#LUCKY')).toBe(false);
    expect(awards.get('#GOOD')).toEqual([{ type: 'cwlStriker', tier: 'silver' }]);
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
