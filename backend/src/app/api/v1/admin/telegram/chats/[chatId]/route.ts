import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody, validate } from '@/lib/validation/parse';
import { requestBasePostSync } from '@/modules/telegram/base-posts.service';
import { chatIdParamsSchema, updateChatSchema } from '@/modules/telegram/telegram.schemas';
import { removeChat, updateChat } from '@/modules/telegram/telegram-chats.service';

type Params = z.input<typeof chatIdParamsSchema>;

/**
 * `PATCH /api/v1/admin/telegram/chats/{chatId}` `{ townHallLevel?, locked? }` (ADMIN only): binds
 * the chat to a town hall level (its bases move there, the ones waiting are posted at once) or
 * unbinds it (`null`: its posts are deleted and wait for another channel), and/or locks it.
 */
export const PATCH = apiHandler<Params, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params }) => {
    const { chatId } = validate(chatIdParamsSchema, params);
    const changes = await parseBody(request, updateChatSchema);
    const chat = await updateChat(chatId, changes);
    void requestBasePostSync();
    return { result: chat, messages: [{ key: MessageKey.TELEGRAM_CHAT_UPDATED, params: { name: chat.title } }] };
  },
);

/**
 * `DELETE /api/v1/admin/telegram/chats/{chatId}` (ADMIN only): forgets a chat (not a locked one): its
 * posts are deleted and wait for another channel. It comes back if the bot sees it again.
 */
export const DELETE = apiHandler<Params, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ params }) => {
    const { chatId } = validate(chatIdParamsSchema, params);
    await removeChat(chatId);
    void requestBasePostSync();
    return { result: null, messages: [{ key: MessageKey.TELEGRAM_CHAT_REMOVED }] };
  },
);

export const OPTIONS = preflight;
