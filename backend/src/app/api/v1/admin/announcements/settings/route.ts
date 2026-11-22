import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { announcementSettings, updateAnnouncementSettings } from '@/modules/announcements/announcement-settings.service';
import { updateAnnouncementSettingsSchema } from '@/modules/announcements/announcements.schemas';

/** `GET /api/v1/admin/announcements/settings` (ADMIN only): the kinds of announcement that get drafts. */
export const GET = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async () => ({
  result: await announcementSettings(),
}));

/**
 * `PUT /api/v1/admin/announcements/settings` `{ kinds: [{ kind, enabled }] }` (ADMIN only): turns kinds
 * of announcement on or off.
 */
export const PUT = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async ({ request }) => {
  const { kinds } = await parseBody(request, updateAnnouncementSettingsSchema);
  return {
    result: await updateAnnouncementSettings(kinds),
    messages: [{ key: MessageKey.ANNOUNCEMENT_SETTINGS_UPDATED }],
  };
});

export const OPTIONS = preflight;
