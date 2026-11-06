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
    const { wars, clan } = generateMockData(options);
    const memberTags = new Set(clan.members.map((m) => m.tag));
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
});
