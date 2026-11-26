import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as memberships } from '@/app/api/v1/auth/me/memberships/route';
import { GET as getClan } from '@/app/api/v1/clan/route';
import { GET as playerProfile } from '@/app/api/v1/players/[tag]/profile/route';
import { GET as raidSeasons } from '@/app/api/v1/raids/seasons/route';
import { GET as currentWar } from '@/app/api/v1/wars/current/route';
import { GET as warLog } from '@/app/api/v1/wars/warlog/route';
import { GET as welcome } from '@/app/api/v1/welcome/route';
import { UserModel } from '@/modules/auth/user.model';
import { mockCocApi } from './coc-mock';
import { call, cocWar, memberToken } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const NERA = '#2J8JVVCLC';
const ROSSA = '#2JU8RPR2G';
const ORO = '#2RRYUGQYJ';
const clanPath = (tag: string) => `/clans/${encodeURIComponent(tag)}`;

const clan = (tag: string, name: string, members: { tag: string; name: string; role: string }[]) => ({
  tag,
  name,
  clanLevel: 20,
  location: { id: 32000120, name: 'Italy', isCountry: true, countryCode: 'IT' },
  badgeUrls: { large: 'https://x/b.png' },
  warWins: 300,
  requiredTownhallLevel: 16,
  requiredLeagueTier: { id: 105000032, name: 'Electro League 32', iconUrls: { large: 'https://x/l.png' } },
  memberList: members.map((m) => ({ ...m, townHallLevel: 17, trophies: 5000, donations: 1200 })),
});

const NERA_CLAN = clan(NERA, 'Crociata Nera', [
  { tag: '#MREADER', name: 'Reader', role: 'admin' },
  { tag: '#AAA111', name: 'Alice', role: 'leader' },
]);
const ROSSA_CLAN = clan(ROSSA, 'Crociata Rossa', [{ tag: '#RRR111', name: 'Rosso', role: 'coLeader' }]);

