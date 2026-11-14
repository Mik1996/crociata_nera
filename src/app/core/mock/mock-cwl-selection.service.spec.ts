import { ClanMember } from '../models';
import { mockSelection } from './mock-cwl-selection.service';

const member = (i: number): ClanMember => ({
  tag: `#M${i}`,
  name: `Member ${i}`,
  role: i === 0 ? 'leader' : 'member',
  townHall: 18 - (i % 4),
  expLevel: 200,
  trophies: 5000,
  donations: 0,
  donationsReceived: 0,
});

describe('mockSelection', () => {
  it('follows the rules of the backend: eligible first, 15 starters and 3 reserves', () => {
    const selection = mockSelection(
      Array.from({ length: 40 }, (_, i) => member(i)),
      new Date('2026-11-14T00:00:00Z'),
    );
    const players = selection.players;
    expect(selection.maxTownHall).toBe(18);
    expect(selection.seasons).toEqual(['2026-10', '2026-09', '2026-08', '2026-07']);
    expect(players.filter((p) => p.status === 'starter')).toHaveLength(15);
    expect(players.filter((p) => p.status === 'reserve')).toHaveLength(3);
    const firstIneligible = players.findIndex((p) => !p.eligible);
    expect(players.slice(firstIneligible).every((p) => !p.eligible)).toBe(true);
    expect(players.filter((p) => !p.eligible).every((p) => p.townHallLevel! < 17)).toBe(true);
  });

  it('marks the excluded players, who keep their place and take no slot', () => {
    const members = Array.from({ length: 40 }, (_, i) => member(i));
    const now = new Date('2026-11-14T00:00:00Z');
    const first = mockSelection(members, now).players[0];
    const exclusion = { reason: 'Away', excludedBy: 'demo', excludedAt: now.toISOString() };
    const players = mockSelection(members, now, new Map([[first.tag, exclusion]])).players;
    expect(players[0]).toMatchObject({
      tag: first.tag,
      status: 'excluded',
      eligible: false,
      exclusion,
    });
    expect(players.filter((p) => p.status === 'starter')).toHaveLength(15);
  });
});
