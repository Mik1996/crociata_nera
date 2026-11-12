import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE as unlinkUserPlayer } from '@/app/api/v1/admin/users/[id]/players/[tag]/route';
import { POST as linkUserPlayers } from '@/app/api/v1/admin/users/[id]/players/route';
import { DELETE as deleteUser, PATCH as updateUser } from '@/app/api/v1/admin/users/[id]/route';
import { GET as listUsers } from '@/app/api/v1/admin/users/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { resetEnvCache } from '@/lib/config/env';
import { SessionModel } from '@/modules/auth/session.model';
import { UserModel } from '@/modules/auth/user.model';
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

async function registerAdmin() {
  process.env.ADMIN_EMAILS = 'boss@crociata.it';
  resetEnvCache();
  return register('boss', '10.0.0.2');
}

describe('administration', () => {
  it('is reserved to administrators', async () => {
    const { token } = await register('plain', '10.0.0.1');
    const res = await call(listUsers, { token });
    expect(res.status).toBe(403);
    expect(res.body.messages).toEqual([{ key: 'ERROR.FORBIDDEN' }]);
  });

  it('grants ADMIN to ADMIN_EMAILS, lists and searches users, edits roles and unlinks tags', async () => {
    process.env.ADMIN_EMAILS = 'boss@crociata.it';
    resetEnvCache();
    const boss = await register('boss', '10.0.0.2');
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
    expect(unlinked.body.result.players).toEqual([{ tag: '#MEM456', verified: true }]);
    const forbidden = await call(unlinkUserPlayer, {
      method: 'DELETE',
      token: member.token,
      params: { id: member.user.id, tag: 'MEM456' },
    });
    expect(forbidden.status).toBe(403);
    // New roles apply at the next sign-in: the member's sessions were revoked.
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

  it('links several accounts to a user without the in-game token', async () => {
    const boss = await registerAdmin();
    const member = await register('member', '10.0.0.3');
    const other = await register('other', '10.0.0.4');
    await UserModel.updateOne({ _id: other.user.id }, { $set: { playerTags: ['#TAKEN1'], pendingPlayerTag: '#MEM456' } });
    // #MEM123 and #MEM456 exist in the game; every other tag is unknown (404).
    const coc = mockCocApi({
      '%23MEM123': { body: { tag: '#MEM123' } },
      '%23MEM456': { body: { tag: '#MEM456' } },
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
      { tag: '#MEM123', verified: true },
      { tag: '#MEM456', verified: true },
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
