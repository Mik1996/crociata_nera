import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { requestBasePostSync } from '@/modules/telegram/base-posts.service';
import { addChatSchema } from '@/modules/telegram/telegram.schemas';
import { addChat } from '@/modules/telegram/telegram-chats.service';

/**
 * `POST /api/v1/admin/telegram/chats` `{ chat }` (ADMIN only): adds a channel or group by its
 * `@username` or id, reading from Telegram whether the bot can publish there.
 */
export const POST = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async ({ request }) => {
  const { chat } = await parseBody(request, addChatSchema);
  const added = await addChat(chat);
  void requestBasePostSync();
  return { result: added, messages: [{ key: MessageKey.TELEGRAM_CHAT_ADDED, params: { name: added.title } }] };
});

export const OPTIONS = preflight;
