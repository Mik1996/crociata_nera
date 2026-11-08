import { Types } from 'mongoose';
import { CocApiError, verifyPlayerToken } from '@/lib/coc/coc-client';
import { env } from '@/lib/config/env';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/tokens';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { isMailConfigured, sendMail } from '@/lib/mail/mailer';
import { MailLanguage, passwordResetMail, verifyEmailMail } from '@/lib/mail/templates';
import { ChangePasswordInput, LinkPlayerInput, ResetPasswordInput, UpdateProfileInput } from './auth.schemas';
import { SessionModel } from './session.model';
import { PublicUser, toPublicUser, UserDocument, UserModel } from './user.model';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Public base URL for links in emails. */
export function appUrl(): string {
  const config = env();
  return config.APP_URL ?? config.FRONTEND_URL[0] ?? 'http://localhost:4200';
}

async function findUser(userId: string): Promise<UserDocument> {
  const user = Types.ObjectId.isValid(userId) ? await UserModel.findById(userId) : null;
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);
  return user;
}

/** Profile changes: `playerTag: null` unlinks the Clash of Clans account. */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
  const user = await findUser(userId);
  if (input.playerTag === null) user.set({ playerTag: null, playerTagVerified: false });
  await user.save();
  return toPublicUser(user);
}

/**
 * Links a Clash of Clans account after proving it is the user's: the API token shown in the game
 * (Settings → More Settings) must match, which only the account owner can read. A verified
 * account belongs to one user only; unverified copies of the same tag on other users (links made
 * before the check existed) are removed.
 */
export async function linkPlayer(userId: string, input: LinkPlayerInput): Promise<PublicUser> {
  const user = await findUser(userId);
  const taken = await UserModel.exists({ _id: { $ne: user._id }, playerTag: input.playerTag, playerTagVerified: true });
  if (taken) throwException(409, [{ key: MessageKey.PLAYER_TAG_ALREADY_LINKED, field: 'playerTag' }]);

  let valid: boolean;
  try {
    valid = await verifyPlayerToken(input.playerTag, input.token);
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    if (error.status === 404) throwException(404, [{ key: MessageKey.PLAYER_NOT_FOUND, field: 'playerTag' }]);
    throwException(502, MessageKey.PLAYER_VERIFICATION_UNAVAILABLE);
  }
  if (!valid) throwException(400, [{ key: MessageKey.PLAYER_TOKEN_IS_NOT_VALID, field: 'token' }]);

  user.set({ playerTag: input.playerTag, playerTagVerified: true });
  try {
    await user.save();
  } catch (error) {
    // Another user verified the same account in the meantime (unique index).
    if ((error as { code?: number }).code === 11000) {
      throwException(409, [{ key: MessageKey.PLAYER_TAG_ALREADY_LINKED, field: 'playerTag' }]);
    }
    throw error;
  }
  await UserModel.updateMany(
    { _id: { $ne: user._id }, playerTag: input.playerTag, playerTagVerified: { $ne: true } },
    { $set: { playerTag: null, playerTagVerified: false } },
  );
  return toPublicUser(user);
}

/**
 * Changes the password after checking the current one. Every other session is signed out;
 * the session making the request (its refresh cookie) stays valid.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  currentRefreshToken: string | null,
): Promise<void> {
  const user = Types.ObjectId.isValid(userId) ? await UserModel.findById(userId).select('+passwordHash') : null;
  if (!user) throwException(404, MessageKey.USER_NOT_FOUND);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throwException(400, [{ key: MessageKey.INCORRECT_PASSWORD, field: 'currentPassword' }]);
  }
  user.passwordHash = await hashPassword(input.password);
  await user.save();

  const keep = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
  await SessionModel.updateMany(
    { userId: user._id, revokedAt: null, ...(keep ? { tokenHash: { $ne: keep } } : {}) },
    { $set: { revokedAt: new Date() } },
  );
}

/**
 * Sends a password reset link. Always succeeds from the caller's point of view, whether
 * the email exists or not, so the endpoint does not reveal registered addresses.
 */
export async function requestPasswordReset(email: string, language: MailLanguage): Promise<void> {
  const user = await UserModel.findOne({ email });
  if (!user) return;

  const token = generateRefreshToken();
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { resetPasswordTokenHash: hashRefreshToken(token), resetPasswordExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) } },
  );
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail(passwordResetMail(language, user.email, user.username, link));
}

/** Sets a new password from a reset link; signs out every session of the account. */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const user = await UserModel.findOne({
    resetPasswordTokenHash: hashRefreshToken(input.token),
    resetPasswordExpiresAt: { $gt: new Date() },
  });
  if (!user) throwException(400, [{ key: MessageKey.INVALID_OR_EXPIRED_RESET_TOKEN }]);

  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await hashPassword(input.password),
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
        // The link reached the inbox: the address is proven.
        emailVerified: true,
      },
    },
  );
  await SessionModel.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** Sends the email confirmation link. Returns `false` when email is not configured. */
export async function sendVerificationEmail(user: UserDocument, language: MailLanguage): Promise<boolean> {
  const token = generateRefreshToken();
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { verifyEmailTokenHash: hashRefreshToken(token), verifyEmailExpiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS) } },
  );
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail(verifyEmailMail(language, user.email, user.username, link));
}

/** "Send the confirmation email again" from the profile page. */
export async function resendVerification(userId: string, language: MailLanguage): Promise<void> {
  const user = await findUser(userId);
  if (user.emailVerified) throwException(409, MessageKey.EMAIL_ALREADY_VERIFIED);
  if (!isMailConfigured() && env().NODE_ENV === 'production') throwException(503, MessageKey.EMAIL_NOT_CONFIGURED);
  await sendVerificationEmail(user, language);
}

/** Confirms the email address from the link; idempotent for the same account. */
export async function verifyEmail(token: string): Promise<PublicUser> {
  const user = await UserModel.findOne({
    verifyEmailTokenHash: hashRefreshToken(token),
    verifyEmailExpiresAt: { $gt: new Date() },
  });
  if (!user) throwException(400, [{ key: MessageKey.INVALID_OR_EXPIRED_VERIFY_TOKEN }]);
  user.emailVerified = true;
  user.set({ verifyEmailTokenHash: null, verifyEmailExpiresAt: null });
  await user.save();
  return toPublicUser(user);
}
