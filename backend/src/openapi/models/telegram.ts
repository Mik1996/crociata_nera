import { z } from 'zod';
import { dateTime, model, nullableDateTime } from './common';

export const TelegramChat = model(
  'TelegramChat',
  'A Telegram channel or group the bot was seen in.',
  z.strictObject({
    chatId: z.number().int().describe('Telegram id of the chat (channels and supergroups are negative).'),
    title: z.string().describe('Name of the chat.'),
    username: z.string().nullable().describe('Public `@username` without `@`; `null` for private chats.'),
    type: z.string().describe('`channel`, `supergroup` or `group`.'),
    botStatus: z.string().describe('Status of the bot in the chat: `administrator`, `member`, `left`, `kicked`…'),
    canPost: z.boolean().describe('The bot may publish there (channels: administrator with the right to post).'),
    townHallLevel: z.number().int().nullable().describe('Town hall level whose bases are posted in the chat; `null`: none.'),
    updatedAt: dateTime('Last time the chat was read from Telegram or changed.'),
  }),
);

export const TelegramBasePosts = model(
  'TelegramBasePosts',
  'How the Telegram posts of the published bases stand.',
  z.strictObject({
    sent: z.number().int().describe('Bases posted in their channel, up to date.'),
    waiting: z
      .array(
        z.strictObject({
          townHallLevel: z.number().int().describe('Town hall level without a channel.'),
          bases: z.number().int().describe('Published bases of that level waiting for a channel.'),
        }),
      )
      .describe('Bases waiting for a channel, by town hall (highest first).'),
    failed: z
      .array(
        z.strictObject({
          baseId: z.string().describe('Base id.'),
          townHallLevel: z.number().int().describe('Town hall level of the base.'),
          error: z.string().describe('Error given by Telegram (English, as Telegram writes it).'),
          retryAt: nullableDateTime('Next automatic attempt.'),
        }),
      )
      .describe('Posts Telegram refused or could not receive, most recent first.'),
    pending: z.number().int().describe('Published bases not handled yet (they go out within seconds).'),
  }),
);

export const TelegramStatus = model(
  'TelegramStatus',
  'The Telegram bot of the site and the posts of the base arsenal.',
  z.strictObject({
    configured: z.boolean().describe('A bot token is configured on the server (`TELEGRAM_BOT_TOKEN`).'),
    botUsername: z.string().nullable().describe('`@username` of the bot without `@`; `null` when off or Telegram cannot be reached.'),
    updates: z
      .enum(['webhook', 'polling'])
      .nullable()
      .describe('How the bot receives updates: `webhook` (production) or `polling` (`getUpdates`, development); `null` while off.'),
    chats: z.array(TelegramChat).describe('Chats the bot was seen in: those bound to a town hall first.'),
    basePosts: TelegramBasePosts,
  }),
);
