import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { GET as listWars } from '@/app/api/v1/wars/route';
import { GET as listRaids } from '@/app/api/v1/raids/seasons/route';
import { GET as getPlayer } from '@/app/api/v1/players/[tag]/route';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import {
  crusadeMemberTags,
  resetClanAccessCache,
  ROSTER_TTL_MS,
} from '@/modules/access/clan-access.service';
import { ClanRosterModel } from '@/modules/access/clan-roster.model';
import { UserModel } from '@/modules/auth/user.model';
import { mockCocApi } from './coc-mock';
import { call, seedCrusadeRosters } from './helpers';

const NERA = '/clans/%232J8JVVCLC';
const ROSSA = '/clans/%232JU8RPR2G';
const ORO = '/clans/%232RRYUGQYJ';
const clan = (...tags: string[]) => ({
  body: { memberList: tags.map((tag) => ({ tag, name: tag })) },
});

/** A user created straight in the database (no password hashing: fast) and its access token. */
async function register(
  username: string,
  playerTags: string[] = [],
  pendingPlayerTag: string | null = null,
  roles: UserRole[] = [UserRole.USER],
) {
  const user = await UserModel.create({
    email: `${username}@x.io`,
    username,
    usernameKey: username,
    passwordHash: 'x',
    roles,
    playerTags,
    pendingPlayerTag,
  });
  return (await signAccessToken({ sub: user._id.toString(), roles })).token;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('access to the clans data', () => {
  it('is for members of a clan of the Crusade (verified account) and administrators only', async () => {
    mockCocApi({ [NERA]: clan('#NERA1'), [ROSSA]: clan('#ROSSA1'), [ORO]: clan('#ORO1') });
    const outsider = await register('outsider', ['#ELSEWHERE']);
    const noAccount = await register('noaccount');
    const unverified = await register('unverified', [], '#NERA1');
    const red = await register('red', ['#ELSEWHERE2', '#ROSSA1']);
    const gold = await register('gold', ['#oro1']);
    const admin = await register('boss', [], null, [UserRole.USER, UserRole.ADMIN]);

    expect((await call(listWars)).status).toBe(401);
    for (const token of [outsider, noAccount, unverified]) {
      const denied = await call(listWars, { token });
      expect(denied.status).toBe(403);
      expect(denied.body.messages).toEqual([{ key: 'ERROR.CLAN_ACCESS_REQUIRED' }]);
      expect((await call(listRaids, { token })).status).toBe(403);
      expect((await call(getPlayer, { token, params: { tag: '%23NERA1' } })).status).toBe(403);
    }
    for (const token of [red, gold, admin])
      expect((await call(listWars, { token })).status).toBe(200);
  });

  it('tells the frontend whether the user has full access', async () => {
    await seedCrusadeRosters(['#NERA1']);
    expect(
      (await call(me, { token: await register('outsider', ['#ELSEWHERE']) })).body.result
        .clanAccess,
    ).toBe(false);
    expect(
      (await call(me, { token: await register('knight', ['#NERA1']) })).body.result.clanAccess,
    ).toBe(true);
  });

  it('follows the member lists: leaving the clans closes the access', async () => {
    let members = ['#NERA1'];
    mockCocApi({ [NERA]: () => clan(...members), [ROSSA]: clan(), [ORO]: clan() });
    const token = await register('knight', ['#NERA1']);
    expect((await call(listWars, { token })).status).toBe(200);

    members = [];
    // Within the cache lifetime the old list still holds.
    expect((await call(listWars, { token })).status).toBe(200);
    await ClanRosterModel.updateMany(
      {},
      { $set: { syncedAt: new Date(Date.now() - ROSTER_TTL_MS - 1) } },
    );
    resetClanAccessCache();
    expect((await call(listWars, { token })).status).toBe(403);
  });
});

describe('member lists of the clans of the Crusade', () => {
  it('are read once from the API, saved, and served from memory', async () => {
    const coc = mockCocApi({ [NERA]: clan('#a1'), [ROSSA]: clan('#B2'), [ORO]: clan() });
    expect(await crusadeMemberTags()).toEqual(new Set(['#A1', '#B2']));
    await crusadeMemberTags();
    expect(coc).toHaveBeenCalledTimes(3);
    expect(await ClanRosterModel.findOne({ clanTag: '#2J8JVVCLC' }).lean()).toMatchObject({
      memberTags: ['#A1'],
    });

    // After a restart (empty memory) a fresh saved list needs no API call.
    resetClanAccessCache();
    await crusadeMemberTags();
    expect(coc).toHaveBeenCalledTimes(3);
  });

  it('fall back to the last saved list when the API cannot be reached', async () => {
    await ClanRosterModel.create({
      clanTag: '#2J8JVVCLC',
      memberTags: ['#OLD1'],
      syncedAt: new Date(0),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockCocApi({
      [NERA]: { status: 503, body: { reason: 'inMaintenance' } },
      [ROSSA]: clan('#R1'),
      [ORO]: clan(),
    });
    expect(await crusadeMemberTags()).toEqual(new Set(['#OLD1', '#R1']));

    // An outage of the API does not lock the members out.
    expect((await call(listWars, { token: await register('veteran', ['#OLD1']) })).status).toBe(
      200,
    );
  });
});
