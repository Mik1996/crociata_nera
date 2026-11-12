import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { deleteUserSchema, updateUserSchema } from '@/modules/admin/admin.schemas';
import { deleteUser, updateUser } from '@/modules/admin/admin.service';

/** `PATCH /api/v1/admin/users/{id}` `{ roles? }` (ADMIN only). */
export const PATCH = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => {
    const input = await parseBody(request, updateUserSchema);
    return { result: await updateUser(user.id, params.id, input), messages: [{ key: MessageKey.USER_UPDATED }] };
  },
);

/**
 * `DELETE /api/v1/admin/users/{id}` `{ username }` (ADMIN only): deletes a user. The username must
 * match exactly, as a confirmation; administrators cannot delete themselves.
 */
export const DELETE = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => {
    const input = await parseBody(request, deleteUserSchema);
    const name = await deleteUser(user.id, params.id, input);
    return { result: null, messages: [{ key: MessageKey.USER_DELETED, params: { name } }] };
  },
);

export const OPTIONS = preflight;
