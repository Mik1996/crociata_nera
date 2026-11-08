import { describe, expect, it } from 'vitest';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { POST as signIn } from '@/app/api/v1/auth/sign-in/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as signOut } from '@/app/api/v1/auth/sign-out/route';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { UserModel } from '@/modules/auth/user.model';
import { hashRefreshToken } from '@/lib/auth/tokens';
import { SessionModel } from '@/modules/auth/session.model';
import { call } from './helpers';

const account = { email: 'Alice@Example.com', username: 'Alice', password: 'secret123', repeatPassword: 'secret123' };

describe('sign-up', () => {
  it('creates the user, returns an access token and sets the httpOnly refresh cookie', async () => {
    const res = await call(signUp, { body: account });

    expect(res.status).toBe(201);
    expect(res.body.status).toEqual({ code: 201, name: 'HTTP_STATUS.CREATED' });
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.USER_CREATED' }]);
    expect(res.body.result.user).toMatchObject({ email: 'alice@example.com', username: 'Alice', roles: ['USER'] });
    expect(res.body.result.accessToken).toEqual(expect.any(String));
    expect(res.body.result).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const cookie = res.headers.getSetCookie()[0]!;
    expect(cookie).toMatch(/^cn_refresh=[\w-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth');

    const stored = await UserModel.findOne({ email: 'alice@example.com' }).select('+passwordHash');
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('returns field messages for invalid input', async () => {
    const res = await call(signUp, { body: { email: 'nope', username: 'a', password: 'short', repeatPassword: 'other' } });

    expect(res.status).toBe(400);
    expect(res.body.result).toBeNull();
    expect(res.body.messages).toEqual(
      expect.arrayContaining([
        { key: 'ERROR.EMAIL_MUST_BE_AN_EMAIL', field: 'email' },
        { key: 'ERROR.USERNAME_IS_NOT_VALID', field: 'username' },
        { key: 'ERROR.PASSWORD_IS_NOT_STRONG_ENOUGH', field: 'password' },
        { key: 'ERROR.PASSWORDS_DO_NOT_MATCH', field: 'repeatPassword' },
      ]),
    );
  });

  it('rejects a malformed JSON body', async () => {
    const res = await call(signUp, { body: '{not json' });
    expect(res.status).toBe(400);
    expect(res.body.messages).toEqual([{ key: 'ERROR.INVALID_JSON' }]);
  });

  it('rejects duplicate email and username (case-insensitive)', async () => {
    await call(signUp, { body: account });
    const res = await call(signUp, { body: { ...account, email: 'ALICE@example.com', username: 'alice' } });

    expect(res.status).toBe(409);
    expect(res.body.messages).toEqual([
      { key: 'ERROR.EMAIL_IS_ALREADY_TAKEN', field: 'email' },
      { key: 'ERROR.USERNAME_IS_ALREADY_TAKEN', field: 'username' },
    ]);
  });

  it('refuses requests from an origin that is not the frontend', async () => {
    const res = await call(signUp, { body: account, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body.messages).toEqual([{ key: 'ERROR.ORIGIN_NOT_ALLOWED' }]);
  });

  it('is rate limited per IP', async () => {
    for (let i = 0; i < 5; i++) await call(signUp, { body: { ...account, email: `u${i}@x.io`, username: `user${i}` } });
    const res = await call(signUp, { body: { ...account, email: 'u9@x.io', username: 'user9' } });

    expect(res.status).toBe(429);
    expect(res.body.messages).toEqual([{ key: 'ERROR.TOO_MANY_REQUESTS' }]);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('sign-in, me, refresh, sign-out', () => {
  it('signs in with email or username', async () => {
    await call(signUp, { body: account });

    const byEmail = await call(signIn, { body: { identifier: 'alice@example.com', password: 'secret123' } });
    const byUsername = await call(signIn, { body: { identifier: 'ALICE', password: 'secret123' } });

    expect(byEmail.status).toBe(200);
    expect(byUsername.status).toBe(200);
    expect(byEmail.body.messages).toEqual([{ key: 'SUCCESS.SIGNED_IN' }]);
    expect(byEmail.refreshCookie).toBeDefined();
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    await call(signUp, { body: account });
    const wrong = await call(signIn, { body: { identifier: 'alice', password: 'wrong-pass1' } });
    const unknown = await call(signIn, { body: { identifier: 'nobody', password: 'wrong-pass1' } });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.messages).toEqual([{ key: 'ERROR.INVALID_CREDENTIALS' }]);
  });

  it('returns the current user with a valid access token only', async () => {
    const { body } = await call(signUp, { body: account });

    const ok = await call(me, { token: body.result.accessToken });
    expect(ok.status).toBe(200);
    expect(ok.body.result.username).toBe('Alice');

    expect((await call(me)).body.messages).toEqual([{ key: 'ERROR.UNAUTHORIZED' }]);
    const bad = await call(me, { token: 'not-a-jwt' });
    expect(bad.status).toBe(401);
    expect(bad.body.messages).toEqual([{ key: 'ERROR.INVALID_TOKEN' }]);
  });

  /** Moves the rotation of a session into the past (beyond the reuse grace period). */
  async function ageRotation(cookie: string, seconds: number) {
    const token = decodeURIComponent(cookie);
    await SessionModel.updateOne({ tokenHash: hashRefreshToken(token) }, { $set: { revokedAt: new Date(Date.now() - seconds * 1000) } });
  }

  it('rotates the refresh token and revokes every session when an old one is reused', async () => {
    const first = await call(signUp, { body: account });

    const second = await call(refresh, { body: {}, cookie: first.refreshCookie });
    expect(second.status).toBe(200);
    expect(second.body.result.accessToken).toEqual(expect.any(String));
    expect(second.refreshCookie).toBeDefined();
    expect(second.refreshCookie).not.toBe(first.refreshCookie);

    // Reusing the rotated token after the grace period: treated as theft.
    await ageRotation(first.refreshCookie!, 60);
    const reused = await call(refresh, { body: {}, cookie: first.refreshCookie });
    expect(reused.status).toBe(401);
    expect(reused.body.messages).toEqual([{ key: 'ERROR.INVALID_REFRESH_TOKEN' }]);

    // …which also killed the legitimate, newer session.
    expect((await call(refresh, { body: {}, cookie: second.refreshCookie })).status).toBe(401);
  });

  it('tolerates the same token sent twice right away (two tabs), without revoking anything', async () => {
    const first = await call(signUp, { body: account });

    const [tabA, tabB] = await Promise.all([
      call(refresh, { body: {}, cookie: first.refreshCookie }),
      call(refresh, { body: {}, cookie: first.refreshCookie }),
    ]);
    expect([tabA.status, tabB.status]).toEqual([200, 200]);
    expect(tabA.refreshCookie).not.toBe(tabB.refreshCookie);

    // A reload that lost the new cookie sends the old one again: still fine.
    expect((await call(refresh, { body: {}, cookie: first.refreshCookie })).status).toBe(200);
    // Both new sessions keep working.
    expect((await call(refresh, { body: {}, cookie: tabA.refreshCookie })).status).toBe(200);
    expect((await call(refresh, { body: {}, cookie: tabB.refreshCookie })).status).toBe(200);
  });

  it('gives no grace after signing out: the old token stays dead', async () => {
    const first = await call(signUp, { body: account });
    const second = await call(refresh, { body: {}, cookie: first.refreshCookie });
    await call(signOut, { body: {}, cookie: second.refreshCookie });

    expect((await call(refresh, { body: {}, cookie: first.refreshCookie })).status).toBe(401);
  });

  it('rejects refresh without a cookie', async () => {
    const res = await call(refresh, { body: {} });
    expect(res.status).toBe(401);
  });

  it('signs out: the session is revoked and the cookie cleared', async () => {
    const { refreshCookie } = await call(signUp, { body: account });

    const out = await call(signOut, { body: {}, cookie: refreshCookie });
    expect(out.status).toBe(200);
    expect(out.body.messages).toEqual([{ key: 'SUCCESS.SIGNED_OUT' }]);
    expect(out.headers.getSetCookie()[0]).toMatch(/^cn_refresh=;.*Max-Age=0/);

    expect((await call(refresh, { body: {}, cookie: refreshCookie })).status).toBe(401);
    // Idempotent.
    expect((await call(signOut, { body: {} })).status).toBe(200);
  });
});
