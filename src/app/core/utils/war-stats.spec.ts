import { attack, member, participant, sampleWar } from '../../testing/fixtures';
import {
  clanTrend,
  computePlayerStats,
  computeWarKpi,
  efficiency,
  participantRows,
  rankPerformers,
  warResult,
} from './war-stats';

describe('war-stats', () => {
  describe('warResult', () => {
    it('returns "ongoing" when the war has not ended', () => {
      expect(warResult(sampleWar({ state: 'battle' }))).toBe('ongoing');
    });

    it('breaks a tie on stars with destruction', () => {
      // Fixture: 5 stars vs 5, 60% vs 56.67%.
      expect(warResult(sampleWar())).toBe('victory');
    });

    it('recognises defeat and draw', () => {
      const w = sampleWar();
      expect(warResult({ ...w, opponent: { ...w.opponent, stars: 6 } })).toBe('defeat');
      expect(
        warResult({ ...w, opponent: { ...w.opponent, destructionPercentage: 60 } }),
      ).toBe('draw');
    });
  });

  it('computeWarKpi counts attacks, averages and participation', () => {
    const kpi = computeWarKpi(sampleWar());
    expect(kpi).toEqual({
      attacksAvailable: 6,
      attacksUsed: 3,
      averageStars: 2,
      threeStarRate: 33.3,
      participation: 66.7,
      participantsWithoutAttacks: 1,
    });
  });

  it('participantRows resolves targets with the opponent map position', () => {
    const rows = participantRows(sampleWar());
    const a = rows.find((r) => r.tag === '#A')!;
    expect(a.stars).toBe(5);
    expect(a.averageDestruction).toBe(90);
    expect(a.targets.map((t) => t.mapPosition)).toEqual([1, 2]);
    expect(rows.find((r) => r.tag === '#C')!.hasAttacked).toBe(false);
  });

  describe('computePlayerStats', () => {
    const old = sampleWar({
      id: 'g0',
      endTime: '2026-09-01T09:00:00.000Z',
      clan: {
        ...sampleWar().clan,
        members: [participant('#A', 1, [attack('#A', '#X', 1, 40)])],
      },
    });
    const recent = sampleWar();
    const withoutA = sampleWar({
      id: 'g2',
      clan: { ...sampleWar().clan, members: [participant('#B', 1)] },
    });

    it('aggregates attendance, attacks and stars over the given wars', () => {
      const s = computePlayerStats(member('#A'), [withoutA, recent, old]);
      expect(s.warsPlayed).toBe(2);
      expect(s.warsTotal).toBe(3);
      expect(s.attendance).toBe(66.7);
      expect(s.attacksAvailable).toBe(4);
      expect(s.attacksUsed).toBe(3);
      expect(s.totalStars).toBe(6);
      expect(s.averageStars).toBe(2);
      expect(s.threeStarRate).toBe(33.3);
      expect(s.averageDestruction).toBe(73.3);
      // History in chronological order.
      expect(s.history.map((p) => p.warId)).toEqual(['g0', 'g1']);
    });

    it('handles a player without wars', () => {
      const s = computePlayerStats(member('#NEW'), [recent]);
      expect(s.warsPlayed).toBe(0);
      expect(s.averageStars).toBe(0);
      expect(s.attendance).toBe(0);
      expect(efficiency(s)).toBe(0);
    });
  });

  it('rankPerformers penalises unused attacks and excludes players with few wars', () => {
    const w = sampleWar();
    const wars = [w, { ...w, id: 'g2' }, { ...w, id: 'g3' }];
    const stats = ['#A', '#B', '#C'].map((t) => computePlayerStats(member(t), wars));
    expect(rankPerformers(stats).map((s) => s.tag)).toEqual(['#A', '#B', '#C']);
    expect(rankPerformers(stats, 4)).toEqual([]);
  });

  it('clanTrend sorts from the oldest war', () => {
    const recent = sampleWar({ id: 'new', endTime: '2026-10-10T00:00:00.000Z' });
    const old = sampleWar({ id: 'old', endTime: '2026-09-10T00:00:00.000Z' });
    const points = clanTrend([recent, old]);
    expect(points.map((p) => p.warId)).toEqual(['old', 'new']);
    expect(points[0].participation).toBe(50);
  });
});
