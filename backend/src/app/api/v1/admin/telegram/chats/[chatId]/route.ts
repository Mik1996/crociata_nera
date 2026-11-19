import { z } from 'zod';
import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody, validate } from '@/lib/validation/parse';
import { requestBasePostSync } from '@/modules/telegram/base-posts.service';
import { chatIdParamsSchema, updateChatSchema } from '@/modules/telegram/telegram.schemas';
import { removeChat, setChatTownHall } from '@/modules/telegram/telegram-chats.service';

type Params = z.input<typeof chatIdParamsSchema>;

/**
 * `PATCH /api/v1/admin/telegram/chats/{chatId}` `{ townHallLevel }` (ADMIN only): binds the chat to
 * a town hall level (its bases are posted there, the ones waiting at once) or unbinds it (`null`:
 * the posts already there stay).
 */
export const PATCH = apiHandler<Params, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ request, params }) => {
    const { chatId } = validate(chatIdParamsSchema, params);
    const { townHallLevel } = await parseBody(request, updateChatSchema);
    const chat = await setChatTownHall(chatId, townHallLevel);
    void requestBasePostSync();
    return { result: chat, messages: [{ key: MessageKey.TELEGRAM_CHAT_UPDATED, params: { name: chat.title } }] };
  },
);

/**
 * `DELETE /api/v1/admin/telegram/chats/{chatId}` (ADMIN only): forgets a chat (its posts stay in
 * Telegram). It comes back if the bot sees it again.
 */
export const DELETE = apiHandler<Params, unknown, true>(
  { apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] },
  async ({ params }) => {
    const { chatId } = validate(chatIdParamsSchema, params);
    await removeChat(chatId);
    return { result: null, messages: [{ key: MessageKey.TELEGRAM_CHAT_REMOVED }] };
  },
);

export const OPTIONS = preflight;
