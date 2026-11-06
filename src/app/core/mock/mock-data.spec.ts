import { HistoryWar } from '../models';
import { awardCommendations, COMMENDATION_TYPES } from '../utils/commendations';
import { historyPeriod, toHistoryWar } from '../utils/monthly-history';
import { generateMockData } from './mock-data';

describe('generateMockData', () => {
  const now = new Date('2026-11-05T12:00:00.000Z');
  const options = { clanTag: '#TEST', clanName: 'Crociata Nera', now };

  it('is deterministic for the same seed', () => {
    expect(generateMockData(options)).toEqual(generateMockData(options));
  });

  it('generates a war in progress followed by ended wars in descending order', () => {
    const { wars } = generateMockData({ ...options, pastWars: 10 });
    expect(wars).toHaveLength(11);
    expect(wars[0].state).toBe('battle');
    expect(wars.slice(1).every((w) => w.state === 'ended')).toBe(true);
    const ends = wars.map((w) => w.endTime);
    expect([...ends].sort().reverse()).toEqual(ends);
    expect(new Set(wars.map((w) => w.id)).size).toBe(wars.length);
  });

  it('respects war rules (attacks, stars, line-ups)', () => {
    const { wars, clan, formerMembers } = generateMockData(options);
    const memberTags = new Set([...clan.members, ...formerMembers].map((m) => m.tag));
    for (const w of wars.filter((x) => x.hasDetails)) {
      expect(w.clan.members).toHaveLength(w.teamSize);
      expect(w.opponent.members).toHaveLength(w.teamSize);
      expect(w.clan.stars).toBeLessThanOrEqual(w.teamSize * 3);
      expect(w.clan.destructionPercentage).toBeLessThanOrEqual(100);
      for (const p of w.clan.members) {
        expect(memberTags.has(p.tag)).toBe(true);
        expect(p.attacks.length).toBeLessThanOrEqual(w.attacksPerMember);
        for (const a of p.attacks) {
          expect(a.stars).toBeGreaterThanOrEqual(0);
          expect(a.stars).toBeLessThanOrEqual(3);
          expect(a.stars === 3).toBe(a.destructionPercentage === 100);
        }
      }
    }
  });

  it('like the API war log, the oldest wars only have the summary', () => {
    const { wars } = generateMockData(options);
    const summaries = wars.filter((w) => !w.hasDetails);
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.every((w) => w.clan.members.length === 0 && w.clan.stars > 0)).toBe(true);
    // They are the oldest: at the end of the list.
    expect(wars.slice(-summaries.length)).toEqual(summaries);
  });

  it('the war in progress includes participants who have not attacked yet', () => {
    const [current] = generateMockData(options).wars;
    expect(current.clan.members.some((p) => p.attacks.length === 0)).toBe(true);
    expect(new Date(current.endTime).getTime()).toBeGreaterThan(now.getTime());
  });

  it('uses no real data: members with generated tags and one leader', () => {
    const { clan } = generateMockData(options);
    expect(clan.tag).toBe('#TEST');
    expect(clan.members.filter((m) => m.role === 'leader')).toHaveLength(1);
    expect(clan.members.every((m) => /^#[0289PYLQGRJCUV]{8,9}$/.test(m.tag))).toBe(true);
  });

  describe('long-term scenario', () => {
    const data = generateMockData(options);
    const detailed = data.wars.filter((w) => w.hasDetails && w.state === 'ended');
    const participants = (w: (typeof detailed)[number]) => new Set(w.clan.members.map((p) => p.tag));

    it('covers about one year of wars', () => {
      const oldest = new Date(data.wars.at(-1)!.endTime).getTime();
      const days = (now.getTime() - oldest) / 86_400_000;
      expect(data.wars.length).toBe(121);
      expect(days).toBeGreaterThan(300);
      expect(days).toBeLessThan(420);
    });

    it('former members appear only in older wars, newcomers only in recent ones', () => {
      const formerTags = new Set(data.formerMembers.map((m) => m.tag));
      const recent = detailed.slice(0, 10);
      const old = detailed.slice(-10);
      expect(recent.some((w) => [...participants(w)].some((t) => formerTags.has(t)))).toBe(false);
      expect(old.some((w) => [...participants(w)].some((t) => formerTags.has(t)))).toBe(true);

      const newcomer = data.clan.members.find((m) => m.name === 'Draghetta')!;
      expect(old.some((w) => participants(w).has(newcomer.tag))).toBe(false);
    });

    it('players upgrade their Town Hall over time', () => {
      const newcomer = data.clan.members.find((m) => m.name === 'Draghetta')!;
      const townHalls = detailed
        .flatMap((w) => w.clan.members.filter((p) => p.tag === newcomer.tag))
        .map((p) => p.townHall);
      expect(Math.max(...townHalls)).toBeGreaterThan(Math.min(...townHalls));
      expect(townHalls[0]).toBe(newcomer.townHall);
    });

    it('leaves the first days of each month to the Clan War League', () => {
      const regular = data.wars.filter((w) => w.state === 'ended');
      expect(regular.every((w) => new Date(w.startTime).getUTCDate() > 8)).toBe(true);
    });

    it('the leader, Templare Nero, earns every commendation at the gold tier each month', () => {
      const leader = data.clan.members.find((m) => m.name === 'Templare Nero')!;
      const history = data.wars.map(toHistoryWar).filter((w): w is HistoryWar => w !== null);
      for (const month of ['2026-10', '2026-09', '2026-06']) {
        const awards = awardCommendations(historyPeriod(month, history, '')!).get(leader.tag);
        expect(awards, month).toEqual(COMMENDATION_TYPES.map((type) => ({ type, tier: 'gold' })));
      }
    });
  });
});
