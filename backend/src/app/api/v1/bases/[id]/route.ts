import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBaseForm, updateBaseSchema } from '@/modules/bases/bases.schemas';
import { deleteBase, getBase, updateBase } from '@/modules/bases/bases.service';

/** `GET /api/v1/bases/{id}`: one defense base (administrators and members of the clans). */
export const GET = apiHandler<{ id: string }>(
  { apiName: ApiName.BASES_READ, clanAccess: true },
  async ({ params }) => ({ result: await getBase(params.id) }),
);

/**
 * `PATCH /api/v1/bases/{id}` (ADMIN only), `multipart/form-data`: any of `layoutUrl`,
 * `description`, `image`; the fields left out keep their value.
 */
export const PATCH = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.BASES_WRITE, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => {
    const input = await parseBaseForm(request, updateBaseSchema, { imageRequired: false });
    return {
      result: await updateBase(user.id, params.id, input),
      messages: [{ key: MessageKey.BASE_UPDATED }],
    };
  },
);

/** `DELETE /api/v1/bases/{id}` (ADMIN only): the base and its image. */
export const DELETE = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.BASES_WRITE, roles: [UserRole.ADMIN] },
  async ({ params }) => {
    await deleteBase(params.id);
    return { result: null, messages: [{ key: MessageKey.BASE_DELETED }] };
  },
);

export const OPTIONS = preflight;
