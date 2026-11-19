import { ApiError, throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { isTelegramConfigured, TelegramApiError, telegramApi, telegramBot } from '@/lib/telegram/telegram-client';
import { PublicTelegramChat, TelegramChatModel, TelegramChatPurpose, toPublicTelegramChat } from './telegram-chat.model';

/** Chat types the bot can publish in (private chats with users are not kept). */
const KEPT_TYPES = new Set(['channel', 'supergroup', 'group']);

interface TelegramChatInfo {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramChatMember {
  status: string;
  can_post_messages?: boolean;
}

/** The part of a Telegram update the site reads: which chat it comes from. */
interface TelegramUpdate {
  update_id?: number;
  my_chat_member?: { chat?: TelegramChatInfo; new_chat_member?: TelegramChatMember };
  channel_post?: { chat?: TelegramChatInfo };
  edited_channel_post?: { chat?: TelegramChatInfo };
  message?: { chat?: TelegramChatInfo };
}

/** Updates the site asks Telegram for (webhook and `getUpdates`). */
export const TELEGRAM_UPDATE_TYPES = ['my_chat_member', 'channel_post', 'message'];

/**
 * Reads an update sent by Telegram: the chat it comes from is saved (or refreshed), so channels
 * show up in the administration as soon as the bot is added to them or something is posted there.
 * Returns the id of the chat refreshed, if any.
 */
export async function handleTelegramUpdate(update: unknown): Promise<number | null> {
  const u = (update ?? {}) as TelegramUpdate;
  const membership = u.my_chat_member;
  const chat = membership?.chat ?? u.channel_post?.chat ?? u.edited_channel_post?.chat ?? u.message?.chat;
  if (!chat || typeof chat.id !== 'number' || !KEPT_TYPES.has(chat.type)) return null;
  if (membership?.new_chat_member) {
    await saveChat(chat, membership.new_chat_member);
    return chat.id;
  }
  await refreshChat(chat.id);
  return chat.id;
}

/**
 * Reads a chat and the bot's rights in it from Telegram and saves them. Throws `TelegramApiError`
 * when Telegram does not know the chat (or the bot is not in it).
 */
export async function refreshChat(chatRef: number | string): Promise<PublicTelegramChat> {
  const chat = await telegramApi<TelegramChatInfo>('getChat', { chat_id: chatRef });
  if (!KEPT_TYPES.has(chat.type)) throw new TelegramApiError(400, 'not a channel or group');
  const { id: botId } = await telegramBot();
  let member: TelegramChatMember;
  try {
    member = await telegramApi<TelegramChatMember>('getChatMember', { chat_id: chat.id, user_id: botId });
  } catch (error) {
    // Channels where the bot is no longer an administrator do not tell who their members are.
    if (!(error instanceof TelegramApiError) || error.status === 0 || error.status === 429) throw error;
    member = { status: 'left' };
  }
  return saveChat(chat, member);
}

async function saveChat(chat: TelegramChatInfo, member: TelegramChatMember): Promise<PublicTelegramChat> {
  const saved = await TelegramChatModel.findOneAndUpdate(
    { chatId: chat.id },
    {
      $set: {
        title: chat.title ?? String(chat.id),
        username: chat.username ?? null,
        type: chat.type,
        botStatus: member.status,
        canPost: canPost(chat.type, member),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return toPublicTelegramChat(saved!);
}

/** Channels: administrators with the right to post. Groups: any member that was not restricted. */
function canPost(type: string, member: TelegramChatMember): boolean {
  if (member.status === 'creator') return true;
  if (type === 'channel') return member.status === 'administrator' && member.can_post_messages !== false;
  return member.status === 'administrator' || member.status === 'member';
}

/** The chats the bot was seen in, those bound to a town hall first (highest first), then by title. */
export async function listChats(): Promise<PublicTelegramChat[]> {
  const chats = await TelegramChatModel.find().lean();
  return chats
    .sort(
      (a, b) =>
        (b.townHallLevel ?? -1) - (a.townHallLevel ?? -1) || a.title.localeCompare(b.title, 'it', { sensitivity: 'base' }),
    )
    .map(toPublicTelegramChat);
}

/**
 * Adds a chat by its `@username` or numeric id (administrators): for channels the bot already
 * administers, which Telegram does not announce again.
 */
export async function addChat(reference: string): Promise<PublicTelegramChat> {
  assertConfigured();
  const chatRef = /^-?\d+$/.test(reference) ? Number(reference) : `@${reference.replace(/^@/, '')}`;
  try {
    return await refreshChat(chatRef);
  } catch (error) {
    throw telegramFailure(error);
  }
}

/**
 * Changes a chat (administrators): binds it to a town hall level (or unbinds it with `null`), makes
 * it the announcements chat (or a chat of bases again), and/or locks or unlocks it. A level goes to
 * one chat only, the announcements too; the announcements chat never has a town hall (409). A locked
 * chat keeps its town hall and purpose (409), unless the same request unlocks it.
 */
export async function updateChat(
  chatId: number,
  changes: { townHallLevel?: number | null; purpose?: TelegramChatPurpose; locked?: boolean },
): Promise<PublicTelegramChat> {
  const chat = await TelegramChatModel.findOne({ chatId });
  if (!chat) throwException(404, MessageKey.TELEGRAM_CHAT_NOT_FOUND);
  const { townHallLevel, purpose, locked } = changes;
  const currentPurpose = chat.purpose ?? TelegramChatPurpose.BASES;
  const moves = townHallLevel !== undefined && townHallLevel !== (chat.townHallLevel ?? null);
  const repurposes = purpose !== undefined && purpose !== currentPurpose;
  if ((moves || repurposes) && chat.locked && locked !== false) {
    throwException(409, [{ key: MessageKey.TELEGRAM_CHAT_LOCKED, params: { name: chat.title } }]);
  }
  const level = townHallLevel !== undefined ? townHallLevel : (chat.townHallLevel ?? null);
  if ((purpose ?? currentPurpose) === TelegramChatPurpose.ANNOUNCEMENTS && level !== null) {
    throwException(409, [{ key: MessageKey.TELEGRAM_CHAT_NOT_FOR_BASES, params: { name: chat.title }, field: 'townHallLevel' }]);
  }
  if (moves && townHallLevel !== null && (await TelegramChatModel.exists({ townHallLevel, chatId: { $ne: chatId } }))) {
    throwException(409, [{ key: MessageKey.TELEGRAM_TOWN_HALL_TAKEN, params: { level: townHallLevel }, field: 'townHallLevel' }]);
  }
  const announcementsTaken = () =>
    throwException(409, [{ key: MessageKey.TELEGRAM_ANNOUNCEMENTS_TAKEN, field: 'purpose' }]);
  if (
    repurposes &&
    purpose === TelegramChatPurpose.ANNOUNCEMENTS &&
    (await TelegramChatModel.exists({ purpose, chatId: { $ne: chatId } }))
  ) {
    announcementsTaken();
  }
  if (townHallLevel !== undefined) chat.townHallLevel = townHallLevel;
  if (purpose !== undefined) chat.purpose = purpose;
  if (locked !== undefined) chat.locked = locked;
  try {
    await chat.save();
  } catch (error) {
    // The same level, or the announcements, given to two chats at the same time (unique indexes).
    const duplicate = error as { code?: number; keyPattern?: Record<string, unknown> };
    if (duplicate.code === 11000) {
      if (duplicate.keyPattern && 'purpose' in duplicate.keyPattern) announcementsTaken();
      throwException(409, [{ key: MessageKey.TELEGRAM_TOWN_HALL_TAKEN, params: { level: townHallLevel! }, field: 'townHallLevel' }]);
    }
    throw error;
  }
  return toPublicTelegramChat(chat);
}

/**
 * Forgets a chat (administrators): its posts are deleted from it and wait for another channel of
 * their town hall. A locked chat cannot be removed (409).
 */
export async function removeChat(chatId: number): Promise<void> {
  const chat = await TelegramChatModel.findOne({ chatId }).select('title locked').lean();
  if (!chat) throwException(404, MessageKey.TELEGRAM_CHAT_NOT_FOUND);
  if (chat.locked) throwException(409, [{ key: MessageKey.TELEGRAM_CHAT_LOCKED, params: { name: chat.title } }]);
  const { deletedCount } = await TelegramChatModel.deleteOne({ chatId, locked: { $ne: true } });
  if (!deletedCount) throwException(404, MessageKey.TELEGRAM_CHAT_NOT_FOUND);
}

export function assertConfigured(): void {
  if (!isTelegramConfigured()) throwException(409, MessageKey.TELEGRAM_NOT_CONFIGURED);
}

/** An error of Telegram as an API error: an unknown chat is 404, anything else 502. */
function telegramFailure(error: unknown): unknown {
  if (!(error instanceof TelegramApiError)) return error;
  console.warn(`[telegram] chat not added: ${error.message}`);
  if (error.status === 400 || error.status === 403) return new ApiError(404, [{ key: MessageKey.TELEGRAM_CHAT_NOT_FOUND }]);
  return new ApiError(502, [{ key: MessageKey.TELEGRAM_API_UNAVAILABLE }]);
}
