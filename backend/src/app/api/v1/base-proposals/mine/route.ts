import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { listMyProposals } from '@/modules/bases/base-proposals.service';

/** `GET /api/v1/base-proposals/mine` (members of the clans): the caller's proposals not approved yet. */
export const GET = apiHandler<object, unknown, true>(
  { apiName: ApiName.BASES_READ, clanAccess: true },
  async ({ user }) => ({ result: await listMyProposals(user.id) }),
);

export const OPTIONS = preflight;
