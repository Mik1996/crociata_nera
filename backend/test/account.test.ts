import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture outgoing emails (the links contain the one-time tokens).
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock('@/lib/mail/mailer', () => ({
  isMailConfigured: () => true,
  sendMail: vi.fn(async (message: { to: string; subject: string; text: string }) => {
    sent.push(message);
    return true;
  }),
}));

import { POST as changePassword } from '@/app/api/v1/auth/change-password/route';
import { POST as forgotPassword } from '@/app/api/v1/auth/forgot-password/route';
import { GET as me, PATCH as updateMe } from '@/app/api/v1/auth/me/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as resetPassword } from '@/app/api/v1/auth/reset-password/route';
import { POST as signIn } from '@/app/api/v1/auth/sign-in/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { POST as resend } from '@/app/api/v1/auth/verify-email/resend/route';
import { POST as verifyEmail } from '@/app/api/v1/auth/verify-email/route';
import { UserModel } from '@/modules/auth/user.model';
import { POST as linkPlayer } from '@/app/api/v1/auth/me/player/route';
import { mockCocApi } from './coc-mock';
import { call } from './helpers';

const account = { email: 'knight@crociata.it', username: 'Knight', password: 'secret123', repeatPassword: 'secret123' };
const tokenFrom = (text: string) => /token=([\w%-]+)/.exec(text)![1]!;

async function register(extra: Record<string, unknown> = {}) {
  const res = await call(signUp, { body: { ...account, ...extra } });
  return { token: res.body.result.accessToken as string, cookie: res.refreshCookie! };
}

