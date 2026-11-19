import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { requestBasePostSync, retryFailedPosts } from '@/modules/telegram/base-posts.service';
import { telegramStatus } from '@/modules/telegram/telegram-admin.service';
import { assertConfigured } from '@/modules/telegram/telegram-chats.service';

/**
 * `POST /api/v1/admin/telegram/sync` (ADMIN only): tries the failed posts again now, without waiting
 * for their next attempt. The posts go out in the background (a few seconds apart); the result is
 * the status at the start.
 */
export const POST = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async () => {
  assertConfigured();
  await retryFailedPosts();
  void requestBasePostSync();
  return { result: await telegramStatus(), messages: [{ key: MessageKey.TELEGRAM_SYNC_STARTED }] };
});

export const OPTIONS = preflight;
