import { CommendationTier, CommendationType, HistoryAttack, HistoryPeriod, HistoryWar, HistoryWarPlayer } from '../models';
import { awardCommendations, compareCommendations, previousMonth, tierFor } from './commendations';
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

describe('previousMonth', () => {
  it('returns the last completed month in the Italian time zone', () => {
    expect(previousMonth(new Date('2026-11-06T12:00:00Z'))).toBe('2026-10');
    expect(previousMonth(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12');
    // 23:30 UTC on 31 October is already November in Italy.
    expect(previousMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
  });
});
