import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { approveProposal } from '@/modules/bases/base-proposals.service';

/**
 * `POST /api/v1/base-proposals/{id}/approve` (ADMIN only): publishes a waiting proposal in the
 * arsenal, recording the administrator and the time.
 */
export const POST = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.BASES_WRITE, roles: [UserRole.ADMIN] },
  async ({ params, user }) => ({
    result: await approveProposal(user.id, params.id),
    messages: [{ key: MessageKey.BASE_APPROVED }],
  }),
);

export const OPTIONS = preflight;
