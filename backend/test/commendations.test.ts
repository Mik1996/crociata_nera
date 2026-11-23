import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as signIn } from '@/app/api/v1/auth/sign-in/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { UserModel } from '@/modules/auth/user.model';
import { POST as syncPlayers } from '@/app/api/v1/admin/players/sync/route';
import { GET as getPlayer } from '@/app/api/v1/players/[tag]/route';
import { resetEnvCache } from '@/lib/config/env';
import { CommendationAwardModel, CommendationPeriodModel } from '@/modules/commendations/commendation-award.model';
import { migrateSingleCommendations, previousMonth, syncCommendations } from '@/modules/commendations/commendation-sync.service';
import { AnnouncementModel } from '@/modules/announcements/announcement.model';
import {
  awardCwlCommendations,
  awardLegendCommendations,
  awardRaidCommendations,
  awardWarCommendations,
  commendationId,
  tierFor,
} from '@/modules/commendations/commendation-rules';
import type { HistoryWar } from '@/modules/wars/history.service';
import { PlayerModel } from '@/modules/commendations/player.model';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { LegendSeasonModel } from '@/modules/legends/legend-season.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { syncWars } from '@/modules/wars/war-sync.service';
import { mockCocApi } from './coc-mock';
import { call, cocWar, memberToken } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ADMIN_EMAILS;
  resetEnvCache();
});

const CLAN = '#2J8JVVCLC';
const NOW = new Date('2026-11-07T12:00:00Z');

const clanResponse = { body: { tag: CLAN, memberList: [
  { tag: '#AAA111', name: 'Alice', role: 'leader', townHallLevel: 16, expLevel: 250, trophies: 5200, leagueTier: { id: 105000036, name: 'Legend League', iconUrls: { small: 's.png', large: 'l.png' } } },
  { tag: '#AAA222', name: 'Bob', role: 'member', townHallLevel: 15, expLevel: 200, trophies: 4800 },
] } };

async function savedRaid(loot: Record<string, number>) {
  await RaidSeasonModel.create({
    clanTag: CLAN,
    startTime: new Date('2026-10-30T07:00:00Z'),
    endTime: new Date('2026-11-02T07:00:00Z'),
    state: 'ended',
    hasMembers: true,
    lastSyncedAt: NOW,
    season: {
      state: 'ended',
      members: Object.entries(loot).map(([tag, capitalResourcesLooted]) => ({ tag, name: tag === '#AAA111' ? 'Alice' : 'Bob', capitalResourcesLooted })),
    },
  });
}

