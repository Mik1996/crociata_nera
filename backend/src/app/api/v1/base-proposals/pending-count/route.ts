import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { countPendingProposals } from '@/modules/bases/base-proposals.service';

/** `GET /api/v1/base-proposals/pending-count` (ADMIN only): how many proposals wait for review. */
export const GET = apiHandler<object, unknown, true>(
  { apiName: ApiName.BASES_READ, roles: [UserRole.ADMIN] },
  async () => ({ result: await countPendingProposals() }),
);

export const OPTIONS = preflight;
