import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody, validate } from '@/lib/validation/parse';
import { lineupSizeSchema, selectionPathSchema } from '@/modules/cwl/cwl-selection.schemas';
import { setLineupSize } from '@/modules/cwl/cwl-selection.service';

/**
 * `PUT /api/v1/cwl/selection/{season}/lineup-size` (administrators and the leader of Crociata Nera):
 * picks the size of the line-up of the open selection, `{ starters: 15 }` (3 reserves) or
 * `{ starters: 30 }` (5 reserves); the ranking follows at once.
 */
export const PUT = apiHandler<{ season: string }, unknown, true>(
  { apiName: ApiName.ADMIN, chiefAccess: true },
  async ({ request, params }) => {
    const { season } = validate(selectionPathSchema, params);
    const { starters } = await parseBody(request, lineupSizeSchema);
    return { result: await setLineupSize(season, starters), messages: [{ key: MessageKey.CWL_LINEUP_SIZE_CHANGED }] };
  },
);

export const OPTIONS = preflight;
