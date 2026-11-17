import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as cwlPlayers } from '@/app/api/v1/cwl/seasons/[season]/players/route';
import { GET as selectionPlayers } from '@/app/api/v1/cwl/selection/players/route';
import { GET as periodRanking } from '@/app/api/v1/history/[period]/ranking/route';
import { GET as periodWars } from '@/app/api/v1/history/[period]/wars/route';
import { GET as playerWars } from '@/app/api/v1/players/[tag]/wars/route';
import { GET as players } from '@/app/api/v1/players/route';
import { GET as raidMembers } from '@/app/api/v1/raids/seasons/[startTime]/members/route';
import { GET as participants } from '@/app/api/v1/wars/[warKey]/participants/route';
import { GET as warHistory } from '@/app/api/v1/wars/history/route';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { defineTable, parseTableQuery, queryTable } from '@/lib/table/table-query';
import { UserModel } from '@/modules/auth/user.model';
import { PlayerModel } from '@/modules/commendations/player.model';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { WarModel } from '@/modules/wars/war.model';
import { upsertWarSnapshot } from '@/modules/wars/wars.service';
import { cocWarSchema } from '@/modules/wars/wars.schemas';
import { mockCocApi } from './coc-mock';
import { call, cocWar, memberToken } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const NERA = '#2J8JVVCLC';

/** Saves a war straight from a `currentwar` payload. */
async function saveWar(overrides: Record<string, unknown> = {}) {
  return (await upsertWarSnapshot(cocWarSchema.parse(cocWar(overrides)))).war;
}

/** An ended war: preparation start, opponent, stars of each side. */
function endedWar(prep: string, end: string, opponentTag: string, stars: number, starsConceded = 1) {
  return saveWar({
    state: 'warEnded',
    preparationStartTime: prep,
    startTime: prep,
    endTime: end,
    clan: { ...cocWar().clan, stars },
    opponent: { ...cocWar().opponent, tag: opponentTag, name: `Opp ${opponentTag}`, stars: starsConceded },
  });
}

const request = (path: string, token: string, params: Record<string, string> = {}) => ({
  token,
  params,
  path: `/api/v1${path}`,
});

describe('table queries', () => {
  interface Row {
    name: string;
    tag: string;
    stars: number | null;
    date: string;
    won: boolean;
    result: string;
  }
  const table = defineTable<Row>(
    {
      name: { label: 'name', filter: 'text', value: (r) => [r.name, r.tag], sort: (r) => r.name },
      stars: { label: 'stars', filter: 'number', sort: true },
      date: { label: 'date', filter: 'date', sort: true },
      won: { label: 'won', filter: 'boolean' },
      result: { label: 'result', filter: 'select', options: ['victory', 'defeat', 'draw'], sort: true },
    },
    { sort: 'date', order: 'desc' },
  );
  const rows: Row[] = [
    { name: 'Ëlla', tag: '#A1', stars: 3, date: '2026-11-01T10:00:00Z', won: true, result: 'victory' },
    { name: 'bruno', tag: '#B2', stars: null, date: '2026-11-03T10:00:00Z', won: false, result: 'defeat' },
    { name: 'Carla', tag: '#C3', stars: 1, date: '2026-11-02T10:00:00Z', won: false, result: 'draw' },
  ];
  const query = (search: string) => parseTableQuery(new Request(`http://x/t?${search}`), table);
  const names = (search: string) => queryTable(rows, table, query(search)).items.map((r) => r.name);

  it('filters by text (case and accents ignored, any of several texts), number, date, yes/no and options', () => {
    expect(names('name=ella')).toEqual(['Ëlla']);
    expect(names('name=%23b')).toEqual(['bruno']);
    // A row without a number never matches a number filter.
    expect(names('starsMin=1')).toEqual(['Carla', 'Ëlla']);
    expect(names('starsMax=2')).toEqual(['Carla']);
    expect(names('dateFrom=2026-11-02T00:00:00%2B01:00&dateBefore=2026-11-03T10:00:00Z')).toEqual(['Carla']);
    expect(names('won=false')).toEqual(['bruno', 'Carla']);
    expect(names('result=victory,draw')).toEqual(['Carla', 'Ëlla']);
    expect(names('result=draw&starsMin=2')).toEqual([]);
  });

  it('sorts texts alphabetically and numbers by value, empty values last either way', () => {
    expect(names('sort=name&order=asc')).toEqual(['bruno', 'Carla', 'Ëlla']);
    expect(names('sort=stars&order=asc')).toEqual(['Carla', 'Ëlla', 'bruno']);
    expect(names('sort=stars&order=desc')).toEqual(['Ëlla', 'Carla', 'bruno']);
  });

  it('pages the sorted rows and counts every match; without a limit every row comes back', () => {
    expect(queryTable(rows, table, query('limit=2&page=2'))).toEqual({ items: [rows[0]], total: 3, page: 2, limit: 2 });
    expect(queryTable(rows, table, query(''))).toMatchObject({ total: 3, page: 1, limit: null });
  });

  it('refuses unknown sort columns, options and malformed values', () => {
    for (const search of ['sort=won', 'result=lost', 'starsMin=many', 'dateFrom=yesterday', 'won=maybe', 'limit=0', 'limit=501']) {
      expect(() => query(search), search).toThrow();
    }
  });
});

