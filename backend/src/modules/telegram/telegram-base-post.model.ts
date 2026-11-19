import { HydratedDocument, InferSchemaType, model, models, Model, Schema } from 'mongoose';

/** Where the post of a base stands. */
export enum BasePostStatus {
  /** In the channel of its town hall, up to date. */
  SENT = 'sent',
  /** No channel (able to receive posts) bound to the town hall of the base: waiting for one. */
  NO_CHANNEL = 'noChannel',
  /** Telegram refused it or could not be reached: tried again later. */
  FAILED = 'failed',
}

export const BASE_POST_STATUSES = Object.values(BasePostStatus);

/**
 * The Telegram post of a published base of the arsenal: what was sent, where, and how it went.
 * The site is the source: the post follows the base (sent, changed, moved, deleted).
 */
const telegramBasePostSchema = new Schema(
  {
    baseId: { type: Schema.Types.ObjectId, required: true, unique: true },
    /** Town hall of the base when the post was last sent. */
    townHallLevel: { type: Number, required: true },
    status: { type: String, enum: BASE_POST_STATUSES, required: true },
    /** Chat and message of the post; `null` while not sent. */
    chatId: { type: Number, default: null },
    messageId: { type: Number, default: null },
    /** What the post shows, to tell what changed: image, caption, link of the button. */
    imageKey: { type: String, default: null },
    caption: { type: String, default: null },
    layoutUrl: { type: String, default: null },
    /**
     * In-game name shown as the author, chosen once (when the post is first prepared) and kept,
     * even if the player later changes name or role. `null`: no author line.
     */
    authorName: { type: String, default: null },
    /** Last error from Telegram (status `failed`). */
    error: { type: String, default: null },
    /** Failed attempts in a row (spaces out the next ones). */
    failures: { type: Number, default: 0 },
    /** Earliest next attempt after a failure. */
    retryAt: { type: Date, default: null },
  },
  { collection: 'TelegramBasePosts', timestamps: true, versionKey: false },
);

export type TelegramBasePost = InferSchemaType<typeof telegramBasePostSchema>;
export type TelegramBasePostDocument = HydratedDocument<TelegramBasePost>;

export const TelegramBasePostModel: Model<TelegramBasePost> =
  (models.TelegramBasePost as Model<TelegramBasePost>) ?? model('TelegramBasePost', telegramBasePostSchema);