describe('commendation rules', () => {
  it('match the frontend thresholds', () => {
    expect(tierFor('capitalRaider', 25_000)).toBeNull();
    expect(tierFor('capitalRaider', 30_001)).toBe('gold');
    expect(tierFor('champion', 1)).toBe('gold');
    expect(tierFor('wall', 2)).toBe('gold');
    expect(awardRaidCommendations([{ tag: '#A', capitalResourcesLooted: 28_000 }]).get('#A')).toEqual([{ type: 'capitalRaider', tier: 'silver' }]);
    expect(awardCwlCommendations([{ tag: '#A', name: 'A', wars: 7, attacks: 6, stars: 17 }]).get('#A')).toEqual([{ type: 'cwlStriker', tier: 'silver' }]);
  });

  it('awards the one-off cwlAllAttacks to who attacked every day of the CWL, with at least 3 days', () => {
    const awards = awardCwlCommendations([
      { tag: '#ALL7', name: 'A', wars: 7, attacks: 7, stars: 14 },
      { tag: '#ALL3', name: 'B', wars: 3, attacks: 3, stars: 3 },
      { tag: '#TWO', name: 'C', wars: 2, attacks: 2, stars: 6 },
      { tag: '#MISSED', name: 'D', wars: 7, attacks: 6, stars: 18 },
    ]);
    expect(awards.get('#ALL7')).toEqual([{ type: 'cwlAllAttacks', tier: null }]);
    expect(awards.get('#ALL3')).toEqual([{ type: 'cwlAllAttacks', tier: null }]);
    expect(awards.has('#TWO')).toBe(false);
    expect(awards.get('#MISSED')).toEqual([{ type: 'cwlStriker', tier: 'gold' }]);
    expect(commendationId({ type: 'cwlAllAttacks', tier: null })).toBe('95000028');
  });

  describe('chiefHunter (three stars on the enemy number 1)', () => {
    /** A 2v2 war (6 stars) from attacks `[attacker, defender position, stars]` in order. */
    const war = (...attacks: [string, number, number][]): HistoryWar => ({
      id: 'W', endTime: '2026-10-04T20:00:00.000Z', opponent: 'Opp', opponentTag: '#OPP', teamSize: 2, attacksPerMember: 2,
      result: 'victory', stars: 0, starsConceded: 0, destruction: 0, destructionConceded: 0,
      players: ['#A', '#B'].map((tag, i) => ({
        tag, name: tag, townHall: 16, mapPosition: i + 1, attacksAvailable: 2, opponentAttacks: 0, starsConceded: 0,
        attacks: attacks.flatMap(([attacker, defenderPosition, stars], order) =>
          attacker === tag ? [{ stars, destruction: stars === 3 ? 100 : 60, defenderTownHall: 16, defenderPosition, order: order + 1 }] : []),
      })),
    });
    const hunters = (w: HistoryWar) => [...awardWarCommendations(w)].map(([tag, items]) => [tag, items]);
    const medal = [{ type: 'chiefHunter', tier: null }];

    it('goes to the first three stars on the number 1', () => {
      expect(hunters(war(['#A', 1, 2], ['#B', 1, 3]))).toEqual([['#B', medal]]);
      expect(hunters(war(['#A', 2, 3], ['#A', 1, 2]))).toEqual([]);
      expect(commendationId({ type: 'chiefHunter', tier: null })).toBe('95000029');
    });

    it('a repeat three stars on the number 1 only once every star of the war was taken', () => {
      // #B hits the number 1 again while the number 2 still has stars to give: no medal.
      expect(hunters(war(['#A', 1, 3], ['#B', 1, 3], ['#B', 2, 3]))).toEqual([['#A', medal]]);
      // #B hits it again after 6/6 stars: medal.
      expect(hunters(war(['#A', 1, 3], ['#A', 2, 3], ['#B', 1, 3]))).toEqual([['#A', medal], ['#B', medal]]);
    });

    it('replays the attacks in war order, not in member order', () => {
      // #B (second member) three-stars the number 1 first; #A repeats it while the number 2 is open.
      const w = war(['#B', 1, 3], ['#A', 1, 3]);
      expect(hunters(w)).toEqual([['#B', medal]]);
    });

    it('one medal per player and war', () => {
      expect(hunters(war(['#A', 1, 3], ['#B', 2, 3], ['#A', 1, 3]))).toEqual([['#A', medal]]);
    });
  });

  describe('fortress and perfectWar (one-off medals of a war)', () => {
    /** A 2v2 war: per player `[attacks made, attacks received, best stars conceded, stars of each attack]`. */
    const war = (result: HistoryWar['result'], stars: number, ...players: [number, number, number, number?][]): HistoryWar => ({
      id: 'W', endTime: '2026-10-04T20:00:00.000Z', opponent: 'Opp', opponentTag: '#OPP', teamSize: 2, attacksPerMember: 2,
      result, stars, starsConceded: 0, destruction: 0, destructionConceded: 0,
      players: players.map(([made, received, conceded, attackStars = 3], i) => ({
        tag: `#P${i + 1}`, name: `P${i + 1}`, townHall: 16, mapPosition: i + 1, attacksAvailable: 2,
        opponentAttacks: received, starsConceded: conceded,
        attacks: Array.from({ length: made }, (_, k) => ({ stars: attackStars, destruction: 50, defenderTownHall: 16, defenderPosition: 2, order: 10 * i + k })),
      })),
    });
    const types = (w: HistoryWar, tag: string) => (awardWarCommendations(w).get(tag) ?? []).map((c) => c.type);

    it('fortress: attacked at least twice and never three-starred', () => {
      const w = war('defeat', 3, [1, 2, 2], [1, 3, 3], [1, 1, 0]);
      expect(types(w, '#P1')).toEqual(['fortress']);
      expect(types(w, '#P2')).toEqual([]);
      // Attacked once only: too little to call it a fortress.
      expect(types(w, '#P3')).toEqual([]);
      expect(commendationId({ type: 'fortress', tier: null })).toBe('95000030');
    });

    it('perfectWar: three stars with every attack, in a war won with every star', () => {
      const w = war('victory', 6, [2, 0, 0], [0, 0, 0], [2, 0, 0, 2]);
      expect(types(w, '#P1')).toEqual(['perfectWar']);
      // No attack, or an attack short of three stars: no medal.
      expect(types(w, '#P2')).toEqual([]);
      expect(types(w, '#P3')).toEqual([]);
      // A war one star short: none at all.
      expect(types(war('victory', 5, [2, 0, 0]), '#P1')).toEqual([]);
      expect(commendationId({ type: 'perfectWar', tier: null })).toBe('95000031');
    });
  });

  it('legendTop: a Legend League season ended among the first 10,000 of the world', () => {
    const awards = awardLegendCommendations([{ tag: '#TOP', rank: 10_000 }, { tag: '#OUT', rank: 10_001 }]);
    expect([...awards]).toEqual([['#TOP', [{ type: 'legendTop', tier: null }]]]);
    expect(commendationId({ type: 'legendTop', tier: null })).toBe('95000032');
  });

  it('previous month in the Italian time zone', () => {
    expect(previousMonth(new Date('2026-11-07T12:00:00Z'))).toBe('2026-10');
    expect(previousMonth(new Date('2026-01-05T12:00:00Z'))).toBe('2025-12');
  });
});

