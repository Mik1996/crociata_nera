import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { countDrafts } from '@/modules/announcements/announcements.service';
import { countPendingProposals } from '@/modules/bases/base-proposals.service';

/**
 * `GET /api/v1/admin/publishing/pending-count` (ADMIN only): what waits for an administrator on the
 * Publications page, the base proposals to review and the announcement drafts.
 */
export const GET = apiHandler<object, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async () => {
    const [bases, announcements] = await Promise.all([countPendingProposals(), countDrafts()]);
    return { result: { bases, announcements } };
  },
);

export const OPTIONS = preflight;
