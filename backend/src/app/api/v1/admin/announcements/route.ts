import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { listAnnouncements } from '@/modules/announcements/announcements.service';

/**
 * `GET /api/v1/admin/announcements` (ADMIN only): the drafts of the Telegram announcements, then the
 * latest ones published or discarded.
 */
export const GET = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async () => ({
  result: await listAnnouncements(),
}));

export const OPTIONS = preflight;
