import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { updateAnnouncementSchema } from '@/modules/announcements/announcements.schemas';
import { updateCaption } from '@/modules/announcements/announcements.service';

/**
 * `PATCH /api/v1/admin/announcements/{id}` `{ caption }` (ADMIN only): changes the caption of a draft
 * (`null`: back to the generated one).
 */
export const PATCH = apiHandler<{ id: string }, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params }) => {
    const { caption } = await parseBody(request, updateAnnouncementSchema);
    return { result: await updateCaption(params.id, caption), messages: [{ key: MessageKey.ANNOUNCEMENT_UPDATED }] };
  },
);

export const OPTIONS = preflight;
