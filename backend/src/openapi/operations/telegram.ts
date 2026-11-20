import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { languageQuerySchema, updateAnnouncementSchema } from '@/modules/announcements/announcements.schemas';
import { addChatSchema, updateChatSchema } from '@/modules/telegram/telegram.schemas';
import { Announcement, TelegramChat, TelegramStatus } from '../models/telegram';
import { ApiOperation, requestPart } from '../operation';

const languageQuery = requestPart(languageQuerySchema, {
  lang: {
    description:
      'Language of the generated captions and of the pictures: `it-IT` (default), `en-US` or `es-ES`. A published announcement keeps the language it went out in; a caption written by hand stays as written.',
    example: 'it-IT',
  },
});

const announcementPath = requestPart(z.object({ id: z.string() }), {
  id: { description: 'Announcement id.', example: '6740a1b2c3d4e5f6a7b8c9d0' },
});

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
    summary: 'Bind a Telegram chat to a town hall, make it the announcements chat, or lock it',
    description:
      'Binds the chat to a town hall level: the published bases of that level are posted there (those waiting at once, a few seconds apart); posts of the level in another chat move (deleted there, sent here). `null` unbinds it: its posts are deleted and wait for another channel. A base lives in one chat only. A level goes to one chat only. `purpose: announcements` makes it the announcements chat (one only): it never gets a town hall nor bases (`townHallLevel` must be `null`). `locked` locks the chat: its town hall and purpose cannot change (409) and it cannot be removed, until it is unlocked (the same request may unlock it and change its town hall).',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: chatIdPath,
    body: requestPart(updateChatSchema, {
      townHallLevel: { description: 'Town hall level, or `null` for none. Optional.', example: 18 },
      purpose: { description: '`bases` or `announcements`. Optional.', example: 'bases' },
      locked: { description: 'Locks (`true`) or unlocks (`false`) the chat. Optional; at least one field.', example: true },
    }),
    responses: {
      200: { description: 'The chat. The message has its name in `params.name`.', result: TelegramChat, messages: [K.TELEGRAM_CHAT_UPDATED] },
    },
    errors: {
      404: [K.TELEGRAM_CHAT_NOT_FOUND],
      409: [K.TELEGRAM_TOWN_HALL_TAKEN, K.TELEGRAM_CHAT_LOCKED, K.TELEGRAM_CHAT_NOT_FOR_BASES, K.TELEGRAM_ANNOUNCEMENTS_TAKEN],
    },
  },
  {
    method: 'DELETE',
    path: '/admin/telegram/chats/{chatId}',
    operationId: 'removeTelegramChat',
    tag: 'Admin',
    summary: 'Forget a Telegram chat',
    description:
      'Removes a chat from the list: its posts are deleted from it and wait for another channel of their town hall. A locked chat cannot be removed (409). It comes back if the bot sees it again.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: chatIdPath,
    responses: { 200: { description: 'Chat forgotten.', result: null, messages: [K.TELEGRAM_CHAT_REMOVED] } },
    errors: { 404: [K.TELEGRAM_CHAT_NOT_FOUND], 409: [K.TELEGRAM_CHAT_LOCKED] },
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
  {
    method: 'GET',
    path: '/admin/announcements',
    operationId: 'listAnnouncements',
    tag: 'Admin',
    summary: 'List the Telegram announcements',
    description:
      'The drafts prepared by the backend for every clan of the Crusade (newest first), then the latest 30 announcements published or discarded. A draft is prepared when a month closes (wars, Raid Weekends and commendations of the month), a Clan War League season ends, a game season ends (donations), a record of the clan is beaten (perfect wars at every 25) or a member reaches a league higher than any before (Electro League 31 up to Legend League I, one draft per player) or a member ends a Legend League season in Legend League I among the first 10,000 of the world (trophies, world and country position); its figures follow the data until it is published.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    query: languageQuery,
    responses: { 200: { description: 'The announcements.', result: z.array(Announcement) } },
  },
  {
    method: 'PATCH',
    path: '/admin/announcements/{id}',
    operationId: 'updateAnnouncement',
    tag: 'Admin',
    summary: 'Change the caption of an announcement',
    description:
      'Changes the caption of a draft: plain text where `**text**` is bold, at most 1024 visible characters (Telegram\'s limit). `null` goes back to the generated caption.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    query: languageQuery,
    params: announcementPath,
    body: requestPart(updateAnnouncementSchema, {
      caption: { description: 'New caption, or `null` for the generated one.', example: '🔥 **Nuovo record!**' },
    }),
    responses: { 200: { description: 'The announcement.', result: Announcement, messages: [K.ANNOUNCEMENT_UPDATED] } },
    errors: { 400: [K.CAPTION_IS_TOO_LONG], 404: [K.ANNOUNCEMENT_NOT_FOUND], 409: [K.ANNOUNCEMENT_NOT_DRAFT] },
  },
  {
    method: 'POST',
    path: '/admin/announcements/{id}/publish',
    operationId: 'publishAnnouncement',
    tag: 'Admin',
    summary: 'Publish an announcement',
    description:
      'Posts a draft in the announcements channel, in the language `lang`: its pictures (an album when more than one) with the caption on the first. It is then frozen. On a Telegram failure it stays a draft, with the error (502).',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    query: languageQuery,
    params: announcementPath,
    responses: { 200: { description: 'The announcement, published.', result: Announcement, messages: [K.ANNOUNCEMENT_PUBLISHED] } },
    errors: {
      404: [K.ANNOUNCEMENT_NOT_FOUND],
      409: [K.ANNOUNCEMENT_NOT_DRAFT, K.TELEGRAM_NOT_CONFIGURED, K.TELEGRAM_NO_ANNOUNCEMENTS_CHAT],
      502: [K.TELEGRAM_API_UNAVAILABLE],
    },
  },
  {
    method: 'POST',
    path: '/admin/announcements/{id}/discard',
    operationId: 'discardAnnouncement',
    tag: 'Admin',
    summary: 'Discard an announcement',
    description:
      'Drops a draft without publishing it. A record announcement discarded waits for a better value of the record.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    query: languageQuery,
    params: announcementPath,
    responses: { 200: { description: 'The announcement, discarded.', result: Announcement, messages: [K.ANNOUNCEMENT_DISCARDED] } },
    errors: { 404: [K.ANNOUNCEMENT_NOT_FOUND], 409: [K.ANNOUNCEMENT_NOT_DRAFT] },
  },
  {
    method: 'GET',
    path: '/admin/announcements/{id}/images/{page}',
    operationId: 'getAnnouncementImage',
    tag: 'Admin',
    summary: 'Get a picture of an announcement',
    description:
      'Picture `page` of an announcement as JPEG (1080×1350), as it goes (or went) to Telegram: the iron frame of the site, the crest of the clan, the figures; the commendations on the following pages. Drawn at every request (`Cache-Control: no-store`).',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    query: languageQuery,
    params: requestPart(z.object({ id: z.string(), page: z.string() }), {
      id: { description: 'Announcement id.', example: '6740a1b2c3d4e5f6a7b8c9d0' },
      page: { description: 'Picture, from 1 (`Announcement.pages`).', example: '1' },
    }),
    responses: { 200: { description: 'The picture.', result: null, binary: 'image/jpeg' } },
    errors: { 404: [K.ANNOUNCEMENT_NOT_FOUND, K.NOT_FOUND] },
  },
];
