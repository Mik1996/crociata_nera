import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { MessageKey } from '@/lib/http/message-key';
import { playerTag } from '@/modules/auth/auth.schemas';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Matches email, username or player tag. */
  search: z.string().trim().max(64).optional(),
});

export const updateUserSchema = z.object({
  roles: z
    .array(z.enum(Object.values(UserRole) as [UserRole, ...UserRole[]]), { error: MessageKey.ROLES_ARE_NOT_VALID })
    .max(5, { error: MessageKey.ROLES_ARE_NOT_VALID })
    .optional(),
  playerTag: z
    .union([z.literal('').transform(() => null), z.null(), playerTag], { error: MessageKey.PLAYER_TAG_IS_NOT_VALID })
    .optional(),
});

export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
