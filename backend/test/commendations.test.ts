import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { POST as syncPlayers } from '@/app/api/v1/admin/players/sync/route';
import { GET as getPlayer } from '@/app/api/v1/players/[tag]/route';
import { resetEnvCache } from '@/lib/config/env';
import { CommendationAwardModel, CommendationPeriodModel } from '@/modules/commendations/commendation-award.model';
import { previousMonth, syncCommendations } from '@/modules/commendations/commendation-sync.service';
import { awardCwlCommendations, awardRaidCommendations, commendationId, tierFor } from '@/modules/commendations/commendation-rules';
import { PlayerModel } from '@/modules/commendations/player.model';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { syncWars } from '@/modules/wars/war-sync.service';
import { mockCocApi } from './coc-mock';
import { call, cocWar } from './helpers';

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
    expect(tierFor('wall', 1.5)).toBe('gold');
    expect(awardRaidCommendations([{ tag: '#A', capitalResourcesLooted: 28_000 }]).get('#A')).toEqual([{ type: 'capitalRaider', tier: 'silver' }]);
    expect(awardCwlCommendations([{ tag: '#A', name: 'A', wars: 7, attacks: 6, stars: 17 }]).get('#A')).toEqual([{ type: 'cwlStriker', tier: 'silver' }]);
  });

  it('awards the legendary cwlAllAttacks to who attacked every day of the CWL, with at least 3 days', () => {
    const awards = awardCwlCommendations([
      { tag: '#ALL7', name: 'A', wars: 7, attacks: 7, stars: 14 },
      { tag: '#ALL3', name: 'B', wars: 3, attacks: 3, stars: 3 },
      { tag: '#TWO', name: 'C', wars: 2, attacks: 2, stars: 6 },
      { tag: '#MISSED', name: 'D', wars: 7, attacks: 6, stars: 18 },
    ]);
    expect(awards.get('#ALL7')).toEqual([{ type: 'cwlAllAttacks', tier: 'legendary' }]);
    expect(awards.get('#ALL3')).toEqual([{ type: 'cwlAllAttacks', tier: 'legendary' }]);
    expect(awards.has('#TWO')).toBe(false);
    expect(awards.get('#MISSED')).toEqual([{ type: 'cwlStriker', tier: 'gold' }]);
    expect(commendationId({ type: 'cwlAllAttacks', tier: 'legendary' })).toBe('95000028');
    expect(tierFor('cwlAllAttacks', 2)).toBeNull();
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
        expect.objectContaining({ id: '95000028', name: 'cwlAllAttacks-legendary', type: 'cwlAllAttacks', tier: 'legendary', quantity: 1 }),
      ],
    });
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

    // Still October: the month is not closed.
    expect((await syncCommendations(new Date('2026-10-31T12:00:00Z'))).periodsProcessed).toEqual([]);
    const november = await syncCommendations(NOW);
    expect(november.periodsProcessed).toEqual(['month:2026-10']);
    expect(await CommendationPeriodModel.countDocuments({ periodKey: 'month:2026-10' })).toBe(1);
    // Alice attacked in every war: she is on the podium and was always present.
    const alice = await PlayerModel.findOne({ tag: '#AAA111' });
    expect(alice!.commendations.map((c) => c.name)).toEqual(expect.arrayContaining(['champion-gold', 'present-gold']));
  });

  it('exposes a saved player with the commendations to signed-in users', async () => {
    mockCocApi({ [`/clans/%232J8JVVCLC`]: clanResponse });
    await savedRaid({ '#AAA111': 31_000 });
    await syncCommendations(NOW);
    const { body } = await call(signUp, {
      body: { email: 'comm@x.io', username: 'medals', password: 'secret123', repeatPassword: 'secret123' },
    });
    const auth = body.result.accessToken;

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
    return body.result.accessToken;
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
