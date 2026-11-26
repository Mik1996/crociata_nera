import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody, validate } from '@/lib/validation/parse';
import { closeSelectionSchema, selectionPathSchema } from '@/modules/cwl/cwl-selection.schemas';
import { closeSelection } from '@/modules/cwl/cwl-selection.service';

/**
 * `POST /api/v1/cwl/selection/{season}/close` (administrators and the leader of Crociata Nera): closes the open selection, freezing its
 * ranking; prepares the draft of the line-up announcement and opens the next season. Optional body
 * `{ lineup: { starters, reserves } }`: the line-up picked by hand (no body: the ranking's).
 */
export const POST = apiHandler<{ season: string }, unknown, true>(
  { apiName: ApiName.ADMIN, chiefAccess: true },
  async ({ request, params, user }) => {
    const { season } = validate(selectionPathSchema, params);
    // The body is optional: without one, the line-up is the ranking's.
    const { lineup } = (await request.clone().text()).trim() ? await parseBody(request, closeSelectionSchema) : { lineup: null };
    return { result: await closeSelection(season, user.id, new Date(), lineup), messages: [{ key: MessageKey.CWL_SELECTION_CLOSED }] };
  },
);

export const OPTIONS = preflight;
