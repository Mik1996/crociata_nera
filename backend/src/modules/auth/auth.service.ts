import { Types } from 'mongoose';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageDescriptor } from '@/lib/http/base-result';
import { MessageKey } from '@/lib/http/message-key';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { sendVerificationEmail } from './account.service';
import { SignInInput, SignUpInput } from './auth.schemas';
import { SessionDocument, SessionModel } from './session.model';
import { PublicUser, toPublicUser, UserDocument, UserModel } from './user.model';

/** Request metadata stored with a session (helps users recognise their devices). */
export interface ClientInfo {
  ip: string;
  userAgent: string | null;
}

/** Result of sign-up, sign-in and refresh. The refresh token goes in the cookie only. */
export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: Types.ObjectId;
}

/** JSON body returned to the client (no refresh token). */
export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export function toAuthResult({ user, accessToken, accessTokenExpiresAt }: AuthSession): AuthResult {
  return { user, accessToken, accessTokenExpiresAt };
}

export async function signUp(input: SignUpInput, client: ClientInfo): Promise<AuthSession> {
  const usernameKey = input.username.toLowerCase();
  const [emailTaken, usernameTaken] = await Promise.all([
    UserModel.exists({ email: input.email }),
    UserModel.exists({ usernameKey }),
  ]);
  const conflicts: MessageDescriptor[] = [];
  if (emailTaken) conflicts.push({ key: MessageKey.EMAIL_IS_ALREADY_TAKEN, field: 'email' });
  if (usernameTaken) conflicts.push({ key: MessageKey.USERNAME_IS_ALREADY_TAKEN, field: 'username' });
  if (conflicts.length) throwException(409, conflicts);

  let user: UserDocument;
  try {
    user = await UserModel.create({
      email: input.email,
      username: input.username,
      usernameKey,
      passwordHash: await hashPassword(input.password),
      roles: [UserRole.USER],
      });
  } catch (error) {
    // Two concurrent sign-ups with the same email/username: the unique index decides.
    if (isDuplicateKey(error)) {
      const field = 'email' in ((error as { keyPattern?: object }).keyPattern ?? {}) ? 'email' : 'username';
      throwException(409, [
        { key: field === 'email' ? MessageKey.EMAIL_IS_ALREADY_TAKEN : MessageKey.USERNAME_IS_ALREADY_TAKEN, field },
      ]);
    }
    throw error;
  }
  // Confirmation email: best effort, the account works anyway.
  await sendVerificationEmail(user, input.language).catch((error: unknown) =>
    console.error('[auth] verification email failed:', (error as Error).message),
  );
  return startSession(user, client);
}

export async function signIn(input: SignInInput, client: ClientInfo): Promise<AuthSession> {
  const identifier = input.identifier.toLowerCase();
  const filter = identifier.includes('@') ? { email: identifier } : { usernameKey: identifier };
  const user = await UserModel.findOne(filter).select('+passwordHash');

  // Same answer for unknown user and wrong password: do not reveal registered accounts.
  if (!(await verifyPassword(input.password, user?.passwordHash ?? null)) || !user) {
    throwException(401, MessageKey.INVALID_CREDENTIALS);
  }
  return startSession(user, client);
}

/**
 * Rotates a refresh token: the presented session is revoked and replaced by a new one.
 * Presenting a token that was already rotated means it leaked: every session of that
 * user is revoked and they must sign in again.
 */
export async function refresh(refreshToken: string | null, client: ClientInfo): Promise<AuthSession> {
  if (!refreshToken) throwException(401, MessageKey.INVALID_REFRESH_TOKEN);

  const session = await SessionModel.findOne({ tokenHash: hashRefreshToken(refreshToken) });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    throwException(401, MessageKey.INVALID_REFRESH_TOKEN);
  }
  const user = await UserModel.findById(session.userId);
  if (!user) {
    await revokeAllSessions(session.userId);
    throwException(401, MessageKey.INVALID_REFRESH_TOKEN);
  }

  if (session.revokedAt) {
    // Same token sent twice by the same browser (two tabs, a retried request): a new session.
    if (await isRecentRotation(session)) return startSession(user, client);
    // An old token coming back: treated as theft, every session of the user is revoked.
    await revokeAllSessions(session.userId);
    throwException(401, MessageKey.INVALID_REFRESH_TOKEN);
  }

  // Atomic claim: if two refreshes race with the same token, only one rotates it.
  const claimed = await SessionModel.updateOne(
    { _id: session._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'rotated' } },
  );
  if (claimed.modifiedCount === 0) {
    const latest = await SessionModel.findById(session._id);
    if (latest && (await isRecentRotation(latest))) return startSession(user, client);
    await revokeAllSessions(session.userId);
    throwException(401, MessageKey.INVALID_REFRESH_TOKEN);
  }

  const next = await startSession(user, client);
  await SessionModel.updateOne({ _id: session._id }, { $set: { replacedBy: next.sessionId } });
  return next;
}

/**
 * How long a token just replaced by a refresh is still accepted. Browsers legitimately send the
 * same token twice: two tabs refreshing at the same moment, or a refresh whose response (with the
 * new cookie) was lost to a reload. Common practice ("reuse interval"); outside this window a
 * reused token is treated as stolen.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

/**
 * The session was rotated less than {@link REFRESH_REUSE_GRACE_MS} ago and its successor is still
 * alive (or rotated in turn): signing out or revoking the successor ends the tolerance at once.
 */
async function isRecentRotation(session: SessionDocument): Promise<boolean> {
  if (session.revokedReason !== 'rotated' || !session.revokedAt) return false;
  if (Date.now() - session.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) return false;
  if (!session.replacedBy) return true; // the concurrent refresh is still creating it
  const successor = await SessionModel.findById(session.replacedBy).select('revokedAt revokedReason');
  return !!successor && (!successor.revokedAt || successor.revokedReason === 'rotated');
}

/** Revokes the session of the given refresh token. Idempotent: unknown tokens are ignored. */
export async function signOut(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return;
  await SessionModel.updateOne(
    { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'signedOut' } },
  );
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = Types.ObjectId.isValid(userId) ? await UserModel.findById(userId) : null;
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);
  return toPublicUser(user);
}

async function startSession(user: UserDocument, client: ClientInfo): Promise<AuthSession> {
  await grantConfiguredAdmin(user);
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = new Date(Date.now() + env().REFRESH_TOKEN_EXPIRES_IN * 1000);
  const session = await SessionModel.create({
    userId: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
    ip: client.ip,
    userAgent: client.userAgent?.slice(0, 512) ?? null,
  });

  const access = await signAccessToken({ sub: user._id.toString(), roles: [...user.roles] as UserRole[] });
  return {
    user: toPublicUser(user),
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt,
    sessionId: session._id,
  };
}

/** Users listed in `ADMIN_EMAILS` get the ADMIN role (bootstrap of the first administrator). */
async function grantConfiguredAdmin(user: UserDocument): Promise<void> {
  if (!env().ADMIN_EMAILS.includes(user.email) || user.roles.includes(UserRole.ADMIN)) return;
  user.roles.push(UserRole.ADMIN);
  await UserModel.updateOne({ _id: user._id }, { $addToSet: { roles: UserRole.ADMIN } });
}

async function revokeAllSessions(userId: Types.ObjectId): Promise<void> {
  await SessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'revoked' } });
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}