beforeEach(() => {
  sent.length = 0;
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('email verification', () => {
  it('sends a confirmation link at sign-up, in the chosen language, and confirms the address', async () => {
    const { token } = await register({ language: 'en-US' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('knight@crociata.it');
    expect(sent[0]!.subject).toContain('confirm your email');
    expect(sent[0]!.text).toContain('http://localhost:4200/verify-email?token=');

    const ok = await call(verifyEmail, { body: { token: decodeURIComponent(tokenFrom(sent[0]!.text)) } });
    expect(ok.status).toBe(200);
    expect(ok.body.messages).toEqual([{ key: 'SUCCESS.EMAIL_VERIFIED' }]);
    expect((await call(me, { token })).body.result.emailVerified).toBe(true);

    const again = await call(verifyEmail, { body: { token: decodeURIComponent(tokenFrom(sent[0]!.text)) } });
    expect(again.status).toBe(400);
    expect(again.body.messages).toEqual([{ key: 'ERROR.INVALID_OR_EXPIRED_VERIFY_TOKEN' }]);
  });

  it('resends the link on request, but not once verified', async () => {
    const { token } = await register();
    const res = await call(resend, { body: { language: 'es-ES' }, token });
    expect(res.status).toBe(200);
    expect(sent.at(-1)!.subject).toContain('confirma tu email');

    await call(verifyEmail, { body: { token: decodeURIComponent(tokenFrom(sent.at(-1)!.text)) } });
    const done = await call(resend, { body: {}, token });
    expect(done.status).toBe(409);
    expect(done.body.messages).toEqual([{ key: 'ERROR.EMAIL_ALREADY_VERIFIED' }]);
  });
});

describe('profile', () => {
  it('links the player tag only with a valid in-game token, then unlinks it', async () => {
    const { token } = await register();
    const coc = mockCocApi({
      '/verifytoken': () => {
        const sent = JSON.parse(String(coc.mock.calls.at(-1)![1]!.body)) as { token: string };
        return { body: { tag: '#ABC123', token: sent.token, status: sent.token === 'good-token' ? 'ok' : 'invalid' } };
      },
    });

    // A tag alone is not enough anymore.
    const plain = await call(updateMe, { method: 'PATCH', body: { playerTag: '#ABC123' }, token });
    expect(plain.status).toBe(400);

    const wrong = await call(linkPlayer, { body: { playerTag: '#abc123', token: 'bad-token' }, token });
    expect(wrong.status).toBe(400);
    expect(wrong.body.messages).toEqual([{ key: 'ERROR.PLAYER_TOKEN_IS_NOT_VALID', field: 'token' }]);

    const linked = await call(linkPlayer, { body: { playerTag: ' #abc123 ', token: ' good-token ' }, token });
    expect(linked.status).toBe(200);
    expect(linked.body.messages).toEqual([{ key: 'SUCCESS.PLAYER_LINKED' }]);
    expect(linked.body.result).toMatchObject({ playerTag: '#ABC123', playerTagVerified: true });
    const [url, init] = coc.mock.calls.at(-1)!;
    expect(String(url)).toBe('https://coc.test/v1/players/%23ABC123/verifytoken');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init!.body))).toEqual({ token: 'good-token' });

    const unlinked = await call(updateMe, { method: 'PATCH', body: { playerTag: '' }, token });
    expect(unlinked.body.result).toMatchObject({ playerTag: null, playerTagVerified: false });
  });

  it('keeps a verified account to one user and frees unverified copies', async () => {
    mockCocApi({ '/verifytoken': { body: { status: 'ok' } } });
    const owner = await register();
    const other = await call(signUp, {
      body: { email: 'squire@crociata.it', username: 'Squire', password: 'secret123', repeatPassword: 'secret123' },
    });
    const otherToken = other.body.result.accessToken as string;
    // Link made before verification existed: stays, unverified.
    await UserModel.updateOne({ email: 'squire@crociata.it' }, { $set: { playerTag: '#ABC123' } });
    expect((await call(me, { token: otherToken })).body.result).toMatchObject({ playerTag: '#ABC123', playerTagVerified: false });

    expect((await call(linkPlayer, { body: { playerTag: '#ABC123', token: 't' }, token: owner.token })).status).toBe(200);
    // The verified owner wins: the unverified copy is removed.
    expect((await call(me, { token: otherToken })).body.result.playerTag).toBeNull();

    const taken = await call(linkPlayer, { body: { playerTag: '#ABC123', token: 't' }, token: otherToken });
    expect(taken.status).toBe(409);
    expect(taken.body.messages).toEqual([{ key: 'ERROR.PLAYER_TAG_ALREADY_LINKED', field: 'playerTag' }]);
  });

  it('reports unknown players and an unreachable Clash of Clans API', async () => {
    const { token } = await register();
    mockCocApi({});
    const unknown = await call(linkPlayer, { body: { playerTag: '#NOPE99', token: 't' }, token });
    expect(unknown.status).toBe(404);
    expect(unknown.body.messages).toEqual([{ key: 'ERROR.PLAYER_NOT_FOUND', field: 'playerTag' }]);

    mockCocApi({ '/verifytoken': { status: 503, body: { reason: 'inMaintenance' } } });
    const down = await call(linkPlayer, { body: { playerTag: '#ABC123', token: 't' }, token });
    expect(down.status).toBe(502);
    expect(down.body.messages).toEqual([{ key: 'ERROR.PLAYER_VERIFICATION_UNAVAILABLE' }]);
  });

  it('changes the password, keeping only the current session', async () => {
    const first = await register();
    const other = await call(signIn, { body: { identifier: 'knight', password: 'secret123' } });

    const wrong = await call(changePassword, {
      body: { currentPassword: 'nope1234', password: 'better456', repeatPassword: 'better456' },
      token: first.token,
      cookie: first.cookie,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.messages).toEqual([{ key: 'ERROR.INCORRECT_PASSWORD', field: 'currentPassword' }]);

    const ok = await call(changePassword, {
      body: { currentPassword: 'secret123', password: 'better456', repeatPassword: 'better456' },
      token: first.token,
      cookie: first.cookie,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.messages).toEqual([{ key: 'SUCCESS.PASSWORD_UPDATED' }]);

    expect((await call(refresh, { body: {}, cookie: first.cookie })).status).toBe(200);
    expect((await call(refresh, { body: {}, cookie: other.refreshCookie })).status).toBe(401);
    expect((await call(signIn, { body: { identifier: 'knight', password: 'better456' } })).status).toBe(200);
  });
});

describe('password reset', () => {
  it('emails a link, sets the new password and signs out every session', async () => {
    const { cookie } = await register();
    sent.length = 0;

    const req = await call(forgotPassword, { body: { email: 'KNIGHT@crociata.it', language: 'it-IT' } });
    expect(req.status).toBe(200);
    expect(req.body.messages).toEqual([{ key: 'SUCCESS.RESET_EMAIL_SENT' }]);
    expect(sent[0]!.subject).toContain('reimposta la password');
    const token = decodeURIComponent(tokenFrom(sent[0]!.text));

    const reset = await call(resetPassword, { body: { token, password: 'brandnew9', repeatPassword: 'brandnew9' } });
    expect(reset.status).toBe(200);
    expect(reset.body.messages).toEqual([{ key: 'SUCCESS.PASSWORD_RESET' }]);

    expect((await call(refresh, { body: {}, cookie })).status).toBe(401);
    const signedIn = await call(signIn, { body: { identifier: 'knight', password: 'brandnew9' } });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.result.user.emailVerified).toBe(true);

    const reused = await call(resetPassword, { body: { token, password: 'another12', repeatPassword: 'another12' } });
    expect(reused.status).toBe(400);
    expect(reused.body.messages).toEqual([{ key: 'ERROR.INVALID_OR_EXPIRED_RESET_TOKEN' }]);
  });

  it('gives the same answer for unknown addresses and sends nothing', async () => {
    const res = await call(forgotPassword, { body: { email: 'ghost@crociata.it' } });
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([{ key: 'SUCCESS.RESET_EMAIL_SENT' }]);
    expect(sent).toHaveLength(0);
  });
});
