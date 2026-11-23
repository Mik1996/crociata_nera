import { createHmac, randomBytes } from 'node:crypto';
import { type ApiReply, messageKeys, refreshCookieValue } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { findSensitive } from '../../support/sensitive';
import { FRONTEND_URL, SHARED_ADMIN, stack } from '../../support/stack';
import { newApiClient, randomIp, uniqueName } from '../../support/users';
import type { APIRequestContext } from '@playwright/test';

const EVIL_ORIGIN = 'https://evil.example';

/** An HS256 token with the backend's claims, signed with `secret` (not the backend's). */
function forgeToken(
  payload: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = encode({
    iss: 'crociata-nera-backend',
    aud: 'crociata-nera-web',
    iat: now,
    exp: now + 900,
    ...payload,
  });
  const unsigned = `${encode(header)}.${body}`;
  const signature =
    header['alg'] === 'none'
      ? ''
      : createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

test.describe('Access tokens', () => {
  test('forged, unsigned, tampered and malformed tokens are refused @P0', async ({
    users,
    api,
  }) => {
    const admin = await users.create({ admin: true });
    const genuine = admin.api.accessToken!;
    const claims = { sub: admin.id, roles: ['USER', 'ADMIN'] };
    const [header, payload, signature] = genuine.split('.');
    const tampered = `${header}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), sub: '0123456789abcdef01234567' })).toString('base64url')}.${signature}`;

    const candidates: Record<string, string> = {
      'signed with another secret': forgeToken(claims, randomBytes(32).toString('hex')),
      'alg none': forgeToken(claims, '', { alg: 'none', typ: 'JWT' }),
      'payload changed after signing': tampered,
      'wrong audience': forgeToken(
        { ...claims, aud: 'someone-else' },
        randomBytes(32).toString('hex'),
      ),
      malformed: 'not.a.jwt',
    };
    for (const [name, token] of Object.entries(candidates)) {
      const reply = await api.get('/admin/users', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect.soft(reply.status, name).toBe(401);
      expect.soft(messageKeys(reply), name).toContain('ERROR.INVALID_TOKEN');
    }
    // The genuine token works (the test is not vacuous).
    expect((await admin.api.get('/admin/users')).status).toBe(200);
  });

  test('a demoted administrator loses admin access at once, with the token already issued @P0', async ({
    users,
  }) => {
    const [boss, demoted] = [
      await users.create({ admin: true }),
      await users.create({ admin: true }),
    ];
    expect((await demoted.api.get('/admin/users')).status).toBe(200);

    const change = await boss.api.patch(`/admin/users/${demoted.id}`, { roles: ['USER'] });
    expect(change.status).toBe(200);
    // Same access token (still within its 15 minutes, still saying ADMIN): refused now.
    const after = await demoted.api.get('/admin/users');
    expect(after.status).toBe(403);
    expect(messageKeys(after)).toContain('ERROR.FORBIDDEN');
    // Their sessions were closed too.
    expect((await demoted.api.refresh()).status).toBe(401);
  });

  test('administrators cannot remove their own role nor delete their own account @P1', async ({
    users,
  }) => {
    const admin = await users.create({ admin: true });
    const demote = await admin.api.patch(`/admin/users/${admin.id}`, { roles: ['USER'] });
    expect(demote.status).toBe(409);
    expect(messageKeys(demote)).toContain('ERROR.CANNOT_REMOVE_OWN_ADMIN');
    const remove = await admin.api.delete(`/admin/users/${admin.id}`, { username: admin.username });
    expect(remove.status).toBe(409);
    expect(messageKeys(remove)).toContain('ERROR.CANNOT_DELETE_OWN_ACCOUNT');
    expect((await admin.api.me()).roles).toContain('ADMIN');
  });

  test('a deleted user is locked out even with a live access token @P0', async ({
    users,
    sharedAdmin,
  }) => {
    const user = await users.create({ access: 'member' });
    const admin = await sharedAdmin.api();
    const wrongConfirm = await admin.delete(`/admin/users/${user.id}`, {
      username: 'someone-else',
    });
    expect(wrongConfirm.status).toBe(400);
    expect(messageKeys(wrongConfirm)).toContain('ERROR.USERNAME_CONFIRMATION_MISMATCH');

    expect(
      (await admin.delete(`/admin/users/${user.id}`, { username: user.username })).status,
    ).toBe(200);
    expect((await user.api.get('/players')).status).toBe(403);
    expect((await user.api.get('/auth/me')).status).toBe(404);
    expect((await user.api.refresh()).status).toBe(401);
    expect(
      (await user.api.post('/auth/sign-in', { identifier: user.username, password: user.password }))
        .status,
    ).toBe(401);
  });
});

test.describe('Cross-site requests', () => {
  test('cookie-authenticated routes refuse a foreign Origin @P0', async ({ users }) => {
    const user = await users.create();
    const contexts: APIRequestContext[] = [];
    const device = await newApiClient(contexts);
    const signedIn = await device.signIn(user.username, user.password);
    const cookie = refreshCookieValue(signedIn)!;
    const evil = { origin: EVIL_ORIGIN };

    const signIn = await device.post(
      '/auth/sign-in',
      { identifier: user.username, password: user.password },
      { headers: evil },
    );
    expect(signIn.status).toBe(403);
    expect(messageKeys(signIn)).toContain('ERROR.ORIGIN_NOT_ALLOWED');
    expect(refreshCookieValue(signIn)).toBeUndefined();

    const refresh = await device.post('/auth/refresh', undefined, {
      headers: evil,
      anonymous: true,
    });
    expect(refresh.status).toBe(403);
    const signOut = await device.post('/auth/sign-out', undefined, { headers: evil });
    expect(signOut.status).toBe(403);

    // The session was neither rotated nor closed by those requests.
    const replay = await device.post('/auth/refresh', undefined, {
      headers: { origin: FRONTEND_URL, cookie: `cn_refresh=${cookie}` },
      anonymous: true,
    });
    expect(replay.status).toBe(200);
    await Promise.all(contexts.map((c) => c.dispose()));
  });

  test('CORS answers only the site itself @P0', async ({ api }) => {
    const foreign = await api.call('OPTIONS', '/auth/sign-in', {
      headers: { origin: EVIL_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();

    const own = await api.call('OPTIONS', '/auth/sign-in', {
      headers: { origin: FRONTEND_URL, 'access-control-request-method': 'POST' },
    });
    expect(own.status).toBe(204);
    expect(own.headers['access-control-allow-origin']).toBe(FRONTEND_URL);
    expect(own.headers['access-control-allow-credentials']).toBe('true');

    const read = await api.get('/welcome', { headers: { origin: EVIL_ORIGIN } });
    expect(read.status).toBe(200);
    expect(read.headers['access-control-allow-origin']).toBeUndefined();
  });
});

test.describe('Rate limits', () => {
  test('sign-in attempts are limited per address, other addresses are not affected @P0', async ({
    users,
  }) => {
    const user = await users.create();
    const contexts: APIRequestContext[] = [];
    const attacker = await newApiClient(contexts, randomIp());
    const bystander = await newApiClient(contexts, randomIp());

    for (let i = 0; i < 10; i++) {
      expect(
        (
          await attacker.post('/auth/sign-in', {
            identifier: user.username,
            password: `Guess-${i}-x1`,
          })
        ).status,
      ).toBe(401);
    }
    const blocked = await attacker.post('/auth/sign-in', {
      identifier: user.username,
      password: user.password,
    });
    expect(blocked.status).toBe(429);
    expect(messageKeys(blocked)).toContain('ERROR.TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Even the right password is refused from that address; another address signs in.
    expect(refreshCookieValue(blocked)).toBeUndefined();
    expect((await bystander.signIn(user.username, user.password)).status).toBe(200);
    await Promise.all(contexts.map((c) => c.dispose()));
  });

  test('password reset requests are limited too (no mail bombing) @P1', async ({ api }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (
          await api.post('/auth/forgot-password', {
            email: `victim-${i}@e2e.test`,
            language: 'en-US',
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

test.describe('API documentation in production', () => {
  test('is for administrators only, by token or by browser login @P0', async ({ api, users }) => {
    const member = await users.create({ access: 'member' });

    const anonymous = await api.get('/openapi.json');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers['www-authenticate']).toMatch(/^Basic /);
    expect((await member.api.get('/openapi.json')).status).toBe(403);
    expect((await member.api.get('/docs')).status).toBe(403);

    const basic = (user: string, password: string) => ({
      authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
    });
    expect(
      (await api.get('/openapi.json', { headers: basic(member.username, member.password) })).status,
    ).toBe(403);
    expect(
      (
        await api.get('/openapi.json', {
          headers: basic(SHARED_ADMIN.username, 'wrong-password-1'),
        })
      ).status,
    ).toBe(401);
    const asAdmin = await api.get('/openapi.json', {
      headers: basic(SHARED_ADMIN.username, SHARED_ADMIN.password),
    });
    expect(asAdmin.status).toBe(200);
    expect((asAdmin.body as unknown as { openapi: string }).openapi).toMatch(/^3\.1/);
  });

  test('the health check gives details to administrators only @P2', async ({
    api,
    sharedAdmin,
  }) => {
    const anonymous = await api.get('/health');
    const admin = await (await sharedAdmin.api()).get('/health');
    expect(anonymous.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(JSON.stringify(admin.body).length).toBeGreaterThan(
      JSON.stringify(anonymous.body).length,
    );
  });
});

test.describe('Scheduler endpoint', () => {
  test('cannot be triggered without the scheduler secret @P0', async ({ api, sharedAdmin }) => {
    expect((await api.post('/cron/war-sync')).status).toBe(401);
    expect(
      (
        await api.post('/cron/war-sync', undefined, {
          headers: { authorization: `Bearer ${'x'.repeat(48)}` },
        })
      ).status,
    ).toBe(401);
    expect((await (await sharedAdmin.api()).post('/cron/war-sync')).status).toBe(401);
  });
});

test.describe('Information exposure', () => {
  test('the secret detector catches every sensitive field, whatever its case or depth @P0', () => {
    // The detector the next test relies on: it must not be vacuous.
    const leaks = {
      user: { passwordHash: 'x', profile: { TokenHash: 'x' } },
      sessions: [{ tokenHash: 'x' }, { refreshToken: 'x' }],
      resetPasswordTokenHash: 'x',
      verifyEmailTokenHash: 'x',
      jwtSecret: 'x',
      note: 'hash: $2b$12$abcdefghijklmnopqrstuv',
      echoed: 'value 0123456789abcdef0123456789abcdef inside',
    };
    expect(findSensitive(leaks, ['0123456789abcdef0123456789abcdef'])).toEqual([
      '$.user.passwordHash (field name)',
      '$.user.profile.TokenHash (field name)',
      '$.sessions[0].tokenHash (field name)',
      '$.sessions[1].refreshToken (field name)',
      '$.resetPasswordTokenHash (field name)',
      '$.verifyEmailTokenHash (field name)',
      '$.jwtSecret (field name)',
      '$.note (bcrypt hash)',
      '$.echoed (stored secret)',
    ]);
    // A clean public user (access token included) is not flagged.
    expect(
      findSensitive({
        result: { user: { id: 'a', username: 'b', roles: ['USER'] }, accessToken: 'eyJ.x.y' },
        messages: [{ key: 'ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH', field: 'password' }],
      }),
    ).toEqual([]);
  });

  test('no response carries a password, token hash, refresh token or other stored secret @P0', async ({
    api,
    users,
    sharedAdmin,
  }) => {
    // A member with every kind of secret stored: password hash, pending email confirmation and
    // password reset (one-time token hashes), several sessions (refresh token hashes).
    const user = await users.create({ access: 'member' });
    const forgot = await api.post('/auth/forgot-password', { email: user.email, language: 'en-US' });
    await stack.waitForLink(user.email, '/reset-password');
    const signedIn = await user.api.signIn(user.username, user.password);
    const refreshed = await user.api.refresh();
    const admin = await sharedAdmin.api();
    const newcomer = uniqueName('leak');
    const password = `Pw-${randomBytes(6).toString('hex')}1a`;

    const replies: Record<string, ApiReply> = {
      'sign-up': await api.post('/auth/sign-up', {
        email: `${newcomer}@e2e.test`,
        username: newcomer,
        password,
        repeatPassword: password,
        language: 'en-US',
      }),
      'sign-in': signedIn,
      refresh: refreshed,
      'forgot-password': forgot,
      me: await user.api.get('/auth/me'),
      memberships: await user.api.get('/auth/me/memberships'),
      'resend confirmation': await user.api.post('/auth/verify-email/resend', { language: 'en-US' }),
      'own player': await user.api.get(`/players/${encodeURIComponent(user.tag!)}`),
      'own proposals': await user.api.get('/base-proposals/mine'),
      'admin: users': await admin.get(`/admin/users?user=${user.username}`),
      'admin: pending count': await admin.get('/admin/publishing/pending-count'),
    };
    for (const [name, reply] of Object.entries(replies))
      expect(reply.status, `${name} answered`).toBeLessThan(300);
    expect(JSON.stringify(replies['admin: users']!.body)).toContain(user.username);

    // The secrets really stored for this user, read from the database.
    const [stored] = await stack.find<Record<string, string>>('Users', { _id: user.id });
    const sessions = await stack.find<{ tokenHash: string }>('Sessions', { userId: user.id });
    expect(findSensitive(stored), 'the user document holds the secrets looked for').toEqual(
      expect.arrayContaining([
        '$.passwordHash (field name)',
        '$.verifyEmailTokenHash (field name)',
        '$.resetPasswordTokenHash (field name)',
      ]),
    );
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    const secrets = [
      stored!['passwordHash']!,
      stored!['verifyEmailTokenHash']!,
      stored!['resetPasswordTokenHash']!,
      ...sessions.map((s) => s.tokenHash),
      // The refresh tokens themselves travel only in the httpOnly cookie.
      refreshCookieValue(signedIn)!,
      refreshCookieValue(refreshed)!,
    ];
    expect(secrets.every((secret) => typeof secret === 'string' && secret.length >= 16)).toBe(true);

    for (const [name, reply] of Object.entries(replies)) {
      expect.soft(findSensitive(reply.body, secrets), `secrets in the ${name} response`).toEqual([]);
    }
  });

  test('bad input and unknown routes get clean errors, never internals @P1', async ({ api }) => {
    const broken = await api.call('POST', '/auth/sign-in', {
      headers: { 'content-type': 'application/json' },
      data: '{"identifier": "x", ',
    });
    expect(broken.status).toBe(400);
    expect(JSON.stringify(broken.body)).not.toMatch(/at \w+ \(|node_modules|SyntaxError/);

    const unknown = await api.get('/definitely-not-a-route');
    expect(unknown.status).toBe(404);
    expect(messageKeys(unknown)).toContain('ERROR.NOT_FOUND');
    expect(unknown.headers['x-powered-by']).toBeUndefined();
  });
});
