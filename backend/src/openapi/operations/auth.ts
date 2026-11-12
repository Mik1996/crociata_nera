import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  linkPlayerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@/modules/auth/auth.schemas';
import { AuthResult, User } from '../models/users';
import { ApiOperation, FieldDoc, requestPart } from '../operation';

const NEW_PASSWORD: FieldDoc = {
  description: 'New password: 8 or more characters with at least a letter and a digit, at most 72 bytes.',
  format: 'password',
};
const REPEAT_PASSWORD: FieldDoc = { description: 'The new password typed again: must match `password`.', format: 'password' };
const LANGUAGE: FieldDoc = 'Language of the email sent: `it-IT` (default), `en-US` or `es-ES`.';
const NEW_PASSWORD_ERRORS = [
  K.PASSWORD_SHOULD_NOT_BE_EMPTY,
  K.PASSWORD_IS_NOT_STRONG_ENOUGH,
  K.PASSWORD_IS_TOO_LONG,
  K.REPEAT_PASSWORD_SHOULD_NOT_BE_EMPTY,
  K.PASSWORDS_DO_NOT_MATCH,
];

/** The player tag in a path, where `#` cannot be written. */
export const playerTagPath = requestPart(z.object({ tag: z.string() }), {
  tag: { description: 'Player tag without `#` (or with `#` encoded as `%23`), case-insensitive.', example: 'ABC123' },
});

const SESSION_NOTE =
  'Sets the httpOnly refresh cookie `cn_refresh` (path `/api/v1/auth`, `SameSite=Strict`, 30 days), used by `POST /auth/refresh`.';

