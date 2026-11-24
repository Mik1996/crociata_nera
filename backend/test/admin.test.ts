import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE as unlinkUserPlayer } from '@/app/api/v1/admin/users/[id]/players/[tag]/route';
import { POST as linkUserPlayers } from '@/app/api/v1/admin/users/[id]/players/route';
import { DELETE as deleteUser, PATCH as updateUser } from '@/app/api/v1/admin/users/[id]/route';
import { GET as listUsers } from '@/app/api/v1/admin/users/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as signIn } from '@/app/api/v1/auth/sign-in/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { resetEnvCache } from '@/lib/config/env';
import { SessionModel } from '@/modules/auth/session.model';
import { UserModel } from '@/modules/auth/user.model';
import { PlayerModel } from '@/modules/commendations/player.model';
import { mockCocApi } from './coc-mock';
import { call } from './helpers';

async function register(name: string, ip: string) {
  const res = await call(signUp, {
    body: { email: `${name}@crociata.it`, username: name, password: 'secret123', repeatPassword: 'secret123' },
    ip,
  });
  return { token: res.body.result.accessToken as string, cookie: res.refreshCookie!, user: res.body.result.user };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ADMIN_EMAILS;
  resetEnvCache();
});

/** An administrator from `ADMIN_EMAILS`: the role comes once the address is confirmed. */
async function registerAdmin() {
  process.env.ADMIN_EMAILS = 'boss@crociata.it';
  resetEnvCache();
  const boss = await register('boss', '10.0.0.2');
  await UserModel.updateOne({ _id: boss.user.id }, { $set: { emailVerified: true } });
  const signedIn = await call(refresh, { body: {}, cookie: boss.cookie });
  return {
    token: signedIn.body.result.accessToken as string,
    cookie: signedIn.refreshCookie!,
    user: signedIn.body.result.user,
  };
}