describe('GET /wars/history', () => {
  it('merges the saved wars with the war log, and gives the record of every war', async () => {
    const auth = await memberToken('historian');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OCT111', 5);
    await endedWar('20261101T100000.000Z', '20261103T100000.000Z', '#NOV222', 0, 4);
    mockCocApi({
      '/warlog': {
        body: {
          items: [
            // The saved November war: the war log's final stars win.
            {
              result: 'win',
              endTime: '20261103T100000.000Z',
              teamSize: 2,
              clan: { tag: NERA, stars: 6, destructionPercentage: 100 },
              opponent: { tag: '#NOV222', name: 'Opp #NOV222', stars: 4, destructionPercentage: 70 },
            },
            // Known only from the war log.
            {
              result: 'tie',
              endTime: '20260901T100000.000Z',
              teamSize: 2,
              clan: { tag: NERA, stars: 2, destructionPercentage: 50 },
              opponent: { tag: '#SEP333', name: 'Old', stars: 2, destructionPercentage: 50 },
            },
            // A CWL war: skipped.
            { result: null, endTime: '20261010T100000.000Z', teamSize: 15, clan: { stars: 30, destructionPercentage: 90 }, opponent: { stars: 20, destructionPercentage: 70 } },
          ],
        },
      },
    });

    const all = await call(warHistory, request('/wars/history', auth));
    expect(all.status).toBe(200);
    expect(all.body.result.items.map((w: { id: string }) => w.id)).toEqual([
      '20261101T100000-NOV222',
      '20261020T100000-OCT111',
      'warlog-20260901T100000-SEP333',
    ]);
    expect(all.body.result.items[0]).toMatchObject({ result: 'victory', stars: 6, starsConceded: 4, hasDetails: true });
    expect(all.body.result.items[2]).toMatchObject({ opponent: 'Old', result: 'draw', hasDetails: false });
    expect(all.body.result.summary).toEqual({ wars: 3, victories: 2, defeats: 0, draws: 1 });

    const filtered = await call(warHistory, request('/wars/history?result=victory&sort=stars&order=asc&limit=1', auth));
    expect(filtered.body.result).toMatchObject({ total: 2, limit: 1, summary: { wars: 3 } });
    expect(filtered.body.result.items.map((w: { opponentTag: string }) => w.opponentTag)).toEqual(['#OCT111']);

    expect((await call(warHistory, request('/wars/history?result=lost', auth))).status).toBe(400);
  });

  it('works with a private war log, and is for members of the clan', async () => {
    const auth = await memberToken('historian');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OCT111', 5);
    mockCocApi({ '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
    expect((await call(warHistory, request('/wars/history', auth))).body.result.total).toBe(1);
    expect((await call(warHistory, request('/wars/history', ''))).status).toBe(401);
  });
});

describe('GET /wars/{warKey}/participants', () => {
  it('lists the players of a saved war with their targets, filtered and sorted', async () => {
    const auth = await memberToken('reader');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OPP999', 3);
    const key = '20261020T100000-OPP999';

    const all = await call(participants, request(`/wars/${key}/participants`, auth, { warKey: key }));
    expect(all.status).toBe(200);
    expect(all.body.result.summary).toEqual({ townHalls: [16, 15] });
    expect(all.body.result.items[0]).toMatchObject({
      name: 'Alice',
      attacksUsed: 1,
      stars: 3,
      hasAttacked: true,
      targets: [{ mapPosition: 1, name: 'Eve', townHall: 16, stars: 3, destruction: 100 }],
    });

    const idle = await call(participants, request(`/wars/${key}/participants?attacks=false&townHall=15,14`, auth, { warKey: key }));
    expect(idle.body.result.items.map((p: { name: string }) => p.name)).toEqual(['Bob']);

    const sorted = await call(participants, request(`/wars/${key}/participants?sort=stars&order=asc`, auth, { warKey: key }));
    expect(sorted.body.result.items.map((p: { name: string }) => p.name)).toEqual(['Bob', 'Alice']);
  });

  it('reads the war in progress from the API, and answers 404 for an unknown war', async () => {
    const auth = await memberToken('reader');
    await saveWar({ state: 'preparation' });
    const live = cocWar();
    live.clan.members[1] = {
      ...live.clan.members[1]!,
      attacks: [{ attackerTag: '#AAA222', defenderTag: '#BBB222', stars: 2, destructionPercentage: 80, order: 2, duration: 90 }],
    } as never;
    const fetch = mockCocApi({ '/currentwar': { body: live } });
    const key = '20261104T100000-OPP999';

    const res = await call(participants, request(`/wars/${key}/participants?attacks=true`, auth, { warKey: key }));
    expect(res.body.result.total).toBe(2);
    // Kept for a while: a second request does not call the API again.
    await call(participants, request(`/wars/${key}/participants`, auth, { warKey: key }));
    expect(fetch).toHaveBeenCalledTimes(1);

    const missing = await call(participants, request('/wars/x/participants', auth, { warKey: '20250101T000000-NOPE' }));
    expect(missing.status).toBe(404);
    expect(missing.body.messages[0]?.key).toBe('ERROR.WAR_NOT_FOUND');
  });
});

describe('GET /players and /players/{tag}/wars', () => {
  const clan = {
    memberList: [
      { tag: '#AAA111', name: 'Alice', role: 'coLeader', townHallLevel: 16, trophies: 5200, leagueTier: { id: 105000034, name: 'Legend League', iconUrls: { large: 'https://x/l.png' } } },
      { tag: '#AAA222', name: 'Bob', role: 'admin', townHallLevel: 15, trophies: 4100, leagueTier: { id: 105000020, name: 'Titan League I' } },
      { tag: '#CCC333', name: 'Carl', role: 'member', townHallLevel: 12, trophies: 2000 },
    ],
  };

  it('gives the war statistics of the members, the leagues and the averages of the matching ones', async () => {
    const auth = await memberToken('reader');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OPP1', 3);
    await endedWar('20261101T100000.000Z', '20261103T100000.000Z', '#OPP2', 3);
    mockCocApi({ [`/clans/${encodeURIComponent(NERA)}`]: { body: clan } });

    const res = await call(players, request('/players', auth));
    expect(res.status).toBe(200);
    const result = res.body.result;
    // Highest league first.
    expect(result.items.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Bob', 'Carl']);
    expect(result.items[0]).toMatchObject({
      role: 'coLeader',
      league: { name: 'Legend League', iconUrl: 'https://x/l.png' },
      warsPlayed: 2,
      warsTotal: 2,
      attendance: 100,
      attacksUsed: 2,
      totalStars: 6,
      averageStars: 3,
      threeStarRate: 100,
    });
    expect(result.items[1]).toMatchObject({ role: 'elder', attacksUsed: 0, attacksAvailable: 4 });
    expect(result.items[2]).toMatchObject({ league: null, warsPlayed: 0, attendance: 0 });
    expect(result.summary).toMatchObject({ members: 3, warsTotal: 2 });
    expect(result.summary.leagues).toEqual([
      { id: 105000034, name: 'Legend League' },
      { id: 105000020, name: 'Titan League I' },
    ]);
    expect(result.summary.averages.townHall).toBeCloseTo((16 + 15 + 12) / 3);

    const elders = await call(players, request('/players?role=elder,coLeader&sort=role&order=asc', auth));
    expect(elders.body.result.items.map((p: { name: string }) => p.name)).toEqual(['Alice', 'Bob']);
    expect(elders.body.result.summary.averages.townHall).toBe(15.5);

    const none = await call(players, request('/players?name=zzz', auth));
    expect(none.body.result).toMatchObject({ total: 0, summary: { averages: null } });
  });

  it('falls back on the saved players when the API cannot be reached', async () => {
    const auth = await memberToken('reader');
    await PlayerModel.create({ tag: '#SAVED1', name: 'Saved', role: 'leader', townHallLevel: 17, trophies: 5000, clanTag: NERA, inClan: true });
    await PlayerModel.create({ tag: '#GONE1', name: 'Gone', clanTag: NERA, inClan: false });
    mockCocApi({ [`/clans/${encodeURIComponent(NERA)}`]: { status: 503, body: { reason: 'inMaintenance' } } });
    const res = await call(players, request('/players', auth));
    expect(res.body.result.items.map((p: { name: string }) => p.name)).toEqual(['Saved']);
  });

  it("lists a player's wars, most recent first", async () => {
    const auth = await memberToken('reader');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OPP1', 3);
    await endedWar('20261101T100000.000Z', '20261103T100000.000Z', '#OPP2', 3, 6);
    const res = await call(playerWars, request('/players/%23AAA111/wars', auth, { tag: '%23AAA111' }));
    expect(res.status).toBe(200);
    expect(res.body.result.items).toHaveLength(2);
    expect(res.body.result.items[0]).toMatchObject({ warId: '20261101T100000-OPP2', result: 'defeat', stars: 3, attacksUsed: 1, mapPosition: 1 });

    const defeats = await call(playerWars, request('/players/aaa111/wars?result=defeat', auth, { tag: 'aaa111' }));
    expect(defeats.body.result.total).toBe(1);
    expect((await call(playerWars, request('/players/x/wars', auth, { tag: '!!' }))).status).toBe(400);
  });
});

describe('GET /history/{period}/ranking and /wars', () => {
  it('ranks the players of a period, keeping the positions through the filters', async () => {
    const auth = await memberToken('stats');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OPP1', 3);
    await endedWar('20261021T100000.000Z', '20261023T100000.000Z', '#OPP2', 3);

    const res = await call(periodRanking, request('/history/2026-10/ranking', auth, { period: '2026-10' }));
    expect(res.status).toBe(200);
    expect(res.body.result.items.map((p: { name: string; rank: number }) => [p.name, p.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 2],
    ]);
    // Alice and Bob are not in the saved member lists: former members.
    expect(res.body.result.items[0].isCurrentMember).toBe(false);

    const bob = await call(periodRanking, request('/history/2026-10/ranking?name=bob', auth, { period: '2026-10' }));
    expect(bob.body.result.items.map((p: { rank: number }) => p.rank)).toEqual([2]);

    const current = await call(periodRanking, request('/history/all/ranking?currentMembersOnly=true', auth, { period: 'all' }));
    expect(current.body.result.total).toBe(0);
    const veterans = await call(periodRanking, request('/history/all/ranking?minWars=3', auth, { period: 'all' }));
    expect(veterans.body.result.total).toBe(0);

    expect((await call(periodRanking, request('/history/x/ranking', auth, { period: 'nope' }))).status).toBe(400);
    expect((await call(periodRanking, request('/history/x/ranking', auth, { period: '2020-01' }))).status).toBe(404);
  });

  it('lists the wars of a period without their players', async () => {
    const auth = await memberToken('stats');
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OPP1', 3);
    await endedWar('20261021T100000.000Z', '20261023T100000.000Z', '#OPP2', 0, 3);
    const res = await call(periodWars, request('/history/all/wars?limit=1&page=2', auth, { period: 'all' }));
    expect(res.body.result).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(res.body.result.items[0]).toMatchObject({ opponentTag: '#OPP1', result: 'victory' });
    expect(res.body.result.items[0].players).toBeUndefined();

    const defeats = await call(periodWars, request('/history/all/wars?result=defeat', auth, { period: 'all' }));
    expect(defeats.body.result.items.map((w: { opponentTag: string }) => w.opponentTag)).toEqual(['#OPP2']);
  });
});

describe('GET /cwl/seasons/{season}/players', () => {
  const member = (tag: string, name: string, attacks: { stars: number; destructionPercentage: number }[]) => ({
    tag,
    name,
    townhallLevel: 16,
    attacks: attacks.map((a, i) => ({ ...a, attackerTag: tag, defenderTag: '#D', order: i + 1 })),
  });
  const war = (state: string, members: unknown[], ownSide: 'clan' | 'opponent' = 'clan') => {
    const own = { tag: NERA, name: 'Crociata Nera', stars: 3, destructionPercentage: 50, members };
    const other = { tag: '#OPP1', name: 'Rivals', stars: 1, destructionPercentage: 30, members: [] };
    return ownSide === 'clan' ? { state, clan: own, opponent: other } : { state, clan: other, opponent: own };
  };

  it("adds up the clan's war of each round, skipping wars in preparation", async () => {
    const auth = await memberToken('leaguer');
    await CwlSeasonModel.create({
      season: '2026-11',
      clanTag: NERA,
      state: 'inWar',
      clans: [],
      rounds: [{ warTags: ['#W1', '#X1'] }, { warTags: ['#W2'] }, { warTags: ['#W3'] }, { warTags: ['#0'] }],
      wars: [
        { warTag: '#W1', state: 'warEnded', war: war('warEnded', [member('#A', 'Anna', [{ stars: 3, destructionPercentage: 100 }]), member('#B', 'Beppe', [])]) },
        // Another group war, not the clan's.
        { warTag: '#X1', state: 'warEnded', war: { state: 'warEnded', clan: { tag: '#Z', members: [member('#Z1', 'Zed', [])] }, opponent: { tag: '#Y', members: [] } } },
        { warTag: '#W2', state: 'inWar', war: war('inWar', [member('#B', 'Beppe', [{ stars: 2, destructionPercentage: 80 }])], 'opponent') },
        { warTag: '#W3', state: 'preparation', war: war('preparation', [member('#A', 'Anna', [])]) },
      ],
      lastSyncedAt: new Date(),
    });

    const res = await call(cwlPlayers, request('/cwl/seasons/2026-11/players', auth, { season: '2026-11' }));
    expect(res.status).toBe(200);
    expect(res.body.result.items).toEqual([
      { index: 1, tag: '#A', name: 'Anna', townHall: 16, wars: 1, attacks: 1, stars: 3, threeStars: 1, averageStars: 3, averageDestruction: 100 },
      { index: 2, tag: '#B', name: 'Beppe', townHall: 16, wars: 2, attacks: 1, stars: 2, threeStars: 0, averageStars: 2, averageDestruction: 80 },
    ]);
    const filtered = await call(cwlPlayers, request('/cwl/seasons/2026-11/players?starsMax=2', auth, { season: '2026-11' }));
    expect(filtered.body.result.items.map((p: { index: number }) => p.index)).toEqual([2]);
    expect((await call(cwlPlayers, request('/cwl/seasons/2020-01/players', auth, { season: '2020-01' }))).status).toBe(404);
  });
});

describe('GET /raids/seasons/{startTime}/members', () => {
  const members = [
    { tag: '#A', name: 'Anna', attacks: 6, attackLimit: 5, bonusAttackLimit: 1, capitalResourcesLooted: 31000 },
    { tag: '#B', name: 'Beppe', attacks: 2, attackLimit: 5, bonusAttackLimit: 0, capitalResourcesLooted: 52000 },
  ];
  const start = '2026-10-30T07:00:00.000Z';

  it('ranks the members of a saved weekend by loot, with the totals of the matching ones', async () => {
    const auth = await memberToken('raider');
    await RaidSeasonModel.create({
      clanTag: NERA,
      startTime: new Date(start),
      endTime: new Date('2026-11-02T07:00:00Z'),
      state: 'ended',
      season: { startTime: '20261030T070000.000Z', members },
      hasMembers: true,
      lastSyncedAt: new Date(),
    });
    const path = `/raids/seasons/${encodeURIComponent(start)}/members`;

    const res = await call(raidMembers, request(path, auth, { startTime: encodeURIComponent(start) }));
    expect(res.status).toBe(200);
    expect(res.body.result.items).toEqual([
      { rank: 1, tag: '#B', name: 'Beppe', attacks: 2, attackLimit: 5, looted: 52000 },
      { rank: 2, tag: '#A', name: 'Anna', attacks: 6, attackLimit: 6, looted: 31000 },
    ]);
    expect(res.body.result.summary).toEqual({ attacks: 8, attackLimit: 11, looted: 83000 });

    const busy = await call(raidMembers, request(`${path}?attacksMin=3`, auth, { startTime: start }));
    expect(busy.body.result.summary).toEqual({ attacks: 6, attackLimit: 6, looted: 31000 });
  });

  it('reads a weekend not saved from the API; 404 when unknown', async () => {
    const auth = await memberToken('raider');
    mockCocApi({ '/capitalraidseasons': { body: { items: [{ state: 'ongoing', startTime: '20261030T070000.000Z', members }] } } });
    const res = await call(raidMembers, request('/raids', auth, { startTime: start }));
    expect(res.body.result.total).toBe(2);

    const missing = await call(raidMembers, request('/raids', auth, { startTime: '2026-01-02T07:00:00.000Z' }));
    expect(missing.status).toBe(404);
    expect(missing.body.messages[0]?.key).toBe('ERROR.RAID_SEASON_NOT_FOUND');
    expect((await call(raidMembers, request('/raids', auth, { startTime: 'yesterday' }))).status).toBe(400);
  });
});

describe('GET /cwl/selection/players', () => {
  it('pages the ranking of the line-up for the leaders', async () => {
    const user = await UserModel.create({
      email: 'boss@x.io',
      username: 'boss',
      usernameKey: 'boss',
      passwordHash: 'x',
      roles: [UserRole.USER, UserRole.ADMIN],
    });
    const admin = (await signAccessToken({ sub: user._id.toString(), roles: [UserRole.USER, UserRole.ADMIN] })).token;
    await PlayerModel.create([
      { tag: '#P1', name: 'Primo', clanTag: NERA, inClan: true, townHallLevel: 17, role: 'member' },
      { tag: '#P2', name: 'Secondo', clanTag: '#2JU8RPR2G', inClan: true, townHallLevel: 12, role: 'member' },
    ]);

    const all = await call(selectionPlayers, request('/cwl/selection/players', admin));
    expect(all.status).toBe(200);
    expect(all.body.result.items.map((p: { tag: string; rank: number }) => [p.tag, p.rank])).toEqual([
      ['#P1', 1],
      ['#P2', 2],
    ]);
    // The clan name is searched too.
    const rossa = await call(selectionPlayers, request('/cwl/selection/players?name=rossa', admin));
    expect(rossa.body.result.items.map((p: { tag: string }) => p.tag)).toEqual(['#P2']);
    const ineligible = await call(selectionPlayers, request('/cwl/selection/players?status=ineligible', admin));
    expect(ineligible.body.result.items.map((p: { tag: string }) => p.tag)).toEqual(['#P2']);

    const member = await memberToken('member');
    expect((await call(selectionPlayers, request('/cwl/selection/players', member))).status).toBe(403);
    expect(await WarModel.countDocuments()).toBe(0);
  });
});