export const AUTH_OPERATIONS: ApiOperation[] = [
  {
    method: 'POST',
    path: '/auth/sign-up',
    operationId: 'signUp',
    tag: 'Auth',
    summary: 'Create an account',
    description: `Creates the account and signs the user in. A confirmation link is emailed (best effort: the account works anyway). ${SESSION_NOTE}`,
    access: 'public',
    rateLimit: ApiName.SIGN_UP,
    checkOrigin: true,
    body: requestPart(signUpSchema, {
      email: { description: 'Email address (stored lower case), unique.', format: 'email', example: 'player@example.com' },
      username: { description: 'Username: 3–24 letters, digits, `_`, `.` or `-`; unique ignoring case.', example: 'BlackCrusader' },
      password: NEW_PASSWORD,
      repeatPassword: REPEAT_PASSWORD,
      language: LANGUAGE,
    }),
    responses: {
      201: { description: 'Account created, user signed in.', result: AuthResult, messages: [K.USER_CREATED], setsRefreshCookie: true },
    },
    errors: {
      400: [K.EMAIL_SHOULD_NOT_BE_EMPTY, K.EMAIL_MUST_BE_AN_EMAIL, K.USERNAME_SHOULD_NOT_BE_EMPTY, K.USERNAME_IS_NOT_VALID, ...NEW_PASSWORD_ERRORS],
      409: [K.EMAIL_IS_ALREADY_TAKEN, K.USERNAME_IS_ALREADY_TAKEN],
    },
  },
  {
    method: 'POST',
    path: '/auth/sign-in',
    operationId: 'signIn',
    tag: 'Auth',
    summary: 'Sign in',
    description: `Signs in with email or username and password. Unknown users and wrong passwords get the same answer. ${SESSION_NOTE}`,
    access: 'public',
    rateLimit: ApiName.SIGN_IN,
    checkOrigin: true,
    body: requestPart(signInSchema, {
      identifier: { description: 'Email address or username (case-insensitive).', example: 'BlackCrusader' },
      password: { description: 'Password.', format: 'password' },
    }),
    responses: {
      200: { description: 'Signed in.', result: AuthResult, messages: [K.SIGNED_IN], setsRefreshCookie: true },
    },
    errors: {
      400: [K.IDENTIFIER_SHOULD_NOT_BE_EMPTY, K.PASSWORD_SHOULD_NOT_BE_EMPTY, K.INVALID_CREDENTIALS],
      401: [K.INVALID_CREDENTIALS],
    },
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    operationId: 'refreshSession',
    tag: 'Auth',
    summary: 'Refresh the access token',
    description:
      'Exchanges the refresh cookie for a new access token. The refresh token is rotated: the response sets a new cookie and the old one stops working. A rotated token sent again within 30 seconds (two tabs, a retried request) still opens a session; later, it counts as stolen and every session of the user is revoked.',
    access: 'public',
    rateLimit: ApiName.REFRESH,
    checkOrigin: true,
    refreshCookie: 'required',
    responses: {
      200: { description: 'New access token.', result: AuthResult, messages: [K.TOKEN_REFRESHED], setsRefreshCookie: true },
    },
    errors: { 401: [K.INVALID_REFRESH_TOKEN] },
  },
  {
    method: 'POST',
    path: '/auth/sign-out',
    operationId: 'signOut',
    tag: 'Auth',
    summary: 'Sign out',
    description: 'Revokes the session of the refresh cookie and clears the cookie. Idempotent: succeeds without a cookie too.',
    access: 'public',
    rateLimit: ApiName.SIGN_OUT,
    checkOrigin: true,
    refreshCookie: 'optional',
    responses: {
      200: { description: 'Signed out, cookie cleared.', result: null, messages: [K.SIGNED_OUT], setsRefreshCookie: true },
    },
  },
  {
    method: 'POST',
    path: '/auth/forgot-password',
    operationId: 'forgotPassword',
    tag: 'Auth',
    summary: 'Request a password reset',
    description:
      'Emails a password reset link, valid 1 hour. The answer is the same whether the address is registered or not, so the endpoint does not reveal accounts.',
    access: 'public',
    rateLimit: ApiName.FORGOT_PASSWORD,
    checkOrigin: true,
    body: requestPart(forgotPasswordSchema, {
      email: { description: 'Email address of the account.', format: 'email', example: 'player@example.com' },
      language: LANGUAGE,
    }),
    responses: { 200: { description: 'Request accepted.', result: null, messages: [K.RESET_EMAIL_SENT] } },
    errors: { 400: [K.EMAIL_SHOULD_NOT_BE_EMPTY, K.EMAIL_MUST_BE_AN_EMAIL] },
  },
  {
    method: 'POST',
    path: '/auth/reset-password',
    operationId: 'resetPassword',
    tag: 'Auth',
    summary: 'Reset the password',
    description:
      'Sets a new password with the token of the reset link. Every session of the account is signed out, and the email address counts as verified.',
    access: 'public',
    rateLimit: ApiName.RESET_PASSWORD,
    checkOrigin: true,
    body: requestPart(resetPasswordSchema, {
      token: 'Token from the reset link (`/reset-password?token=…`).',
      password: NEW_PASSWORD,
      repeatPassword: REPEAT_PASSWORD,
    }),
    responses: { 200: { description: 'Password changed.', result: null, messages: [K.PASSWORD_RESET] } },
    errors: { 400: [K.TOKEN_SHOULD_NOT_BE_EMPTY, K.INVALID_OR_EXPIRED_RESET_TOKEN, ...NEW_PASSWORD_ERRORS] },
  },
  {
    method: 'POST',
    path: '/auth/verify-email',
    operationId: 'verifyEmail',
    tag: 'Auth',
    summary: 'Confirm the email address',
    description: 'Confirms the email address with the token of the link sent by email (valid 24 hours).',
    access: 'public',
    rateLimit: ApiName.VERIFY_EMAIL,
    checkOrigin: true,
    body: requestPart(verifyEmailSchema, { token: 'Token from the confirmation link (`/verify-email?token=…`).' }),
    responses: { 200: { description: 'Address confirmed: the updated user.', result: User, messages: [K.EMAIL_VERIFIED] } },
    errors: { 400: [K.TOKEN_SHOULD_NOT_BE_EMPTY, K.INVALID_OR_EXPIRED_RESET_TOKEN, K.INVALID_OR_EXPIRED_VERIFY_TOKEN] },
  },
  {
    method: 'GET',
    path: '/auth/me',
    operationId: 'getCurrentUser',
    tag: 'Account',
    summary: 'Get the signed-in user',
    description: 'The user of the access token, with roles, linked accounts and site access.',
    access: 'user',
    rateLimit: ApiName.ME,
    responses: { 200: { description: 'The signed-in user.', result: User } },
    errors: { 404: [K.USER_NOT_FOUND] },
  },
  {
    method: 'POST',
    path: '/auth/me/player',
    operationId: 'linkPlayer',
    tag: 'Account',
    summary: 'Link a Clash of Clans account',
    description:
      'Links one more Clash of Clans account, proven by the API token shown in the game (Settings → More Settings → API Token), checked with the official API. A user can link up to 10 accounts; an account belongs to one user only.',
    access: 'user',
    rateLimit: ApiName.PLAYER_LINK,
    body: requestPart(linkPlayerSchema, {
      playerTag: { description: 'Player tag, with `#`.', example: '#ABC123' },
      token: 'API token shown in the game (single use, changes every few minutes).',
    }),
    responses: { 200: { description: 'Account linked: the updated user.', result: User, messages: [K.PLAYER_LINKED] } },
    errors: {
      400: [K.PLAYER_TAG_IS_NOT_VALID, K.PLAYER_TOKEN_SHOULD_NOT_BE_EMPTY, K.PLAYER_TOKEN_IS_NOT_VALID],
      404: [K.USER_NOT_FOUND, K.PLAYER_NOT_FOUND],
      409: [K.PLAYER_TAG_ALREADY_LINKED, K.PLAYER_LIMIT_REACHED],
      502: [K.PLAYER_VERIFICATION_UNAVAILABLE],
    },
  },
  {
    method: 'DELETE',
    path: '/auth/me/player/{tag}',
    operationId: 'unlinkPlayer',
    tag: 'Account',
    summary: 'Unlink a Clash of Clans account',
    description: 'Unlinks one of the accounts of the signed-in user, verified or not.',
    access: 'user',
    rateLimit: ApiName.PROFILE_UPDATE,
    params: playerTagPath,
    responses: { 200: { description: 'Account unlinked: the updated user.', result: User, messages: [K.PLAYER_UNLINKED] } },
    errors: { 400: [K.PLAYER_TAG_IS_NOT_VALID], 404: [K.USER_NOT_FOUND] },
  },
  {
    method: 'POST',
    path: '/auth/change-password',
    operationId: 'changePassword',
    tag: 'Account',
    summary: 'Change the password',
    description:
      'Changes the password after checking the current one. Every other session is signed out; the session of the refresh cookie sent with the request stays active.',
    access: 'user',
    rateLimit: ApiName.CHANGE_PASSWORD,
    checkOrigin: true,
    refreshCookie: 'optional',
    body: requestPart(changePasswordSchema, {
      currentPassword: { description: 'Current password.', format: 'password' },
      password: NEW_PASSWORD,
      repeatPassword: REPEAT_PASSWORD,
    }),
    responses: { 200: { description: 'Password changed.', result: null, messages: [K.PASSWORD_UPDATED] } },
    errors: { 400: [K.INCORRECT_PASSWORD, ...NEW_PASSWORD_ERRORS], 404: [K.USER_NOT_FOUND] },
  },
  {
    method: 'POST',
    path: '/auth/verify-email/resend',
    operationId: 'resendVerificationEmail',
    tag: 'Account',
    summary: 'Send the confirmation email again',
    description: 'Sends a new email address confirmation link to the signed-in user.',
    access: 'user',
    rateLimit: ApiName.RESEND_VERIFICATION,
    body: requestPart(resendVerificationSchema, { language: LANGUAGE }),
    responses: { 200: { description: 'Email sent.', result: null, messages: [K.VERIFICATION_EMAIL_SENT] } },
    errors: { 404: [K.USER_NOT_FOUND], 409: [K.EMAIL_ALREADY_VERIFIED], 503: [K.EMAIL_NOT_CONFIGURED] },
  },
];