describe('Clash of Clans data through the backend', () => {
  it('GET /clan: the clan as the API returns it, for members of the clan only', async () => {
    const auth = await memberToken('reader');
    mockCocApi({ [clanPath(NERA)]: { body: NERA_CLAN } });
    const res = await call(getClan, { token: auth });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual(NERA_CLAN);
    expect((await call(getClan)).status).toBe(401);
  });

  it('GET /clan: 502 when the API does not answer', async () => {
    const auth = await memberToken('reader');
    mockCocApi({ [clanPath(NERA)]: { status: 503, body: { reason: 'inMaintenance' } } });
    const res = await call(getClan, { token: auth });
    expect(res.status).toBe(502);
    expect(res.body.messages[0]?.key).toBe('ERROR.COC_API_UNAVAILABLE');
  });

  it('GET /wars/current: the war in the currentwar format, null outside a war or with a private war log', async () => {
    const auth = await memberToken('reader');
    mockCocApi({ '/currentwar': { body: cocWar() } });
    const res = await call(currentWar, { token: auth });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      state: 'inWar',
      preparationStartTime: '20261104T100000.000Z',
      clan: { tag: NERA, stars: 3, members: [{ name: 'Alice', attacks: [{ stars: 3, duration: 120 }] }, { name: 'Bob', attacks: [] }] },
      opponent: { tag: '#OPP999' },
    });

    mockCocApi({ '/currentwar': { body: { state: 'notInWar' } } });
    // Kept 30 seconds: a new reader of the cache sees the same war.
    expect((await call(currentWar, { token: auth })).body.result).not.toBeNull();
  });

  it('GET /wars/current: null with a private war log', async () => {
    const auth = await memberToken('reader');
    mockCocApi({ '/currentwar': { status: 403, body: { reason: 'accessDenied' } } });
    const res = await call(currentWar, { token: auth });
    expect(res.status).toBe(200);
    expect(res.body.result).toBeNull();
  });

  it('GET /wars/warlog: the entries of the war log; empty when private', async () => {
    const auth = await memberToken('reader');
    const items = [
      { result: 'win', endTime: '20261103T100000.000Z', teamSize: 15, clan: { tag: NERA, stars: 40 }, opponent: { tag: '#OPP', stars: 30 } },
    ];
    mockCocApi({ '/warlog': { body: { items } } });
    expect((await call(warLog, { token: auth })).body.result).toEqual(items);
  });

  it('GET /wars/warlog: empty with a private war log', async () => {
    const auth = await memberToken('reader');
    mockCocApi({ '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
    expect((await call(warLog, { token: auth })).body.result).toEqual([]);
  });

  it('GET /players/{tag}/profile: the game profile; 404 for an unknown player', async () => {
    const auth = await memberToken('reader');
    const player = { tag: '#AAA111', name: 'Alice', townHallLevel: 17, heroes: [{ name: 'Barbarian King', level: 95 }] };
    mockCocApi({ '/players/%23AAA111': { body: player }, '/players/%23NOPE1': { status: 404, body: { reason: 'notFound' } } });
    const res = await call(playerProfile, { token: auth, params: { tag: '%23aaa111' } });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual(player);

    const missing = await call(playerProfile, { token: auth, params: { tag: 'NOPE1' } });
    expect(missing.status).toBe(404);
    expect(missing.body.messages[0]?.key).toBe('ERROR.PLAYER_NOT_FOUND');
  });

  it('GET /auth/me/memberships: the accounts of the user in a clan of the Crusade, for any signed-in user', async () => {
    const auth = await memberToken('reader');
    await UserModel.updateOne({ username: 'reader' }, { $push: { playerTags: { $each: ['#RRR111', '#GONE11'] } } });
    mockCocApi({
      [clanPath(NERA)]: { body: NERA_CLAN },
      [clanPath(ROSSA)]: { body: ROSSA_CLAN },
      // A clan that cannot be read is left out.
      [clanPath(ORO)]: { status: 503, body: { reason: 'inMaintenance' } },
    });
    const res = await call(memberships, { token: auth });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual([
      { tag: '#MREADER', name: 'Reader', role: 'elder', townHallLevel: 17, clanTag: NERA, clanName: 'Crociata Nera' },
      { tag: '#RRR111', name: 'Rosso', role: 'coLeader', townHallLevel: 17, clanTag: ROSSA, clanName: 'Crociata Rossa' },
    ]);
    expect((await call(memberships)).status).toBe(401);
  });

  it('GET /welcome: public, the clans with their members by name and role only, and the rankings', async () => {
    mockCocApi({
      [clanPath(NERA)]: { body: NERA_CLAN },
      [clanPath(ROSSA)]: { body: ROSSA_CLAN },
      [clanPath(ORO)]: { status: 503, body: { reason: 'inMaintenance' } },
      '/locations/32000120/rankings/clans': { body: { items: [{ tag: '#OTHER', rank: 1 }, { tag: NERA, rank: 7 }] } },
      '/locations/32000006/rankings/clans': { body: { items: [{ tag: '#OTHER', rank: 1 }] } },
    });
    const res = await call(welcome);
    expect(res.status).toBe(200);
    const { clans, ranks } = res.body.result;
    expect(clans.map((c: { name: string }) => c.name)).toEqual(['Crociata Nera', 'Crociata Rossa']);
    expect(clans[0]).toMatchObject({ tag: NERA, clanLevel: 20, warWins: 300, location: { countryCode: 'IT' } });
    // The requirements to join, as the "Join us" page shows them.
    expect(clans[0]).toMatchObject({
      requiredTownhallLevel: 16,
      requiredLeagueTier: { name: 'Electro League 32', iconUrls: { large: 'https://x/l.png' } },
    });
    expect(clans[0].memberList).toEqual([
      { name: 'Reader', role: 'admin' },
      { name: 'Alice', role: 'leader' },
    ]);
    // Beyond the top 200 of the world: null.
    expect(ranks).toEqual({ local: 7, global: null });
  });

  it('GET /welcome: 502 when the main clan cannot be read; rankings left out when unknown', async () => {
    mockCocApi({ [clanPath(NERA)]: { status: 500, body: { reason: 'unknownException' } } });
    expect((await call(welcome)).status).toBe(502);
  });

  it('GET /raids/seasons: the weekends of the API while none is saved', async () => {
    const auth = await memberToken('raider');
    const items = [
      {
        state: 'ongoing',
        startTime: '20261030T070000.000Z',
        endTime: '20261102T070000.000Z',
        capitalTotalLoot: 90_000,
        raidsCompleted: 5,
        totalAttacks: 30,
        enemyDistrictsDestroyed: 32,
        offensiveReward: 0,
        defensiveReward: 0,
        attackLog: [],
        defenseLog: [],
        members: [],
      },
    ];
    mockCocApi({ '/capitalraidseasons': { body: { items } } });
    expect((await call(raidSeasons, { token: auth })).body.result).toEqual(items);
  });
});
