import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { linkUserPlayersSchema } from '@/modules/admin/admin.schemas';
import { linkUserPlayers } from '@/modules/admin/admin.service';

/**
 * `POST /api/v1/admin/users/{id}/players` `{ playerTags }` (ADMIN only): links one or more Clash
 * of Clans accounts to a user without the in-game token. Unlink one with `DELETE .../players/{tag}`.
 */
export const POST = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params }) => {
    const input = await parseBody(request, linkUserPlayersSchema);
    return {
      result: await linkUserPlayers(params.id, input),
      messages: [{ key: MessageKey.USER_UPDATED }],
    };
  },
);

export const OPTIONS = preflight;
