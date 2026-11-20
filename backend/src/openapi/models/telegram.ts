import { z } from 'zod';
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_STATES } from '@/modules/announcements/announcement.model';
import { TELEGRAM_CHAT_PURPOSES } from '@/modules/telegram/telegram-chat.model';
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
    purpose: z
      .enum(TELEGRAM_CHAT_PURPOSES)
      .describe('`bases`: receives the bases of its town hall. `announcements`: the chat of the clan announcements, never bases.'),
    townHallLevel: z.number().int().nullable().describe('Town hall level whose bases are posted in the chat; `null`: none (always for the announcements).'),
    locked: z.boolean().describe('Locked by an administrator: its town hall cannot change and it cannot be removed.'),
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

export const Announcement = model(
  'Announcement',
  'An announcement for the Telegram announcements channel: prepared by the backend, published or discarded by an administrator.',
  z.strictObject({
    id: z.string().describe('Announcement id.'),
    kind: z
      .enum(ANNOUNCEMENT_KINDS)
      .describe('`month`: wars, Raid Weekends and commendations of a month. `cwl`: a Clan War League season. `donations`: a game season. `record`: a new record of the clan.'),
    state: z
      .enum(ANNOUNCEMENT_STATES)
      .describe('`draft` (its figures follow the data until published), `publishing`, `published` (frozen) or `discarded`.'),
    clanTag: z.string().describe('Clan of the Crusade the announcement is about.'),
    clanName: z.string().describe('Name of the clan.'),
    subject: z.string().describe('Period (`YYYY-MM`) or record name (`perfectWars`, `warWinStreak`, `cwlLeague`, `localRank`, `localCapitalRank`, `capitalPoints`).'),
    value: z.number().nullable().describe('Records: the new value (league id for `cwlLeague`, position for the rankings); `null` for the other kinds.'),
    leagueName: z.string().nullable().describe('Records `cwlLeague`: the league reached; otherwise `null`.'),
    caption: z.string().describe('Caption of the post (`**text**` is bold): the one written by an administrator, or the generated one.'),
    captionEdited: z.boolean().describe('The caption was written by an administrator.'),
    pages: z.number().int().describe('Pictures of the post (an album when more than one).'),
    error: z.string().nullable().describe('Last failure of a publication (Telegram\'s words).'),
    interrupted: z
      .boolean()
      .describe('A publication was interrupted (no answer saved within 10 minutes): the post may already be in the channel, check it before publishing again.'),
    createdAt: dateTime('When the draft was prepared.'),
    updatedAt: dateTime('Last change.'),
    publishedAt: nullableDateTime('When it was published.'),
    postUrl: z.string().nullable().describe('Link of the post in a public channel; `null` otherwise.'),
  }),
);
