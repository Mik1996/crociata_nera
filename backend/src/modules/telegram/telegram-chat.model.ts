import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/** What a chat is for: the bases of a town hall, or the announcements of the clan (never bases). */
export const TelegramChatPurpose = { BASES: 'bases', ANNOUNCEMENTS: 'announcements' } as const;
export type TelegramChatPurpose = (typeof TelegramChatPurpose)[keyof typeof TelegramChatPurpose];
export const TELEGRAM_CHAT_PURPOSES = Object.values(TelegramChatPurpose);

/**
 * A Telegram chat (channel or group) the bot was seen in: found from the updates Telegram sends
 * (the bot added or promoted, a post in a channel where it is an administrator) or added by an
 * administrator of the site. A channel bound to a town hall level receives the bases of that level.
 */
const telegramChatSchema = new Schema(
  {
    chatId: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    /** Public `@username` (without `@`); `null` for private chats. */
    username: { type: String, default: null },
    /** `channel`, `supergroup` or `group`. */
    type: { type: String, required: true },
    /** Status of the bot in the chat: `administrator`, `member`, `left`, `kicked`… */
    botStatus: { type: String, required: true },
    /** The bot may publish there (channels: administrator with the right to post). */
    canPost: { type: Boolean, required: true },
    /** `bases` or `announcements`: one chat only for the announcements, which never get a town hall. */
    purpose: { type: String, enum: TELEGRAM_CHAT_PURPOSES, default: TelegramChatPurpose.BASES },
    /** Town hall level whose bases go to this chat; `null`: none. Unique among the chats. */
    townHallLevel: { type: Number, default: null },
    /** Locked by an administrator: its town hall cannot change and it cannot be removed. */
    locked: { type: Boolean, default: false },
  },
  { collection: 'TelegramChats', timestamps: true, versionKey: false },
);
telegramChatSchema.index(
  { townHallLevel: 1 },
  { unique: true, partialFilterExpression: { townHallLevel: { $type: 'number' } } },
);

telegramChatSchema.index(
  { purpose: 1 },
  { unique: true, partialFilterExpression: { purpose: TelegramChatPurpose.ANNOUNCEMENTS } },
);

export type TelegramChat = InferSchemaType<typeof telegramChatSchema>;
export type TelegramChatDocument = HydratedDocument<TelegramChat>;

export const TelegramChatModel: Model<TelegramChat> =
  (models.TelegramChat as Model<TelegramChat>) ?? model('TelegramChat', telegramChatSchema);

export interface PublicTelegramChat {
  chatId: number;
  title: string;
  username: string | null;
  type: string;
  botStatus: string;
  canPost: boolean;
  purpose: TelegramChatPurpose;
  townHallLevel: number | null;
  locked: boolean;
  updatedAt: string;
}

export function toPublicTelegramChat(chat: TelegramChat): PublicTelegramChat {
  return {
    chatId: chat.chatId,
    title: chat.title,
    username: chat.username ?? null,
    type: chat.type,
    botStatus: chat.botStatus,
    canPost: chat.canPost,
    purpose: (chat.purpose ?? TelegramChatPurpose.BASES) as TelegramChatPurpose,
    townHallLevel: chat.townHallLevel ?? null,
    locked: chat.locked ?? false,
    updatedAt: chat.updatedAt.toISOString(),
  };
}
