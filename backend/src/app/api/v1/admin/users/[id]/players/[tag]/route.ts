import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { z } from 'zod';
import { validate } from '@/lib/validation/parse';
import { unlinkUserPlayer } from '@/modules/admin/admin.service';
import { playerTagParam } from '@/modules/auth/auth.schemas';

/**
 * `DELETE /api/v1/admin/users/{id}/players/{tag}` (tag without `#`, ADMIN only): unlinks one
 * Clash of Clans account of a user. Linking is only possible for the user, with the game token.
 */
export const DELETE = apiHandler<{ id: string; tag: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ params }) => {
    const { playerTag: tag } = validate(z.object({ playerTag: playerTagParam }), { playerTag: params.tag });
    return { result: await unlinkUserPlayer(params.id, tag), messages: [{ key: MessageKey.USER_UPDATED }] };
  },
);

export const OPTIONS = preflight;
