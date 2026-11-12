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
import { GET as me } from '@/app/api/v1/auth/me/route';
import { DELETE as unlinkPlayer } from '@/app/api/v1/auth/me/player/[tag]/route';
import { POST as refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as resetPassword } from '@/app/api/v1/auth/reset-password/route';
import { POST as signIn } from '@/app/api/v1/auth/sign-in/route';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { POST as resend } from '@/app/api/v1/auth/verify-email/resend/route';
import { POST as verifyEmail } from '@/app/api/v1/auth/verify-email/route';
import { migrateLinkedPlayers, UserModel } from '@/modules/auth/user.model';
import { POST as linkPlayer } from '@/app/api/v1/auth/me/player/route';
import { mockCocApi } from './coc-mock';
import { call, seedCrusadeRosters } from './helpers';

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
  // #DEF456 plays in Crociata Nera; #ABC123 in no clan of the Crusade.
  beforeEach(() => seedCrusadeRosters(['#DEF456']));

  /** Fake `verifytoken`: `good-token` is valid for every tag. */
  function mockVerifyToken() {
    const coc = mockCocApi({
      '/verifytoken': () => {
        const sent = JSON.parse(String(coc.mock.calls.at(-1)![1]!.body)) as { token: string };
        return { body: { status: sent.token === 'good-token' ? 'ok' : 'invalid' } };
      },
    });
    return coc;
  }

  it('links several accounts, each with a valid in-game token, and unlinks them one by one', async () => {
    const { token } = await register();
    const coc = mockVerifyToken();

    const wrong = await call(linkPlayer, { body: { playerTag: '#abc123', token: 'bad-token' }, token });
    expect(wrong.status).toBe(400);
    expect(wrong.body.messages).toEqual([{ key: 'ERROR.PLAYER_TOKEN_IS_NOT_VALID', field: 'token' }]);

    const first = await call(linkPlayer, { body: { playerTag: ' #abc123 ', token: ' good-token ' }, token });
    expect(first.status).toBe(200);
    expect(first.body.messages).toEqual([{ key: 'SUCCESS.PLAYER_LINKED' }]);
    expect(first.body.result.clanAccess).toBe(false);
    const [url, init] = coc.mock.calls.at(-1)!;
    expect(String(url)).toBe('https://coc.test/v1/players/%23ABC123/verifytoken');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init!.body))).toEqual({ token: 'good-token' });

    const member = await call(linkPlayer, { body: { playerTag: '#DEF456', token: 'good-token' }, token });
    expect(member.body.result.clanAccess).toBe(true);
    // Linking an account again is harmless.
    const again = await call(linkPlayer, { body: { playerTag: '#ABC123', token: 'good-token' }, token });
    expect(again.body.result.players).toEqual([
      { tag: '#ABC123', verified: true },
      { tag: '#DEF456', verified: true },
    ]);

    // The tag goes in the path without `#`.
    const unlinked = await call(unlinkPlayer, { method: 'DELETE', token, params: { tag: 'abc123' } });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.messages).toEqual([{ key: 'SUCCESS.PLAYER_UNLINKED' }]);
    expect(unlinked.body.result.players).toEqual([{ tag: '#DEF456', verified: true }]);

    const invalid = await call(unlinkPlayer, { method: 'DELETE', token, params: { tag: 'no!' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.messages).toEqual([{ key: 'ERROR.PLAYER_TAG_IS_NOT_VALID', field: 'playerTag' }]);
  });

  it('keeps a verified account to one user and frees unverified copies', async () => {
    mockVerifyToken();
    const owner = await register();
    const other = await call(signUp, {
      body: { email: 'squire@crociata.it', username: 'Squire', password: 'secret123', repeatPassword: 'secret123' },
    });
    const otherToken = other.body.result.accessToken as string;
    // Link made before verification existed: stays, unverified.
    await UserModel.updateOne({ email: 'squire@crociata.it' }, { $set: { pendingPlayerTag: '#ABC123' } });
    expect((await call(me, { token: otherToken })).body.result.players).toEqual([{ tag: '#ABC123', verified: false }]);

    expect((await call(linkPlayer, { body: { playerTag: '#ABC123', token: 'good-token' }, token: owner.token })).status).toBe(200);
    // The verified owner wins: the unverified copy is removed.
    expect((await call(me, { token: otherToken })).body.result.players).toEqual([]);

    const taken = await call(linkPlayer, { body: { playerTag: '#ABC123', token: 'good-token' }, token: otherToken });
    expect(taken.status).toBe(409);
    expect(taken.body.messages).toEqual([{ key: 'ERROR.PLAYER_TAG_ALREADY_LINKED', field: 'playerTag' }]);
  });

  it('verifies an old unverified link, and stops at the maximum number of accounts', async () => {
    mockVerifyToken();
    const { token } = await register();
    await UserModel.updateOne({ email: account.email }, { $set: { pendingPlayerTag: '#OLD111' } });
    const verified = await call(linkPlayer, { body: { playerTag: '#OLD111', token: 'good-token' }, token });
    expect(verified.body.result.players).toEqual([{ tag: '#OLD111', verified: true }]);

    // One IP per attempt: the rate limit (10 attempts per IP) is not what is tested here.
    for (let i = 2; i <= 10; i++) {
      await call(linkPlayer, { body: { playerTag: `#ACC${i}00`, token: 'good-token' }, token, ip: `10.9.0.${i}` });
    }
    const tooMany = await call(linkPlayer, { body: { playerTag: '#ONEMORE', token: 'good-token' }, token, ip: '10.9.1.1' });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.messages).toEqual([{ key: 'ERROR.PLAYER_LIMIT_REACHED', params: { max: 10 } }]);
  });

  it('moves the single linked account of the old format to the list of accounts', async () => {
    await register();
    await call(signUp, { body: { email: 'b@crociata.it', username: 'Bee', password: 'secret123', repeatPassword: 'secret123' } });
    await call(signUp, { body: { email: 'c@crociata.it', username: 'Cee', password: 'secret123', repeatPassword: 'secret123' } });
    const users = UserModel.collection;
    await users.updateOne({ email: account.email }, { $set: { playerTag: '#VER111', playerTagVerified: true } });
    await users.updateOne({ email: 'b@crociata.it' }, { $set: { playerTag: '#OLD222', playerTagVerified: false } });
    await users.updateOne({ email: 'c@crociata.it' }, { $set: { playerTag: null, playerTagVerified: false } });

    await migrateLinkedPlayers();
    await migrateLinkedPlayers(); // no-op the second time

    const saved = await users.find({}, { projection: { _id: 0, email: 1, playerTags: 1, pendingPlayerTag: 1, playerTag: 1, playerTagVerified: 1 } }).sort({ email: 1 }).toArray();
    expect(saved).toEqual([
      { email: 'b@crociata.it', playerTags: [], pendingPlayerTag: '#OLD222' },
      { email: 'c@crociata.it', playerTags: [], pendingPlayerTag: null },
      { email: account.email, playerTags: ['#VER111'], pendingPlayerTag: null },
    ]);
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
