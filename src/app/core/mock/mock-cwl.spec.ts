import { awardCwlCommendations, awardDonationCommendations, awardRaidCommendations } from '../utils/commendations';
import { buildCwlSeason, mapRaidSeason } from '../utils/cwl';
import { generateMockData } from './mock-data';
import { generateMockCwlSeasons, generateMockDonationSeasons, generateMockRaidSeasons } from './mock-cwl';

describe('mock Clan War League and Raid Weekends', () => {
  // Saturday 7 November: CWL of November in progress, Raid Weekend in progress.
  const now = new Date('2026-11-07T12:00:00Z');
  const { clan } = generateMockData({ clanTag: '#TEST', clanName: 'Crociata Nera', now });
  const leader = clan.members.find((m) => m.name === 'Templare Nero')!;

  describe('CWL', () => {
    const records = generateMockCwlSeasons({ clanTag: clan.tag, clanName: clan.name, members: clan.members, now });
    const seasons = records.map((r) => buildCwlSeason(r, clan.tag));

    it('has the current season in progress and the previous ones ended', () => {
      expect(seasons.map((s) => [s.season, s.state])).toEqual([
        ['2026-11', 'inWar'],
        ['2026-10', 'ended'],
        ['2026-09', 'ended'],
      ]);
      expect(records[1].wars).toHaveLength(28);
      // Current season on the 7th: rounds 1-5 ended, round 6 on its battle day, round 7 in preparation.
      expect(seasons[0].rounds.map((r) => r.state)).toEqual(['ended', 'ended', 'ended', 'ended', 'ended', 'battle', 'preparation']);
    });

    it('a group of 8 clans where every clan meets the others once', () => {
      const ended = seasons[1];
      expect(ended.standings).toHaveLength(8);
      expect(ended.rounds.every((r) => r.war !== null)).toBe(true);
      expect(new Set(ended.rounds.map((r) => r.war!.opponent.tag)).size).toBe(7);
    });

    it('Templare Nero earns the gold cwlStriker; other players get silver or bronze', () => {
      const awards = awardCwlCommendations(seasons[1]);
      expect(awards.get(leader.tag)).toEqual([{ type: 'cwlStriker', tier: 'gold' }]);
      const tiers = new Set([...awards.values()].map(([c]) => c.tier));
      expect(tiers.has('silver') || tiers.has('bronze')).toBe(true);
    });
  });

  describe('Raid Weekends', () => {
    const weekends = generateMockRaidSeasons({ members: clan.members, now }).map(mapRaidSeason);

    it('starts with the weekend in progress, then the ended ones, a week apart', () => {
      expect(weekends[0]).toMatchObject({ state: 'ongoing', startTime: '2026-11-06T07:00:00.000Z' });
      expect(weekends[1]).toMatchObject({ state: 'ended', startTime: '2026-10-30T07:00:00.000Z', endTime: '2026-11-02T07:00:00.000Z' });
      expect(weekends).toHaveLength(10);
    });

    it('Templare Nero earns the gold capitalRaider; others reach silver and bronze', () => {
      const awards = awardRaidCommendations(weekends[1]);
      expect(awards.get(leader.tag)).toEqual([{ type: 'capitalRaider', tier: 'gold' }]);
      const tiers = [...awards.values()].map(([c]) => c.tier);
      expect(tiers).toContain('silver');
      expect(tiers).toContain('bronze');
    });

    it('some current members did not take part', () => {
      const attacked = new Set(weekends[1].members.map((m) => m.tag));
      expect(clan.members.some((m) => !attacked.has(m.tag))).toBe(true);
    });
  });

  describe('donation seasons', () => {
    const seasons = generateMockDonationSeasons({ members: clan.members, now });

    it('starts with the season in progress, then the ended ones, one per month', () => {
      expect(seasons[0]).toMatchObject({ season: '2026-11', state: 'ongoing', startTime: '2026-11-01T08:00:00.000Z' });
      expect(seasons[1]).toMatchObject({
        season: '2026-10',
        state: 'ended',
        startTime: '2026-10-01T08:00:00.000Z',
        endTime: '2026-11-01T08:00:00.000Z',
      });
      expect(seasons[1].players).toHaveLength(clan.members.length);
    });

    it('Templare Nero earns the gold donor; others reach silver and bronze', () => {
      const awards = awardDonationCommendations(seasons[1]);
      expect(awards.get(leader.tag)).toEqual([{ type: 'donor', tier: 'gold' }]);
      const tiers = [...awards.values()].map(([c]) => c.tier);
      expect(tiers).toContain('silver');
      expect(tiers).toContain('bronze');
    });
  });
});
