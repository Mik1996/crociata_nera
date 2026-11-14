import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody, validate } from '@/lib/validation/parse';
import { playerTagParam } from '@/modules/auth/auth.schemas';
import { excludePlayerSchema } from '@/modules/cwl/cwl-selection.schemas';
import { excludePlayer, readmitPlayer } from '@/modules/cwl/cwl-selection.service';

const pathSchema = z.object({ tag: playerTagParam });

/**
 * `PUT /api/v1/cwl/selection/exclusions/{tag}` (tag without `#`, ADMIN only): excludes a current
 * member from the CWL line-up, with an optional reason. The player stays in the ranking, marked
 * as excluded, and takes no slot.
 */
export const PUT = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => {
    const { tag } = validate(pathSchema, params);
    const { reason } = await parseBody(request, excludePlayerSchema);
    return { result: await excludePlayer(tag, reason, user.id), messages: [{ key: MessageKey.PLAYER_EXCLUDED }] };
  },
);

/** `DELETE /api/v1/cwl/selection/exclusions/{tag}` (ADMIN only): takes the player back into the line-up. */
export const DELETE = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ params }) => {
    const { tag } = validate(pathSchema, params);
    await readmitPlayer(tag);
    return { result: null, messages: [{ key: MessageKey.PLAYER_READMITTED }] };
  },
);

export const OPTIONS = preflight;
