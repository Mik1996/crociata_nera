import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { languageQuerySchema } from '@/modules/announcements/announcements.schemas';
import { listAnnouncements } from '@/modules/announcements/announcements.service';

/**
 * `GET /api/v1/admin/announcements?lang=` (ADMIN only): the drafts of the Telegram announcements, then
 * the latest ones published or discarded; generated captions in `lang`.
 */
export const GET = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async ({ request }) => ({
  result: await listAnnouncements(parseQuery(request, languageQuerySchema).lang),
}));

export const OPTIONS = preflight;
