import { z } from 'zod';
import { MessageKey } from '@/lib/http/message-key';
import { MAIL_LANGUAGES, MailLanguage } from '@/lib/mail/templates';

/** bcrypt only uses the first 72 bytes of a password. */
const MAX_PASSWORD_BYTES = 72;

export const email = z
  .string({ error: MessageKey.EMAIL_SHOULD_NOT_BE_EMPTY })
  .trim()
  .toLowerCase()
  .min(1, { error: MessageKey.EMAIL_SHOULD_NOT_BE_EMPTY })
  .pipe(z.email({ error: MessageKey.EMAIL_MUST_BE_AN_EMAIL }).max(254, { error: MessageKey.EMAIL_MUST_BE_AN_EMAIL }));

const username = z
  .string({ error: MessageKey.USERNAME_SHOULD_NOT_BE_EMPTY })
  .trim()
  .min(1, { error: MessageKey.USERNAME_SHOULD_NOT_BE_EMPTY })
  .regex(/^[A-Za-z0-9_.-]{3,24}$/, { error: MessageKey.USERNAME_IS_NOT_VALID });

/** At least 8 characters with a letter and a digit. */
export const newPassword = z
  .string({ error: MessageKey.PASSWORD_SHOULD_NOT_BE_EMPTY })
  .min(1, { error: MessageKey.PASSWORD_SHOULD_NOT_BE_EMPTY })
  .refine((p) => new TextEncoder().encode(p).length <= MAX_PASSWORD_BYTES, {
    error: MessageKey.PASSWORD_IS_TOO_LONG,
  })
  .refine((p) => p.length >= 8 && /\p{L}/u.test(p) && /\d/.test(p), {
    error: MessageKey.PASSWORD_IS_NOT_STRONG_ENOUGH,
  });

const repeatPassword = z
  .string({ error: MessageKey.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY })
  .min(1, { error: MessageKey.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY });

/** `#ABC123`, upper case. */
export const playerTag = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^#[0-9A-Z]{3,15}$/, { error: MessageKey.PLAYER_TAG_IS_NOT_VALID });

/** Language of the emails sent to the user (defaults to Italian). */
const language = z
  .enum(MAIL_LANGUAGES as [MailLanguage, ...MailLanguage[]])
  .catch('it-IT')
  .default('it-IT');

const passwordsMatch = {
  error: MessageKey.PASSWORDS_DO_NOT_MATCH,
  path: ['repeatPassword'],
  // Report the mismatch even when another field is invalid.
  when: (payload: { value: unknown }) => typeof payload.value === 'object' && payload.value !== null,
};

export const signUpSchema = z
  .object({
    email,
    username,
    password: newPassword,
    repeatPassword,
    language,
  })
  .refine((data) => data.password === data.repeatPassword, passwordsMatch);

export const signInSchema = z.object({
  /** Email or username. */
  identifier: z
    .string({ error: MessageKey.IDENTIFIER_SHOULD_NOT_BE_EMPTY })
    .trim()
    .min(1, { error: MessageKey.IDENTIFIER_SHOULD_NOT_BE_EMPTY })
    .max(254, { error: MessageKey.INVALID_CREDENTIALS }),
  password: z
    .string({ error: MessageKey.PASSWORD_SHOULD_NOT_BE_EMPTY })
    .min(1, { error: MessageKey.PASSWORD_SHOULD_NOT_BE_EMPTY })
    .max(1024, { error: MessageKey.INVALID_CREDENTIALS }),
});

/** Unlinks the Clash of Clans account: `null` or empty. Linking needs the in-game token. */
export const unlinkPlayerTag = z.union([z.literal('').transform(() => null), z.null()], {
  error: MessageKey.PLAYER_TAG_IS_NOT_VALID,
});

/** `PATCH /auth/me`: `playerTag: null` (or empty) unlinks the Clash of Clans account. */
export const updateProfileSchema = z.object({
  playerTag: unlinkPlayerTag.optional(),
});

/** `POST /auth/me/player`: links the account proven by its in-game API token. */
export const linkPlayerSchema = z.object({
  playerTag: z.string({ error: MessageKey.PLAYER_TAG_IS_NOT_VALID }).pipe(playerTag),
  token: z
    .string({ error: MessageKey.PLAYER_TOKEN_SHOULD_NOT_BE_EMPTY })
    .trim()
    .min(1, { error: MessageKey.PLAYER_TOKEN_SHOULD_NOT_BE_EMPTY })
    .max(64, { error: MessageKey.PLAYER_TOKEN_IS_NOT_VALID }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: MessageKey.PASSWORD_SHOULD_NOT_BE_EMPTY })
      .min(1, { error: MessageKey.PASSWORD_SHOULD_NOT_BE_EMPTY })
      .max(1024, { error: MessageKey.INCORRECT_PASSWORD }),
    password: newPassword,
    repeatPassword,
  })
  .refine((data) => data.password === data.repeatPassword, passwordsMatch);

export const forgotPasswordSchema = z.object({ email, language });

const token = z
  .string({ error: MessageKey.TOKEN_SHOULD_NOT_BE_EMPTY })
  .trim()
  .min(1, { error: MessageKey.TOKEN_SHOULD_NOT_BE_EMPTY })
  .max(128, { error: MessageKey.INVALID_OR_EXPIRED_RESET_TOKEN });

export const resetPasswordSchema = z
  .object({ token, password: newPassword, repeatPassword })
  .refine((data) => data.password === data.repeatPassword, passwordsMatch);

export const verifyEmailSchema = z.object({ token });

export const resendVerificationSchema = z.object({ language });

export type SignUpInput = z.output<typeof signUpSchema>;
export type UpdateProfileInput = z.output<typeof updateProfileSchema>;
export type LinkPlayerInput = z.output<typeof linkPlayerSchema>;
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;
export type SignInInput = z.output<typeof signInSchema>;
