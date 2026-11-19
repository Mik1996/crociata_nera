import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { updateMyProposal, withdrawMyProposal } from '@/modules/bases/base-proposals.service';
import { parseBaseForm, updateBaseSchema } from '@/modules/bases/bases.schemas';

/**
 * `PATCH /api/v1/base-proposals/{id}` (the author only), `multipart/form-data` as `PATCH /bases/{id}`:
 * changes a proposal not approved yet; a rejected one is sent again for review.
 */
export const PATCH = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.BASE_PROPOSALS, clanAccess: true },
  async ({ request, params, user }) => {
    const input = await parseBaseForm(request, updateBaseSchema, { imageRequired: false });
    const { proposal, resubmitted } = await updateMyProposal(user.id, params.id, input);
    return {
      result: proposal,
      messages: [
        {
          key: resubmitted ? MessageKey.BASE_PROPOSAL_RESUBMITTED : MessageKey.BASE_PROPOSAL_UPDATED,
        },
      ],
    };
  },
);

/** `DELETE /api/v1/base-proposals/{id}` (the author only): withdraws a proposal not approved yet. */
export const DELETE = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.BASE_PROPOSALS, clanAccess: true },
  async ({ params, user }) => {
    await withdrawMyProposal(user.id, params.id);
    return { result: null, messages: [{ key: MessageKey.BASE_PROPOSAL_WITHDRAWN }] };
  },
);

export const OPTIONS = preflight;