describe('commendation sync', () => {
  it('updates the members with their Clash of Clans data', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    expect((await syncCommendations(NOW)).membersUpdated).toBe(2);
    expect(await PlayerModel.findOne({ tag: '#AAA111' })).toMatchObject({
      name: 'Alice', role: 'leader', townHallLevel: 16, trophies: 5200, inClan: true, league: { name: 'Legend League', iconUrl: 'l.png' },
    });
  });

  it('awards an ended Raid Weekend once, and the history stays frozen', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    await savedRaid({ '#AAA111': 31_000, '#AAA222': 26_000 });

    const first = await syncCommendations(NOW);
    expect(first.periodsProcessed).toEqual(['raid:2026-10-30T07:00:00.000Z']);
    expect((await PlayerModel.findOne({ tag: '#AAA111' }))!.commendations).toEqual([
      expect.objectContaining({ id: '95000015', name: 'capitalRaider-gold', type: 'capitalRaider', tier: 'gold', quantity: 1 }),
    ]);

    // Running again adds nothing; changing the saved data later does not change the awards.
    await RaidSeasonModel.updateOne({}, { $set: { 'season.members.0.capitalResourcesLooted': 1 } });
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([]);
    expect(await CommendationAwardModel.countDocuments()).toBe(2);
    expect((await PlayerModel.findOne({ tag: '#AAA111' }))!.commendations[0]!.quantity).toBe(1);
    expect((await PlayerModel.findOne({ tag: '#AAA222' }))!.commendations[0]).toMatchObject({ id: '95000013', name: 'capitalRaider-bronze' });
  });

  it('awards a Raid Weekend also to raiders now in another clan of the Crusade', async () => {
    // #RED001 raided in Crociata Nera, then moved to Crociata Rossa: not in the member list anymore.
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    await RaidSeasonModel.create({
      clanTag: CLAN, startTime: new Date('2026-10-30T07:00:00Z'), endTime: new Date('2026-11-02T07:00:00Z'),
      state: 'ended', hasMembers: true, lastSyncedAt: NOW,
      season: { members: [{ tag: '#RED001', name: 'Red', capitalResourcesLooted: 28_000 }] },
    });
    await syncCommendations(NOW);
    expect(await PlayerModel.findOne({ tag: '#RED001' })).toMatchObject({
      name: 'Red', inClan: false, commendations: [expect.objectContaining({ id: '95000014', name: 'capitalRaider-silver', quantity: 1 })],
    });
  });

  it('counts the same commendation earned in several periods', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    await savedRaid({ '#AAA111': 31_000 });
    await RaidSeasonModel.create({
      clanTag: CLAN, startTime: new Date('2026-10-23T07:00:00Z'), endTime: new Date('2026-10-26T07:00:00Z'),
      state: 'ended', hasMembers: true, lastSyncedAt: NOW,
      season: { members: [{ tag: '#AAA111', name: 'Alice', capitalResourcesLooted: 32_000 }] },
    });
    await syncCommendations(NOW);
    expect((await PlayerModel.findOne({ tag: '#AAA111' }))!.commendations).toEqual([
      expect.objectContaining({ id: '95000015', name: 'capitalRaider-gold', quantity: 2 }),
    ]);
  });

  it('moves the one-off commendations saved with the old legendary tier to no tier', async () => {
    const legacy = { periodKey: 'cwl:2026-09', playerTag: '#OLD1', playerName: 'Old', commendationId: '95000028', type: 'cwlAllAttacks', tier: 'legendary', awardedAt: NOW };
    await CommendationAwardModel.collection.insertMany([legacy, { ...legacy, periodKey: 'cwl:2026-08' }]);
    await PlayerModel.collection.insertOne({
      tag: '#OLD1', name: 'Old', commendations: [{ id: '95000028', name: 'cwlAllAttacks-legendary', type: 'cwlAllAttacks', tier: 'legendary', quantity: 2 }],
    });
    await AnnouncementModel.collection.insertOne({
      key: 'cwl:2026-09@#2J8JVVCLC', data: { honours: [
        { type: 'cwlAllAttacks', tier: 'legendary', players: [] },
        { type: 'cwlStriker', tier: 'gold', players: [] },
      ] },
    });

    await migrateSingleCommendations();
    await migrateSingleCommendations();

    expect(await CommendationAwardModel.countDocuments({ tier: null, commendationId: '95000028' })).toBe(2);
    expect((await PlayerModel.findOne({ tag: '#OLD1' }).lean())!.commendations).toEqual([
      expect.objectContaining({ id: '95000028', name: 'cwlAllAttacks', type: 'cwlAllAttacks', tier: null, quantity: 2 }),
    ]);
    const announcement = await AnnouncementModel.collection.findOne({ key: 'cwl:2026-09@#2J8JVVCLC' });
    expect(announcement!.data.honours.map((h: { tier: string | null }) => h.tier)).toEqual([null, 'gold']);
  });

  it('awards an ended CWL season (also to a player who left the clan, who attacked every day)', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    const war = (state: string, clanSide: boolean) => {
      const own = { tag: CLAN, members: [{ tag: '#GONE1', name: 'Gone', attacks: [{ stars: 3 }] }] };
      const other = { tag: '#OPP', members: [] };
      return { warTag: `#W${Math.random()}`, state, war: { state, clan: clanSide ? own : other, opponent: clanSide ? other : own } };
    };
    await CwlSeasonModel.create({
      season: '2026-10', clanTag: CLAN, state: 'ended', clans: [], rounds: [], lastSyncedAt: NOW,
      wars: [war('warEnded', true), war('warEnded', false), war('warEnded', true)],
    });
    await syncCommendations(NOW);
    expect(await PlayerModel.findOne({ tag: '#GONE1' })).toMatchObject({
      name: 'Gone', inClan: false, commendations: [
        expect.objectContaining({ name: 'cwlStriker-gold', type: 'cwlStriker', tier: 'gold', quantity: 1 }),
        expect.objectContaining({ id: '95000028', name: 'cwlAllAttacks', type: 'cwlAllAttacks', tier: null, quantity: 1 }),
      ],
    });
  });

  it('awards chiefHunter as soon as a war has ended, once per war', async () => {
    // Alice three-stars the enemy number 1 (Eve, map position 1).
    mockCocApi({ '/currentwar': { body: cocWar() } });
    await syncWars(new Date('2026-11-05T12:00:00Z'));
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([]);

    mockCocApi({ '/currentwar': { body: cocWar({ state: 'warEnded' }) }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
    await syncWars(new Date('2026-11-06T11:00:00Z'));
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual(['war:20261104T100000-OPP999']);
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([]);
    expect((await PlayerModel.findOne({ tag: '#AAA111' }))!.commendations).toEqual([
      expect.objectContaining({ id: '95000029', name: 'chiefHunter', type: 'chiefHunter', tier: null, quantity: 1 }),
    ]);
    expect(await CommendationAwardModel.countDocuments({ playerTag: '#AAA222' })).toBe(0);
  });

  it('checks again a Legend League season whose results were read after it was closed', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    const seasonId = 'v2-2026-10-26T05:00:00Z';
    await LegendSeasonModel.create({ seasonId, endTime: new Date('2026-10-26T05:00:00Z'), results: [], processedAt: new Date('2026-11-01T00:00:00Z') });
    expect((await syncCommendations(new Date('2026-11-02T00:00:00Z'))).periodsProcessed).toEqual([`legends:${seasonId}`]);
    expect(await CommendationAwardModel.countDocuments()).toBe(0);

    // Its results are read late (it ended before Legend League was tracked).
    await LegendSeasonModel.updateOne({ seasonId }, {
      $set: { results: [{ tag: '#AAA111', name: 'Alice', clanTag: CLAN, rank: 812, trophies: 5400 }], resultsReadLateAt: new Date('2026-11-05T00:00:00Z') },
    });
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([`legends:${seasonId}`]);
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([]);
    expect((await PlayerModel.findOne({ tag: '#AAA111' }))!.commendations).toEqual([
      expect.objectContaining({ id: '95000032', name: 'legendTop', quantity: 1 }),
    ]);
    expect(await CommendationPeriodModel.findOne({ periodKey: `legends:${seasonId}` }).lean()).toMatchObject({ awards: 1 });
  });

  it('checks the wars closed before a war commendation existed for the new kinds only, once', async () => {
    // A perfect war (6/6 stars): Alice three-stars the number 1; Bob is attacked twice, never three-starred.
    const base = cocWar();
    const [alice, bob] = base.clan.members;
    const war = cocWar({
      state: 'warEnded',
      clan: {
        ...base.clan, stars: 6,
        members: [alice, {
          ...bob, opponentAttacks: 2,
          bestOpponentAttack: { attackerTag: '#BBB222', defenderTag: '#AAA222', stars: 2, destructionPercentage: 80, order: 2, duration: 100 },
        }],
      },
    });
    mockCocApi({ '/currentwar': { body: war }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
    await syncWars(new Date('2026-11-06T11:00:00Z'));
    // Closed by an earlier version, when chiefHunter was the only war commendation.
    const key = 'war:20261104T100000-OPP999';
    const closedAt = new Date('2026-11-06T12:00:00Z');
    await CommendationPeriodModel.create({ periodKey: key, awards: 1, processedAt: closedAt });
    await CommendationAwardModel.create({
      periodKey: key, playerTag: '#AAA111', playerName: 'Alice', commendationId: '95000029', type: 'chiefHunter', tier: null, awardedAt: closedAt,
    });

    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([key]);
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([]);

    const awards = await CommendationAwardModel.find({ periodKey: key }).sort({ playerTag: 1, commendationId: 1 }).lean();
    expect(awards.map((a) => `${a.playerTag} ${a.type}`)).toEqual(['#AAA111 chiefHunter', '#AAA111 perfectWar', '#AAA222 fortress']);
    // The award given earlier is untouched.
    expect(awards[0]!.awardedAt).toEqual(closedAt);
    expect(await CommendationPeriodModel.findOne({ periodKey: key }).lean()).toMatchObject({
      processedAt: closedAt, awards: 3, kinds: ['chiefHunter', 'fortress', 'perfectWar'],
    });
    expect((await PlayerModel.findOne({ tag: '#AAA111' }))!.commendations.map((c) => `${c.name} ×${c.quantity}`)).toEqual([
      'chiefHunter ×1', 'perfectWar ×1',
    ]);
  });

  it('awards legendTop once per processed Legend League season, for every clan of the Crusade', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    const season = { endTime: new Date('2026-10-26T05:00:00Z'), results: [{ tag: '#RED9', name: 'Red', clanTag: '#ROSSA', rank: 812, trophies: 6100 }] };
    await LegendSeasonModel.create({ seasonId: 'v2-2026-10-26T05:00:00Z', ...season, processedAt: NOW });
    // Not processed yet: its results are not final.
    await LegendSeasonModel.create({ seasonId: 'v2-2026-11-23T05:00:00Z', endTime: new Date('2026-11-23T05:00:00Z'), results: [] });

    expect((await syncCommendations(NOW)).periodsProcessed).toEqual(['legends:v2-2026-10-26T05:00:00Z']);
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual([]);
    expect((await PlayerModel.findOne({ tag: '#RED9' }))!.commendations).toEqual([
      expect.objectContaining({ id: '95000032', name: 'legendTop', type: 'legendTop', tier: null, quantity: 1 }),
    ]);
  });

  it('awards completed months only, never the month in progress', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    for (const [day, opponent] of [['04', '#OPP1'], ['10', '#OPP2'], ['20', '#OPP3']] as const) {
      const war = cocWar({
        state: 'warEnded',
        preparationStartTime: `202610${day}T100000.000Z`, startTime: `202610${day}T100000.000Z`, endTime: `202610${day}T200000.000Z`,
        opponent: { ...cocWar().opponent, tag: opponent },
      });
      mockCocApi({ '/currentwar': { body: war }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
      await syncWars(new Date('2026-10-31T00:00:00Z'));
    }
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });

    // Still October: the month is not closed (each ended war is its own period, closed at once).
    const months = (report: { periodsProcessed: string[] }) => report.periodsProcessed.filter((key) => key.startsWith('month:'));
    expect(months(await syncCommendations(new Date('2026-10-31T12:00:00Z')))).toEqual([]);
    const november = await syncCommendations(NOW);
    expect(november.periodsProcessed).toEqual(['month:2026-10']);
    expect(await CommendationPeriodModel.countDocuments({ periodKey: 'month:2026-10' })).toBe(1);
    // Alice attacked in every war: she is on the podium and was always present.
    const alice = await PlayerModel.findOne({ tag: '#AAA111' });
    expect(alice!.commendations.map((c) => c.name)).toEqual(expect.arrayContaining(['champion-gold', 'present-gold']));
  });

  it('closes a month a few hours after its end, once every war ending in it is saved as ended', async () => {
    const octoberWar = (state: string, day: string, opponent: string) =>
      cocWar({
        state,
        preparationStartTime: `202610${day}T100000.000Z`, startTime: `202610${day}T120000.000Z`, endTime: `202610${day}T200000.000Z`,
        opponent: { ...cocWar().opponent, tag: opponent },
      });
    mockCocApi({ '/currentwar': { body: octoberWar('warEnded', '04', '#OPP1') }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
    await syncWars(new Date('2026-10-05T00:00:00Z'));
    // Last read of the second war during its battle day: the API was down when it ended.
    mockCocApi({ '/currentwar': { body: octoberWar('inWar', '30', '#OPP2') } });
    await syncWars(new Date('2026-10-30T15:00:00Z'));
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });

    // A war ending in October is still open: only the ended one is awarded.
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual(['war:20261004T100000-OPP1']);

    mockCocApi({ '/currentwar': { status: 503, body: { reason: 'inMaintenance' } } });
    expect((await syncWars(new Date('2026-10-31T23:00:00Z'))).finalized).toEqual(['20261030T100000-OPP2']);
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    // Just after midnight in Italy (23:30 UTC): too early for the month, the war is awarded at once.
    expect((await syncCommendations(new Date('2026-10-31T23:30:00Z'))).periodsProcessed).toEqual(['war:20261030T100000-OPP2']);
    expect((await syncCommendations(NOW)).periodsProcessed).toEqual(['month:2026-10']);
  });

  it('exposes a saved player with the commendations to signed-in users', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    await savedRaid({ '#AAA111': 31_000 });
    await syncCommendations(NOW);
    const auth = await memberToken('medals');

    const player = await call(getPlayer, { token: auth, params: { tag: '%23aaa111' } });
    expect(player.body.result).toMatchObject({
      tag: '#AAA111', name: 'Alice', inClan: true,
      commendations: [{ id: '95000015', name: 'capitalRaider-gold', type: 'capitalRaider', tier: 'gold', quantity: 1 }],
    });
    expect((await call(getPlayer, { token: auth, params: { tag: '%23NOBODY' } })).status).toBe(404);
    expect((await call(getPlayer, { params: { tag: '%23AAA111' } })).status).toBe(401);
  });
});

