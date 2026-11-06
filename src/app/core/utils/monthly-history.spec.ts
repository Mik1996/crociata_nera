import { HistoryWar } from '../models';
import { attack, participant, sampleWar } from '../../testing/fixtures';
import {
  aggregateHistoryPlayers,
  historyPeriod,
  monthOf,
  monthSummaries,
  periodLabel,
  toHistoryWar,
} from './monthly-history';

function historyWar(id: string, endTime: string, players: [string, number[]][], attacksPerMember = 2): HistoryWar {
  return {
    id,
    endTime,
    opponent: 'Opponents',
    opponentTag: '#OPP',
    teamSize: players.length,
    attacksPerMember,
    result: 'victory',
    stars: 10,
    starsConceded: 5,
    destruction: 90,
    destructionConceded: 50,
    players: players.map(([tag, stars], i) => ({
      tag,
      name: `G${tag}`,
      townHall: 16,
      mapPosition: i + 1,
      attacksAvailable: attacksPerMember,
      attacks: stars.map((s) => ({ stars: s, destruction: s === 3 ? 100 : 60, defenderTownHall: 16, defenderPosition: 1 })),
      opponentAttacks: 1,
      starsConceded: 2,
    })),
  };
}

describe('monthly-history', () => {
  it('monthOf uses the Italian time zone', () => {
    expect(monthOf('2026-10-31T22:30:00.000Z')).toBe('2026-10');
    expect(monthOf('2026-10-31T23:30:00.000Z')).toBe('2026-11');
  });

  it('periodLabel produces readable labels', () => {
    expect(periodLabel('2026-11')).toBe('Novembre 2026');
    expect(periodLabel('all')).toBe('Tutti i mesi');
    expect(periodLabel('2026-11', 'en-US')).toBe('November 2026');
    expect(periodLabel('2026-11', 'es-ES')).toBe('Noviembre de 2026');
    expect(periodLabel('all', 'en-US', 'All months')).toBe('All months');
  });

  it('toHistoryWar converts only ended wars with details', () => {
    const w = toHistoryWar(sampleWar())!;
    expect(w.result).toBe('victory');
    expect(w.players.map((x) => x.attacks.length)).toEqual([2, 1, 0]);
    expect(w.players[0].attacks[0].defenderPosition).toBe(1);
    expect(toHistoryWar(sampleWar({ state: 'battle' }))).toBeNull();
    expect(toHistoryWar(sampleWar({ hasDetails: false }))).toBeNull();
  });

  it('aggregateHistoryPlayers sums wars and sorts by average stars per war', () => {
    const wars = [
      historyWar('g1', '2026-11-03T09:00:00.000Z', [['#A', [3, 3]], ['#B', [2]], ['#C', [3, 2]]]),
      historyWar('g2', '2026-11-07T09:00:00.000Z', [['#A', [3, 2]], ['#B', [3, 3]]]),
    ];
    const [a, c, b] = aggregateHistoryPlayers(wars);

    // #A 11 stars / 2 wars = 5.5; #C 5 / 1 = 5; #B 8 / 2 = 4.
    expect([a.tag, c.tag, b.tag]).toEqual(['#A', '#C', '#B']);
    expect(a.averageStarsPerWar).toBe(5.5);
    expect(a.threeStars).toBe(3);
    expect(b.attacksMissed).toBe(1);
    expect(b.participation).toBe(75);
    expect(b.averageStarsPerAttack).toBe(2.67);
    expect(b.averageStarsConceded).toBe(2);
  });

  it('breaks ties on the average with destruction', () => {
    const wars = [historyWar('g1', '2026-11-03T09:00:00.000Z', [['#X', [2, 2]], ['#Y', [3, 1]]])];
    // Same average (4): #Y has an average destruction of 80 against 60.
    expect(aggregateHistoryPlayers(wars).map((p) => p.tag)).toEqual(['#Y', '#X']);
  });

  it('historyPeriod filters by month and returns null for an empty month', () => {
    const wars = [
      historyWar('nov', '2026-11-03T09:00:00.000Z', [['#A', [3]]]),
      historyWar('oct', '2026-10-10T09:00:00.000Z', [['#A', [1]]]),
    ];
    expect(historyPeriod('2026-11', wars, 'x')!.wars.map((w) => w.id)).toEqual(['nov']);
    expect(historyPeriod('all', wars, 'x')!.players[0].stars).toBe(4);
    expect(historyPeriod('2026-01', wars, 'x')).toBeNull();
    expect(monthSummaries(wars, 'x').map((m) => [m.month, m.wars])).toEqual([
      ['2026-11', 1],
      ['2026-10', 1],
    ]);
  });

  it('uses the most recent player name and town hall', () => {
    const old = sampleWar({ id: 'o', endTime: '2026-09-01T00:00:00.000Z' });
    old.clan.members = [participant('#A', 1, [attack('#A', '#X', 3, 100)], 15)];
    const recent = sampleWar({ id: 'n', endTime: '2026-10-01T00:00:00.000Z' });
    const stats = aggregateHistoryPlayers([toHistoryWar(recent)!, toHistoryWar(old)!]);
    expect(stats.find((s) => s.tag === '#A')!.townHall).toBe(16);
  });
});
