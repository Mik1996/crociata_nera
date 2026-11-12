import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { deleteUserSchema, linkUserPlayersSchema, listUsersQuerySchema, updateUserSchema } from '@/modules/admin/admin.schemas';
import { AdminUser, MembersSyncResult, UserPage } from '../models/users';
import { ApiOperation, requestPart } from '../operation';

const userIdPath = requestPart(z.object({ id: z.string() }), {
  id: { description: 'User id (MongoDB ObjectId).', example: '6730f1c2a4b5c6d7e8f90123' },
});

const userAndTagPath = requestPart(z.object({ id: z.string(), tag: z.string() }), {
  id: { description: 'User id (MongoDB ObjectId).', example: '6730f1c2a4b5c6d7e8f90123' },
  tag: { description: 'Player tag without `#` (or with `#` encoded as `%23`), case-insensitive.', example: 'ABC123' },
});

export const ADMIN_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/admin/users',
    operationId: 'listUsers',
    tag: 'Admin',
    summary: 'List users',
    description: 'Registered users, most recent sign-ups first, optionally filtered by a text.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    query: requestPart(listUsersQuerySchema, {
      page: 'Page, from 1 (default 1).',
      limit: 'Users per page, 1–100 (default 50).',
      search: 'Text contained in the email, username or a linked player tag (case-insensitive).',
    }),
    responses: { 200: { description: 'A page of users.', result: UserPage } },
  },
  {
    method: 'PATCH',
    path: '/admin/users/{id}',
    operationId: 'updateUser',
    tag: 'Admin',
    summary: "Change a user's roles",
    description:
      'Sets the roles of a user (`USER` is always kept). When the roles change, the user is signed out everywhere so they apply at once. Administrators cannot remove their own `ADMIN` role.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: userIdPath,
    body: requestPart(updateUserSchema, {
      roles: { description: 'New roles; leave out to keep them.', example: ['USER', 'ADMIN'] },
    }),
    responses: { 200: { description: 'The updated user.', result: AdminUser, messages: [K.USER_UPDATED] } },
    errors: { 400: [K.ROLES_ARE_NOT_VALID], 404: [K.USER_NOT_FOUND], 409: [K.CANNOT_REMOVE_OWN_ADMIN] },
  },
  {
    method: 'DELETE',
    path: '/admin/users/{id}',
    operationId: 'deleteUser',
    tag: 'Admin',
    summary: 'Delete a user',
    description:
      'Deletes a user and all their sessions. The username must be sent again, exactly, as a confirmation. Administrators cannot delete their own account.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: userIdPath,
    body: requestPart(deleteUserSchema, { username: 'Username of the user to delete, typed again (case-sensitive).' }),
    responses: {
      200: {
        description: 'User deleted. The message has the deleted username in `params.name`.',
        result: null,
        messages: [K.USER_DELETED],
      },
    },
    errors: { 400: [K.USERNAME_CONFIRMATION_MISMATCH], 404: [K.USER_NOT_FOUND], 409: [K.CANNOT_DELETE_OWN_ACCOUNT] },
  },
  {
    method: 'POST',
    path: '/admin/users/{id}/players',
    operationId: 'linkUserPlayers',
    tag: 'Admin',
    summary: 'Link Clash of Clans accounts to a user',
    description:
      "Links one or more Clash of Clans accounts to a user on the administrator's word, without the in-game token: the links count as verified. Every account must exist in the game and not be linked to another user; a user keeps at most 10 accounts.",
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: userIdPath,
    body: requestPart(linkUserPlayersSchema, {
      playerTags: { description: 'Player tags, with `#` (duplicates are ignored).', example: ['#ABC123', '#DEF456'] },
    }),
    responses: { 200: { description: 'The updated user.', result: AdminUser, messages: [K.USER_UPDATED] } },
    errors: {
      400: [K.PLAYER_TAG_IS_NOT_VALID, K.PLAYER_LIMIT_REACHED],
      404: [K.USER_NOT_FOUND, K.PLAYER_NOT_FOUND_TAG],
      409: [K.PLAYER_TAG_LINKED_TO_OTHER_USER, K.PLAYER_LIMIT_REACHED, K.PLAYER_TAG_ALREADY_LINKED],
      502: [K.PLAYER_VERIFICATION_UNAVAILABLE],
    },
  },
  {
    method: 'DELETE',
    path: '/admin/users/{id}/players/{tag}',
    operationId: 'unlinkUserPlayer',
    tag: 'Admin',
    summary: 'Unlink a Clash of Clans account from a user',
    description: 'Unlinks one account of a user, verified or not.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: userAndTagPath,
    responses: { 200: { description: 'The updated user.', result: AdminUser, messages: [K.USER_UPDATED] } },
    errors: { 400: [K.PLAYER_TAG_IS_NOT_VALID], 404: [K.USER_NOT_FOUND] },
  },
  {
    method: 'POST',
    path: '/admin/players/sync',
    operationId: 'syncPlayers',
    tag: 'Admin',
    summary: 'Synchronise the clan members',
    description:
      'Reads the clan from the Clash of Clans API and saves its members: creates the missing players, refreshes the others, marks those who left. The scheduler does the same at every run; commendations are not touched.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    responses: { 200: { description: 'Members saved.', result: MembersSyncResult } },
    errors: { 502: [K.PLAYERS_SYNC_FAILED] },
  },
];