describe('commendation format', () => {
  it('has a catalogue id, name <type>-<tier>, type and tier; awards saved in the old format are migrated', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    // Old format: id `<type>-<tier>` and a name, no type/tier (inserted as it is in the database).
    await CommendationAwardModel.collection.insertOne({
      periodKey: 'raid:2026-10-23T07:00:00.000Z', playerTag: '#AAA111', playerName: 'Alice',
      commendationId: 'capitalRaider-gold', name: 'commendations.capitalRaider.gold', awardedAt: NOW,
    });
    await PlayerModel.collection.insertOne({
      tag: '#AAA111', name: 'Alice', commendations: [{ id: 'capitalRaider-gold', name: 'commendations.capitalRaider.gold', quantity: 1 }],
    });

    await syncCommendations(NOW);

    expect(await CommendationAwardModel.findOne().lean()).toMatchObject({ commendationId: '95000015', type: 'capitalRaider', tier: 'gold' });
    expect((await PlayerModel.findOne({ tag: '#AAA111' }).lean())!.commendations).toEqual([{ id: '95000015', name: 'capitalRaider-gold', type: 'capitalRaider', tier: 'gold', quantity: 1 }]);
  });
});

describe('POST /api/v1/admin/players/sync', () => {
  async function register(name: string, ip: string): Promise<string> {
    const { body } = await call(signUp, {
      body: { email: `${name}@crociata.it`, username: name, password: 'secret123', repeatPassword: 'secret123' },
      ip,
    });
    // `ADMIN_EMAILS` grant the role to confirmed addresses only, at the next sign-in.
    await UserModel.updateOne({ _id: body.result.user.id }, { $set: { emailVerified: true } });
    const signedIn = await call(signIn, { body: { identifier: name, password: 'secret123' }, ip });
    return signedIn.body.result.accessToken;
  }

  it('saves the clan members missing from the database (ADMIN only)', async () => {
    process.env.ADMIN_EMAILS = 'boss@crociata.it';
    resetEnvCache();
    const admin = await register('boss', '10.0.1.1');
    const plain = await register('plain', '10.0.1.2');
    // A player already saved (e.g. with commendations): kept, data refreshed.
    await PlayerModel.create({ tag: '#AAA222', name: 'Old Bob', commendations: [{ id: '95000024', name: 'present-gold', type: 'present', tier: 'gold', quantity: 1 }] });
    await PlayerModel.create({ tag: '#LEFT1', name: 'Gone', inClan: true });
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });

    expect((await call(syncPlayers, { token: plain, method: 'POST' })).status).toBe(403);

    const res = await call(syncPlayers, { token: admin, method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ created: [{ tag: '#AAA111', name: 'Alice' }], updated: 1, left: 1, nextCheckAt: null });
    expect(await PlayerModel.findOne({ tag: '#AAA222' })).toMatchObject({
      name: 'Bob', inClan: true, commendations: [expect.objectContaining({ id: '95000024', name: 'present-gold', quantity: 1 })],
    });
    expect(await PlayerModel.findOne({ tag: '#LEFT1' })).toMatchObject({ inClan: false });

    // Running it again creates nothing.
    expect((await call(syncPlayers, { token: admin, method: 'POST' })).body.result.created).toEqual([]);
  });

  it('answers 502 when Clash of Clans cannot be read', async () => {
    process.env.ADMIN_EMAILS = 'boss2@crociata.it';
    resetEnvCache();
    const admin = await register('boss2', '10.0.1.3');
    mockCocApi({ [`/clans/%232J8JVVCLC`]: { status: 503, body: { reason: 'inMaintenance' } } });
    const res = await call(syncPlayers, { token: admin, method: 'POST' });
    expect(res.status).toBe(502);
    expect(res.body.messages).toEqual([{ key: 'ERROR.PLAYERS_SYNC_FAILED' }]);
  });
});
