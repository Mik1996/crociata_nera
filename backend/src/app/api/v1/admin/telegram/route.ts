import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { telegramStatus } from '@/modules/telegram/telegram-admin.service';

/**
 * `GET /api/v1/admin/telegram` (ADMIN only): the bot, the chats it was seen in with their town
 * hall, and how the posts of the bases stand.
 */
export const GET = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async () => ({
  result: await telegramStatus(),
}));

export const OPTIONS = preflight;
