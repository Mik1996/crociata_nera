import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { validate } from '@/lib/validation/parse';
import { selectionPathSchema } from '@/modules/cwl/cwl-selection.schemas';
import { closeSelection } from '@/modules/cwl/cwl-selection.service';

/**
 * `POST /api/v1/cwl/selection/{season}/close` (ADMIN only): closes the open selection, freezing its
 * ranking; prepares the draft of the line-up announcement and opens the next season.
 */
export const POST = apiHandler<{ season: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ params, user }) => {
    const { season } = validate(selectionPathSchema, params);
    return { result: await closeSelection(season, user.id), messages: [{ key: MessageKey.CWL_SELECTION_CLOSED }] };
  },
);

export const OPTIONS = preflight;
