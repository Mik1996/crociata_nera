import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { rejectProposal } from '@/modules/bases/base-proposals.service';
import { rejectProposalSchema } from '@/modules/bases/bases.schemas';

/**
 * `POST /api/v1/base-proposals/{id}/reject` (ADMIN only), `{ "reason": "…" }`: refuses a waiting
 * proposal; the reason is shown to its author, who can correct it and send it again.
 */
export const POST = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.BASES_WRITE, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => {
    const { reason } = await parseBody(request, rejectProposalSchema);
    return {
      result: await rejectProposal(user.id, params.id, reason),
      messages: [{ key: MessageKey.BASE_REJECTED }],
    };
  },
);

export const OPTIONS = preflight;
