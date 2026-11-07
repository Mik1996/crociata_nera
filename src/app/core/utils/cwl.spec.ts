import { CocCapitalRaidSeason, CocCwlSeasonRecord, CocWar } from '../api/coc-api.types';
import { buildCwlSeason, mapRaidSeason } from './cwl';

const OWN = '#OWN';

function war(warTag: string, a: [string, number, number], b: [string, number, number], state: CocWar['state'] = 'warEnded', ownMembers = false) {
  const members = (stars: number[]) =>
    stars.map((s, i) => ({
      tag: `#P${i}`,
      name: `Player ${i}`,
      townhallLevel: 16,
      mapPosition: i + 1,
      attacks: s < 0 ? [] : [{ attackerTag: `#P${i}`, defenderTag: `#E${i}`, stars: s, destructionPercentage: s === 3 ? 100 : 60, order: i + 1 }],
      opponentAttacks: 0,
    }));
  return {
    warTag,
    state,
    teamSize: 2,
    preparationStartTime: '20261101T080000.000Z',
    startTime: '20261102T080000.000Z',
    endTime: '20261103T080000.000Z',
    clan: { tag: a[0], name: a[0], clanLevel: 10, attacks: 2, stars: a[1], destructionPercentage: a[2], members: ownMembers && a[0] === OWN ? members([3, 2]) : [] },
    opponent: { tag: b[0], name: b[0], clanLevel: 10, attacks: 2, stars: b[1], destructionPercentage: b[2], members: ownMembers && b[0] === OWN ? members([3, -1]) : [] },
  };
}

const record: CocCwlSeasonRecord = {
  season: '2026-11',
  state: 'inWar',
  clanTag: OWN,
  clans: ['#OWN', '#A', '#B', '#C'].map((tag) => ({ tag, name: tag, clanLevel: 10, members: [] })),
  rounds: [{ warTags: ['#W1', '#W2'] }, { warTags: ['#W3', '#W4'] }, { warTags: ['#0', '#0'] }],
  wars: [
    // Round 1: the clan wins as the "clan" side.
    war('#W1', [OWN, 5, 90], ['#A', 3, 70], 'warEnded', true),
    war('#W2', ['#B', 4, 80], ['#C', 4, 75]),
    // Round 2: the clan is on the "opponent" side, war in progress.
    war('#W3', ['#B', 2, 50], [OWN, 3, 60], 'inWar', true),
    war('#W4', ['#A', 6, 100], ['#C', 1, 30]),
  ],
};

describe('buildCwlSeason', () => {
  const season = buildCwlSeason(record, OWN);

  it('ranks the group by stars plus 10 per war won, then destruction', () => {
    expect(season.standings.map((s) => [s.tag, s.stars, s.wins])).toEqual([
      ['#A', 19, 1], // 3 + 6 + 10 (win)
      ['#OWN', 18, 1], // 5 + 10 (win) + 3 (war in progress: no bonus yet)
      ['#B', 16, 1], // 4 + 10 (wins on destruction) + 2
      ['#C', 5, 0],
    ]);
    expect(season.standings.find((s) => s.isOwn)!.tag).toBe(OWN);
    expect(season.standings.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });

  it("puts the clan on its own side in every round and keeps unscheduled rounds", () => {
    expect(season.rounds.map((r) => r.state)).toEqual(['ended', 'battle', 'scheduled']);
    expect(season.rounds[1].war!.clan.tag).toBe(OWN);
    expect(season.rounds[1].war!.opponent.tag).toBe('#B');
    expect(season.rounds[0].war!.attacksPerMember).toBe(1);
  });

  it("sums the players' attacks over the clan's wars", () => {
    const first = season.players.find((p) => p.tag === '#P0')!;
    expect(first).toMatchObject({ wars: 2, attacks: 2, stars: 6, threeStars: 2, averageStars: 3, averageDestruction: 100 });
    const second = season.players.find((p) => p.tag === '#P1')!;
    expect(second).toMatchObject({ wars: 2, attacks: 1, stars: 2 });
    expect(season.season).toBe('2026-11');
  });
});

describe('mapRaidSeason', () => {
  it('maps a Raid Weekend, bonus attacks included, members by loot', () => {
    const raw: CocCapitalRaidSeason = {
      state: 'ended',
      startTime: '20261030T070000.000Z',
      endTime: '20261102T070000.000Z',
      capitalTotalLoot: 50_000,
      raidsCompleted: 6,
      totalAttacks: 11,
      enemyDistrictsDestroyed: 40,
      offensiveReward: 1500,
      defensiveReward: 400,
      members: [
        { tag: '#A', name: 'A', attacks: 5, attackLimit: 5, bonusAttackLimit: 0, capitalResourcesLooted: 20_000 },
        { tag: '#B', name: 'B', attacks: 6, attackLimit: 5, bonusAttackLimit: 1, capitalResourcesLooted: 30_000 },
      ],
      attackLog: [],
      defenseLog: [],
    };
    const season = mapRaidSeason(raw);
    expect(season).toMatchObject({ state: 'ended', startTime: '2026-10-30T07:00:00.000Z', totalLoot: 50_000, districtsDestroyed: 40 });
    expect(season.members.map((m) => [m.tag, m.attackLimit])).toEqual([
      ['#B', 6],
      ['#A', 5],
    ]);
  });
});
