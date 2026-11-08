import { afterEach, describe, expect, it } from 'vitest';
import { PATCH as updateUser } from '@/app/api/v1/admin/users/[id]/route';
import { GET as listUsers } from '@/app/api/v1/admin/users/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { resetEnvCache } from '@/lib/config/env';
import { UserModel } from '@/modules/auth/user.model';
import { call } from './helpers';

async function register(name: string, ip: string) {
  const res = await call(signUp, {
    body: { email: `${name}@crociata.it`, username: name, password: 'secret123', repeatPassword: 'secret123' },
    ip,
  });
  return { token: res.body.result.accessToken as string, cookie: res.refreshCookie!, user: res.body.result.user };
}

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  resetEnvCache();
});

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

    // Linking needs the player's in-game token: administrators can only unlink.
    await UserModel.updateOne({ _id: member.user.id }, { $set: { playerTag: '#MEM123', playerTagVerified: true } });
    const link = await call(updateUser, {
      method: 'PATCH',
      body: { playerTag: '#OTHER1' },
      token: boss.token,
      params: { id: member.user.id },
    });
    expect(link.status).toBe(400);
    expect(link.body.messages).toEqual([{ key: 'ERROR.PLAYER_TAG_IS_NOT_VALID', field: 'playerTag' }]);
    const unlinked = await call(updateUser, {
      method: 'PATCH',
      body: { playerTag: null },
      token: boss.token,
      params: { id: member.user.id },
    });
    expect(unlinked.body.result).toMatchObject({ playerTag: null, playerTagVerified: false });
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
});
