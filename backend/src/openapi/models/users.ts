import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { dateTime, model, nullableDateTime, page, tag } from './common';

const roles = z
  .array(z.enum(UserRole))
  .describe('Roles: every user has `USER`; administrators also have `ADMIN`.');

export const LinkedPlayer = model(
  'LinkedPlayer',
  'A Clash of Clans account linked to the user.',
  z.strictObject({
    tag: tag('Player'),
    verified: z
      .boolean()
      .describe(
        '`true`: proven with the in-game API token (or linked by an administrator). `false`: old link made before the token check, still to be verified.',
      ),
  }),
);

const userShape = {
  id: z.string().describe('User id (MongoDB ObjectId).'),
  email: z.email().describe('Email address, lower case.'),
  username: z.string().describe('Username (3–24 letters, digits, `_`, `.`, `-`), unique ignoring case.'),
  roles,
  players: z.array(LinkedPlayer).describe('Linked Clash of Clans accounts (at most 10 verified).'),
  emailVerified: z.boolean().describe('The email address was confirmed with the link sent by email.'),
  clanAccess: z
    .boolean()
    .describe(
      'Full access to the site: administrator, or a verified account currently in a clan of the Crusade. Without it only the public pages are open.',
    ),
  createdAt: dateTime('Sign-up date.'),
};

export const User = model(
  'User',
  'A user of the site, as seen by the user themselves. Never includes the password.',
  z.strictObject(userShape),
);

export const AuthResult = model(
  'AuthResult',
  'A new session: the signed-in user and a short-lived access token. The refresh token is only sent as the httpOnly cookie `cn_refresh`.',
  z.strictObject({
    user: User,
    accessToken: z
      .string()
      .describe('JWT to send as `Authorization: Bearer <token>`. Keep it in memory only, never in storage.'),
    accessTokenExpiresAt: dateTime('Expiry of the access token (15 minutes by default): call `POST /auth/refresh` before it.'),
  }),
);

export const AdminUser = model(
  'AdminUser',
  'A user as listed to administrators.',
  z.strictObject({ ...userShape, updatedAt: dateTime('Last change to the account.') }),
);

export const UserPage = model(
  'UserPage',
  'A page of registered users, most recent sign-ups first.',
  z.strictObject(page(AdminUser, 'Users of the page.')),
);

export const MembersSyncResult = model(
  'MembersSyncResult',
  'Outcome of the synchronisation of the clan members.',
  z.strictObject({
    created: z
      .array(z.strictObject({ tag: tag('Player'), name: z.string().describe('In-game name.') }).describe('A new player.'))
      .describe('Members that were not saved yet.'),
    updated: z.number().int().min(0).describe('Members already saved, whose data was refreshed.'),
    left: z.number().int().min(0).describe('Saved players no longer in the clan (now `inClan: false`).'),
    nextCheckAt: nullableDateTime('Last read of the donations before the game season ends, if known.'),
  }),
);
