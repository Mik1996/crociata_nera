import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseQuery } from '@/lib/validation/parse';
import { languageQuerySchema } from '@/modules/announcements/announcements.schemas';
import { publishAnnouncement } from '@/modules/announcements/announcements.service';

/** `POST /api/v1/admin/announcements/{id}/publish` (ADMIN only): posts a draft in the announcements channel. */
export const POST = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params, user }) => ({
    result: await publishAnnouncement(params.id, user.id, parseQuery(request, languageQuerySchema).lang),
    messages: [{ key: MessageKey.ANNOUNCEMENT_PUBLISHED }],
  }),
);

export const OPTIONS = preflight;