describe('administration', () => {
  it('lists users a page at a time, filtered and sorted by column', async () => {
    const boss = await registerAdmin();
    const anna = await register('Anna', '10.0.1.1');
    await register('carlo', '10.0.1.2');
    await register('bruno', '10.0.1.3');
    await UserModel.updateOne({ _id: anna.user.id }, { $set: { emailVerified: true, playerTags: ['#ANNA1'] } });
    // `createdAt` is immutable for Mongoose: set it on the collection.
    await UserModel.collection.updateOne({ username: 'carlo' }, { $set: { createdAt: new Date('2026-01-15T10:00:00Z') } });
    const list = (query: string) => call(listUsers, { token: boss.token, path: `/api/v1/admin/users?${query}` });
    const names = (res: Awaited<ReturnType<typeof list>>) =>
      (res.body.result.items as { username: string }[]).map((u) => u.username);

    // Usernames sort case-insensitively; pages follow the sort.
    const first = await list('sort=username&order=asc&limit=2&page=1');
    expect(names(first)).toEqual(['Anna', 'boss']);
    expect(first.body.result.total).toBe(4);
    expect(names(await list('sort=username&order=asc&limit=2&page=2'))).toEqual(['bruno', 'carlo']);

    expect(names(await list('admin=true'))).toEqual(['boss']);
    expect(names(await list('admin=false&sort=username&order=desc'))).toEqual(['carlo', 'bruno', 'Anna']);
    expect(names(await list('verified=true&sort=username&order=asc'))).toEqual(['Anna', 'boss']);
    expect(names(await list('playerTag=anna'))).toEqual(['Anna']);
    expect(names(await list('user=crociata.it&verified=false&sort=username&order=asc'))).toEqual(['bruno', 'carlo']);
    expect(
      names(await list(`createdFrom=${encodeURIComponent('2026-01-15T00:00:00+01:00')}&createdBefore=2026-01-16T00:00:00Z`)),
    ).toEqual(['carlo']);
    // Empty text filters filter nothing.
    expect((await list('user=&playerTag=')).body.result.total).toBe(4);

    const invalid = await list('sort=password');
    expect(invalid.status).toBe(400);
    expect(invalid.body.messages).toEqual([{ key: 'ERROR.INVALID_FIELD', field: 'sort' }]);
  });

  it('lists the in-game names of the linked accounts and filters by them', async () => {
    const boss = await registerAdmin();
    const mik = await register('Mik', '10.0.1.4');
    await register('nobody', '10.0.1.5');
    await UserModel.updateOne(
      { _id: mik.user.id },
      { $set: { playerTags: ['#NAMED1', '#NAMED2', '#NAMED3'], pendingPlayerTag: '#NAMED4' } },
    );
    // A saved player, an account read live, one the API does not know, an old unverified link.
    await PlayerModel.create({ tag: '#NAMED1', name: 'Ixion' });
    const fetchMock = mockCocApi({
      '/players/%23NAMED2': { body: { tag: '#NAMED2', name: 'DoubleC' } },
      '/players/%23NAMED4': { body: { tag: '#NAMED4', name: 'Pending' } },
    });
    const list = (query: string) => call(listUsers, { token: boss.token, path: `/api/v1/admin/users?${query}` });

    const res = await list('user=mik');
    expect(res.body.result.items[0].players).toEqual([
      { tag: '#NAMED1', verified: true, name: 'Ixion' },
      { tag: '#NAMED2', verified: true, name: 'DoubleC' },
      { tag: '#NAMED3', verified: true, name: null },
      { tag: '#NAMED4', verified: false, name: 'Pending' },
    ]);
    // Saved players are not read from the API.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('NAMED1'))).toBe(false);

    const names = (r: Awaited<ReturnType<typeof list>>) => (r.body.result.items as { username: string }[]).map((u) => u.username);
    expect(names(await list('player=ixi'))).toEqual(['Mik']);
    expect(names(await list('player=nessuno'))).toEqual([]);
  });

  it('is reserved to administrators', async () => {
    const { token } = await register('plain', '10.0.0.1');
    const res = await call(listUsers, { token });
    expect(res.status).toBe(403);
    expect(res.body.messages).toEqual([{ key: 'ERROR.FORBIDDEN' }]);
  });

  it('checks the current roles, not those in the access token', async () => {
    const boss = await registerAdmin();
    const deputy = await register('deputy', '10.0.0.3');
    const victim = await register('victim', '10.0.0.4');
    await UserModel.updateOne({ _id: deputy.user.id }, { $addToSet: { roles: 'ADMIN' } });
    // A fresh access token carrying ADMIN.
    const signedIn = await call(refresh, { body: {}, cookie: deputy.cookie });
    const adminToken = signedIn.body.result.accessToken as string;
    expect(signedIn.body.result.user.roles).toEqual(['USER', 'ADMIN']);
    expect((await call(listUsers, { token: adminToken })).status).toBe(200);

    const demoted = await call(updateUser, {
      method: 'PATCH',
      body: { roles: ['USER'] },
      token: boss.token,
      params: { id: deputy.user.id },
    });
    expect(demoted.status).toBe(200);
    // The token still says ADMIN and has not expired: refused anyway.
    const afterDemotion = await call(listUsers, { token: adminToken });
    expect(afterDemotion.status).toBe(403);
    expect(afterDemotion.body.messages).toEqual([{ key: 'ERROR.FORBIDDEN' }]);
    const deletion = await call(deleteUser, {
      method: 'DELETE',
      body: { username: 'victim' },
      token: adminToken,
      params: { id: victim.user.id },
    });
    expect(deletion.status).toBe(403);
    expect(await UserModel.exists({ _id: victim.user.id })).toBeTruthy();

    // A deleted administrator is not authenticated any more.
    await UserModel.updateOne({ _id: deputy.user.id }, { $addToSet: { roles: 'ADMIN' } });
    expect((await call(listUsers, { token: adminToken })).status).toBe(200);
    await UserModel.deleteOne({ _id: deputy.user.id });
    const deleted = await call(listUsers, { token: adminToken });
    expect(deleted.status).toBe(401);
    expect(deleted.body.messages).toEqual([{ key: 'ERROR.INVALID_TOKEN' }]);
  });

  it('grants ADMIN to ADMIN_EMAILS only once the address is confirmed', async () => {
    process.env.ADMIN_EMAILS = 'boss@crociata.it';
    resetEnvCache();
    // Anybody can sign up with the address: unconfirmed, it grants nothing.
    const squatter = await register('boss', '10.0.0.2');
    expect(squatter.user.roles).toEqual(['USER']);
    const again = await call(refresh, { body: {}, cookie: squatter.cookie });
    expect(again.body.result.user.roles).toEqual(['USER']);
    expect((await call(listUsers, { token: again.body.result.accessToken })).status).toBe(403);

    await UserModel.updateOne({ _id: squatter.user.id }, { $set: { emailVerified: true } });
    const confirmed = await call(refresh, { body: {}, cookie: again.refreshCookie });
    expect(confirmed.body.result.user.roles).toEqual(['USER', 'ADMIN']);
  });

  it('grants ADMIN to ADMIN_EMAILS, lists and searches users, edits roles and unlinks tags', async () => {
    const boss = await registerAdmin();
    expect(boss.user.roles).toEqual(['USER', 'ADMIN']);
    const member = await register('member', '10.0.0.3');

    const list = await call(listUsers, { token: boss.token, path: '/api/v1/admin/users?search=memb' });
    expect(list.status).toBe(200);
    expect(list.body.result.total).toBe(1);
    expect(list.body.result.items[0]).toMatchObject({ username: 'member', roles: ['USER'] });
    expect(list.body.result.items[0]).not.toHaveProperty('passwordHash');

    const promoted = await call(updateUser, {
      method: 'PATCH',
      body: { roles: ['ADMIN'] },
      token: boss.token,
      params: { id: member.user.id },
    });
    expect(promoted.status).toBe(200);
    expect(promoted.body.result).toMatchObject({ roles: ['USER', 'ADMIN'] });

    // Administrators unlink one account at a time.
    await UserModel.updateOne({ _id: member.user.id }, { $set: { playerTags: ['#MEM123', '#MEM456'] } });
    const unlinked = await call(unlinkUserPlayer, {
      method: 'DELETE',
      token: boss.token,
      params: { id: member.user.id, tag: 'MEM123' },
    });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.result.players).toEqual([{ tag: '#MEM456', verified: true, name: null }]);
    // The new roles apply at once, even with the token issued before the promotion.
    const promotedToken = await call(listUsers, { token: member.token });
    expect(promotedToken.status).toBe(200);
    // The member's sessions were revoked: the next sign-in carries the new roles.
    expect((await call(refresh, { body: {}, cookie: member.cookie })).status).toBe(401);

    const selfDemotion = await call(updateUser, {
      method: 'PATCH',
      body: { roles: ['USER'] },
      token: boss.token,
      params: { id: boss.user.id },
    });
    expect(selfDemotion.status).toBe(409);
    expect(selfDemotion.body.messages).toEqual([{ key: 'ERROR.CANNOT_REMOVE_OWN_ADMIN' }]);
  });

  it('keeps the session opened after a role change when a device signed out by it comes back', async () => {
    const boss = await registerAdmin();
    const member = await register('member', '10.0.0.3');
    const promoted = await call(updateUser, {
      method: 'PATCH',
      body: { roles: ['ADMIN'] },
      token: boss.token,
      params: { id: member.user.id },
    });
    expect(promoted.status).toBe(200);
    // The member signs in again (the new session carries the new role)…
    const fresh = await call(signIn, { body: { identifier: 'member', password: 'secret123' }, ip: '10.0.0.4' });
    expect(fresh.body.result.user.roles).toEqual(['USER', 'ADMIN']);

    // …then another device of theirs comes back with a session closed by the change: refused,
    // without closing the new one.
    expect((await call(refresh, { body: {}, cookie: member.cookie })).status).toBe(401);
    expect((await call(refresh, { body: {}, cookie: fresh.refreshCookie })).status).toBe(200);
  });

  it('links several accounts to a user without the in-game token', async () => {
    const boss = await registerAdmin();
    const member = await register('member', '10.0.0.3');
    const other = await register('other', '10.0.0.4');
    await UserModel.updateOne({ _id: other.user.id }, { $set: { playerTags: ['#TAKEN1'], pendingPlayerTag: '#MEM456' } });
    // #MEM123 and #MEM456 exist in the game; every other tag is unknown (404).
    const coc = mockCocApi({
      '%23MEM123': { body: { tag: '#MEM123', name: 'Mem One' } },
      '%23MEM456': { body: { tag: '#MEM456', name: 'Mem Two' } },
    });
    const link = (playerTags: unknown, token = boss.token) =>
      call(linkUserPlayers, { body: { playerTags }, token, params: { id: member.user.id } });

    expect((await link(['#MEM123'], member.token)).status).toBe(403);

    const invalid = await link(['not a tag']);
    expect(invalid.status).toBe(400);
    expect(invalid.body.messages).toEqual([{ key: 'ERROR.PLAYER_TAG_IS_NOT_VALID', field: 'playerTags.0' }]);
    expect((await link([])).status).toBe(400);

    const taken = await link(['#MEM123', '#taken1']);
    expect(taken.status).toBe(409);
    expect(taken.body.messages).toEqual([
      {
        key: 'ERROR.PLAYER_TAG_LINKED_TO_OTHER_USER',
        params: { tag: '#TAKEN1' },
        field: 'playerTags',
      },
    ]);

    const unknown = await link(['#MEM123', '#NOPE99']);
    expect(unknown.status).toBe(404);
    expect(unknown.body.messages).toEqual([{ key: 'ERROR.PLAYER_NOT_FOUND_TAG', params: { tag: '#NOPE99' }, field: 'playerTags' }]);
    expect(String(coc.mock.calls.at(-1)![0])).toBe('https://coc.test/v1/players/%23NOPE99');

    const linked = await link([' #mem123 ', '#MEM456', '#MEM123']);
    expect(linked.status).toBe(200);
    expect(linked.body.result.players).toEqual([
      { tag: '#MEM123', verified: true, name: 'Mem One' },
      { tag: '#MEM456', verified: true, name: 'Mem Two' },
    ]);
    // The unverified copy of #MEM456 held by another user gives way.
    expect((await UserModel.findById(other.user.id))!.pendingPlayerTag).toBeNull();

    // Already linked accounts are not looked up again; the limit counts only new ones.
    coc.mockClear();
    expect((await link(['#MEM123'])).status).toBe(200);
    expect(coc).not.toHaveBeenCalled();
    await UserModel.updateOne({ _id: member.user.id }, { $set: { playerTags: Array.from({ length: 10 }, (_, i) => `#FULL${i}0`) } });
    const full = await link(['#MEM123']);
    expect(full.status).toBe(409);
    expect(full.body.messages).toEqual([{ key: 'ERROR.PLAYER_LIMIT_REACHED', params: { max: 10 } }]);

    mockCocApi({ '%23MEM123': { status: 503, body: { reason: 'inMaintenance' } } });
    await UserModel.updateOne({ _id: member.user.id }, { $set: { playerTags: [] } });
    const down = await link(['#MEM123']);
    expect(down.status).toBe(502);
    expect(down.body.messages).toEqual([{ key: 'ERROR.PLAYER_VERIFICATION_UNAVAILABLE' }]);
  });

  it('deletes a user only when the username is typed exactly, never the own account', async () => {
    const boss = await registerAdmin();
    const member = await register('Member', '10.0.0.3');
    const remove = (body: unknown, id = member.user.id, token = boss.token) =>
      call(deleteUser, { method: 'DELETE', body, token, params: { id } });

    expect((await remove({ username: 'Member' }, member.user.id, member.token)).status).toBe(403);

    const empty = await remove({});
    expect(empty.status).toBe(400);
    expect(empty.body.messages).toEqual([{ key: 'ERROR.USERNAME_CONFIRMATION_MISMATCH', field: 'username' }]);
    for (const username of ['member', ' Member', 'Membe']) {
      const wrong = await remove({ username });
      expect(wrong.status).toBe(400);
      expect(wrong.body.messages).toEqual([{ key: 'ERROR.USERNAME_CONFIRMATION_MISMATCH', field: 'username' }]);
    }
    expect(await UserModel.exists({ _id: member.user.id })).toBeTruthy();

    const self = await remove({ username: 'boss' }, boss.user.id);
    expect(self.status).toBe(409);
    expect(self.body.messages).toEqual([{ key: 'ERROR.CANNOT_DELETE_OWN_ACCOUNT' }]);

    const deleted = await remove({ username: 'Member' });
    expect(deleted.status).toBe(200);
    expect(deleted.body.messages).toEqual([{ key: 'SUCCESS.USER_DELETED', params: { name: 'Member' } }]);
    expect(await UserModel.exists({ _id: member.user.id })).toBeNull();
    expect(await SessionModel.countDocuments({ userId: member.user.id })).toBe(0);
    expect((await call(refresh, { body: {}, cookie: member.cookie })).status).toBe(401);

    expect((await remove({ username: 'Member' })).status).toBe(404);
  });
});
