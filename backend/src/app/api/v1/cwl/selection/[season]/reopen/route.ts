import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { validate } from '@/lib/validation/parse';
import { selectionPathSchema } from '@/modules/cwl/cwl-selection.schemas';
import { reopenSelection } from '@/modules/cwl/cwl-selection.service';

/**
 * `POST /api/v1/cwl/selection/{season}/reopen` (administrators and the leader of Crociata Nera): opens a closed selection again, while its
 * CWL has not started and no later season was closed.
 */
export const POST = apiHandler<{ season: string }, unknown, true>(
  { apiName: ApiName.ADMIN, chiefAccess: true },
  async ({ params }) => {
    const { season } = validate(selectionPathSchema, params);
    return { result: await reopenSelection(season), messages: [{ key: MessageKey.CWL_SELECTION_REOPENED }] };
  },
);

export const OPTIONS = preflight;
