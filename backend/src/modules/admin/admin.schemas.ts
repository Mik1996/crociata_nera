import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { MessageKey } from '@/lib/http/message-key';
import { playerTag } from '@/modules/auth/auth.schemas';
import { MAX_LINKED_PLAYERS } from '@/modules/auth/user.model';

/** Columns the user list can be sorted by. */
export const USER_SORT_FIELDS = ['username', 'email', 'verified', 'createdAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

/** `true` / `false` in a query string. */
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');
/** Text filter: empty means no filter. */
const textQuery = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || undefined);

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Matches email, username or player tag. */
  search: textQuery,
  /** Filters by column (all together). */
  user: textQuery,
  playerTag: textQuery,
  admin: booleanQuery.optional(),
  verified: booleanQuery.optional(),
  createdFrom: z.iso.datetime({ offset: true }).optional(),
  createdBefore: z.iso.datetime({ offset: true }).optional(),
  sort: z.enum(USER_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const updateUserSchema = z.object({
  roles: z
    .array(z.enum(Object.values(UserRole) as [UserRole, ...UserRole[]]), { error: MessageKey.ROLES_ARE_NOT_VALID })
    .max(5, { error: MessageKey.ROLES_ARE_NOT_VALID })
    .optional(),
});

/** `POST /admin/users/{id}/players`: Clash of Clans accounts linked by an administrator. */
export const linkUserPlayersSchema = z.object({
  playerTags: z
    .array(z.string({ error: MessageKey.PLAYER_TAG_IS_NOT_VALID }).pipe(playerTag), {
      error: MessageKey.PLAYER_TAG_IS_NOT_VALID,
    })
    .min(1, { error: MessageKey.PLAYER_TAG_IS_NOT_VALID })
    .max(MAX_LINKED_PLAYERS, { error: MessageKey.PLAYER_LIMIT_REACHED })
    .transform((tags) => [...new Set(tags)]),
});

/** `DELETE /admin/users/{id}`: the username typed again, to confirm the deletion. */
export const deleteUserSchema = z.object({
  username: z
    .string({ error: MessageKey.USERNAME_CONFIRMATION_MISMATCH })
    .min(1, { error: MessageKey.USERNAME_CONFIRMATION_MISMATCH })
    .max(64, { error: MessageKey.USERNAME_CONFIRMATION_MISMATCH }),
});

export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type LinkUserPlayersInput = z.output<typeof linkUserPlayersSchema>;
export type DeleteUserInput = z.output<typeof deleteUserSchema>;
