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
afterEach(() => vi.clearAllMocks());

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
  it('links, normalises and unlinks the player tag', async () => {
    const { token } = await register();

    const linked = await call(updateMe, { method: 'PATCH', body: { playerTag: ' #abc123 ' }, token });
    expect(linked.status).toBe(200);
    expect(linked.body.messages).toEqual([{ key: 'SUCCESS.PROFILE_UPDATED' }]);
    expect(linked.body.result.playerTag).toBe('#ABC123');

    const invalid = await call(updateMe, { method: 'PATCH', body: { playerTag: 'nope!' }, token });
    expect(invalid.status).toBe(400);
    expect(invalid.body.messages).toEqual([{ key: 'ERROR.PLAYER_TAG_IS_NOT_VALID', field: 'playerTag' }]);

    const unlinked = await call(updateMe, { method: 'PATCH', body: { playerTag: '' }, token });
    expect(unlinked.body.result.playerTag).toBeNull();
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
