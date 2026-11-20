import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseQuery } from '@/lib/validation/parse';
import { languageQuerySchema } from '@/modules/announcements/announcements.schemas';
import { discardAnnouncement } from '@/modules/announcements/announcements.service';

/** `POST /api/v1/admin/announcements/{id}/discard` (ADMIN only): drops a draft without publishing it. */
export const POST = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => ({
    result: await discardAnnouncement(params.id, user.id, parseQuery(request, languageQuerySchema).lang),
    messages: [{ key: MessageKey.ANNOUNCEMENT_DISCARDED }],
  }),
);

export const OPTIONS = preflight;
