import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { addChatSchema, updateChatSchema } from '@/modules/telegram/telegram.schemas';
import { TelegramChat, TelegramStatus } from '../models/telegram';
import { ApiOperation, requestPart } from '../operation';

const chatIdPath = requestPart(z.object({ chatId: z.string() }), {
  chatId: { description: 'Telegram id of the chat (channels are negative).', example: '-1001234567890' },
});

export const TELEGRAM_OPERATIONS: ApiOperation[] = [
  {
    method: 'POST',
    path: '/telegram/webhook',
    operationId: 'receiveTelegramUpdate',
    tag: 'System',
    summary: 'Receive an update of the Telegram bot',
    description:
      'Called by Telegram for every update of the bot (added to a channel, a post in a channel where it is an administrator…), with the header `X-Telegram-Bot-Api-Secret-Token`. The chats seen are saved for the administration. Disabled (404) while `TELEGRAM_WEBHOOK_SECRET` is not set.',
    access: 'telegram',
    rateLimit: ApiName.TELEGRAM_WEBHOOK,
    responses: { 200: { description: 'Update received.', result: null } },
    errors: { 401: [K.UNAUTHORIZED], 404: [K.NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/admin/telegram',
    operationId: 'getTelegramStatus',
    tag: 'Admin',
    summary: 'Get the Telegram bot status',
    description: 'The bot, the chats it was seen in with their town hall level, and how the posts of the bases stand.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    responses: { 200: { description: 'Status of the bot.', result: TelegramStatus } },
  },
  {
    method: 'POST',
    path: '/admin/telegram/chats',
    operationId: 'addTelegramChat',
    tag: 'Admin',
    summary: 'Add a Telegram chat',
    description:
      'Adds a channel or group by its `@username` or id, reading from Telegram whether the bot can publish there. Needed for channels where the bot was already an administrator before the site started listening (Telegram does not announce them again); a post in the channel works too.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    body: requestPart(addChatSchema, {
      chat: { description: '`@username` of the chat (`@` optional), or its numeric id.', example: '@crociata_basi_th18' },
    }),
    responses: {
      200: { description: 'The chat, as read from Telegram. The message has its name in `params.name`.', result: TelegramChat, messages: [K.TELEGRAM_CHAT_ADDED] },
    },
    errors: { 404: [K.TELEGRAM_CHAT_NOT_FOUND], 409: [K.TELEGRAM_NOT_CONFIGURED], 502: [K.TELEGRAM_API_UNAVAILABLE] },
  },
  {
    method: 'PATCH',
    path: '/admin/telegram/chats/{chatId}',
    operationId: 'updateTelegramChat',
    tag: 'Admin',
    summary: 'Bind a Telegram chat to a town hall',
    description:
      'Binds the chat to a town hall level: the published bases of that level are posted there (those waiting at once, a few seconds apart); posts of the level already in another chat move. `null` unbinds it: the posts already there stay. A level goes to one chat only.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: chatIdPath,
    body: requestPart(updateChatSchema, {
      townHallLevel: { description: 'Town hall level, or `null` for none.', example: 18 },
    }),
    responses: {
      200: { description: 'The chat. The message has its name in `params.name`.', result: TelegramChat, messages: [K.TELEGRAM_CHAT_UPDATED] },
    },
    errors: { 404: [K.TELEGRAM_CHAT_NOT_FOUND], 409: [K.TELEGRAM_TOWN_HALL_TAKEN] },
  },
  {
    method: 'DELETE',
    path: '/admin/telegram/chats/{chatId}',
    operationId: 'removeTelegramChat',
    tag: 'Admin',
    summary: 'Forget a Telegram chat',
    description: 'Removes a chat from the list (its posts stay in Telegram). It comes back if the bot sees it again.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: chatIdPath,
    responses: { 200: { description: 'Chat forgotten.', result: null, messages: [K.TELEGRAM_CHAT_REMOVED] } },
    errors: { 404: [K.TELEGRAM_CHAT_NOT_FOUND] },
  },
  {
    method: 'POST',
    path: '/admin/telegram/sync',
    operationId: 'syncTelegramPosts',
    tag: 'Admin',
    summary: 'Try the Telegram posts again',
    description:
      'Tries the failed posts of the bases again now, without waiting for their next automatic attempt. The posts go out in the background; the result is the status when the run starts.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    responses: { 200: { description: 'Status of the bot.', result: TelegramStatus, messages: [K.TELEGRAM_SYNC_STARTED] } },
    errors: { 409: [K.TELEGRAM_NOT_CONFIGURED] },
  },
];
