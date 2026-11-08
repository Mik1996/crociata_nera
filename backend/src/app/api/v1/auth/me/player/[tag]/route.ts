import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { z } from 'zod';
import { validate } from '@/lib/validation/parse';
import { unlinkPlayer } from '@/modules/auth/account.service';
import { playerTagParam } from '@/modules/auth/auth.schemas';

/** `DELETE /api/v1/auth/me/player/{tag}` (tag without `#`): unlinks one Clash of Clans account. */
export const DELETE = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.PROFILE_UPDATE, auth: true },
  async ({ params, user }) => {
    const { playerTag: tag } = validate(z.object({ playerTag: playerTagParam }), { playerTag: params.tag });
    return { result: await unlinkPlayer(user.id, tag), messages: [{ key: MessageKey.PLAYER_UNLINKED }] };
  },
);

export const OPTIONS = preflight;
