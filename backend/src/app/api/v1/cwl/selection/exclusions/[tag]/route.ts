import { z } from 'zod';
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
 * `PUT /api/v1/cwl/selection/exclusions/{tag}` (tag without `#`; administrators and the leader of Crociata Nera): excludes a current
 * member from the line-up of the open selection (or of every season, `untilRevoked`), with an
 * optional reason. The player stays in the ranking, marked as excluded, and takes no slot.
 */
export const PUT = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.ADMIN, chiefAccess: true },
  async ({ request, params, user }) => {
    const { tag } = validate(pathSchema, params);
    const options = await parseBody(request, excludePlayerSchema);
    return { result: await excludePlayer(tag, options, user.id), messages: [{ key: MessageKey.PLAYER_EXCLUDED }] };
  },
);

/** `DELETE /api/v1/cwl/selection/exclusions/{tag}` (administrators and the leader of Crociata Nera): takes the player back into the line-up of the open selection. */
export const DELETE = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.ADMIN, chiefAccess: true },
  async ({ params }) => {
    const { tag } = validate(pathSchema, params);
    await readmitPlayer(tag);
    return { result: null, messages: [{ key: MessageKey.PLAYER_READMITTED }] };
  },
);

export const OPTIONS = preflight;
