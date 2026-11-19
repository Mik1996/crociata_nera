import sharp from 'sharp';
import { isTelegramConfigured, TelegramApiError, telegramApi } from '@/lib/telegram/telegram-client';
import { imageStore } from '@/modules/bases/base-image.store';
import { DefenseBaseModel, PUBLISHED_BASES } from '@/modules/bases/defense-base.model';
import { authorNameOf, basePostCaption, COPY_BASE_BUTTON } from './base-post-caption';
import { BasePostStatus, TelegramBasePostDocument, TelegramBasePostModel } from './telegram-base-post.model';
import { TelegramChatModel } from './telegram-chat.model';

/**
 * Keeps the Telegram channels of the arsenal in step with the site: every published base has a
 * post in the channel bound to its town hall, with its picture, clan castle, description, author
 * and a button to copy it. A base changed on the site changes its post; a base deleted (or moved
 * to a town hall with another channel) loses it. Nothing here ever blocks the site: failures are
 * saved on the post and tried again later.
 */

/** Pause between two posts sent or changed: channels accept about 20 messages a minute. */
let sendIntervalMs = 3_100;
/** First wait after a failure; it doubles at every failure in a row, up to {@link MAX_RETRY_MS}. */
const FIRST_RETRY_MS = 5 * 60_000;
const MAX_RETRY_MS = 6 * 60 * 60_000;

type PublishedBase = {
  _id: { toString(): string };
  townHallLevel: number;
  layoutUrl: string;
  description: string;
  clanCastleTroops: { name: string; count: number }[];
  imageKey: string;
  createdBy: unknown;
};

/** Telegram asked to slow down: the run stops and the next one goes on. */
class SlowDown extends Error {}

let running: Promise<void> | null = null;
let again = false;

/**
 * Brings the posts in line with the bases, now (or right after the run in progress, which then
 * starts again). Never rejects; a no-op while Telegram is not configured. Called after every change
 * of the arsenal, when a channel is bound, and periodically for the posts that failed.
 */
export function requestBasePostSync(): Promise<void> {
  if (!isTelegramConfigured()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        await syncBasePosts();
      } catch (error) {
        console.error('[telegram] base posts not synced:', (error as Error).message);
        break;
      }
    } while (again);
  })().finally(() => (running = null));
  return running;
}

/** Test helper: no pause between posts. */
export function setTelegramSendInterval(ms: number): void {
  sendIntervalMs = ms;
}

async function syncBasePosts(now = new Date()): Promise<void> {
  const chats = await TelegramChatModel.find({ townHallLevel: { $ne: null }, canPost: true }).lean();
  const channelOf = new Map(chats.map((chat) => [chat.townHallLevel!, chat.chatId]));
  const saved = await DefenseBaseModel.find(PUBLISHED_BASES)
    .select('townHallLevel layoutUrl description clanCastleTroops imageKey createdBy createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  // Bases saved before a field existed lack it (`lean()` applies no defaults).
  const bases: PublishedBase[] = saved.map((base) => ({
    ...base,
    description: base.description ?? '',
    clanCastleTroops: base.clanCastleTroops ?? [],
  }));
  const posts = new Map((await TelegramBasePostModel.find()).map((post) => [post.baseId.toString(), post]));
  const pacer = new Pacer();

  try {
    // Posts of bases no longer in the arsenal (deleted).
    const published = new Set(bases.map((base) => base._id.toString()));
    for (const [baseId, post] of posts) {
      if (published.has(baseId)) continue;
      if (post.messageId === null) {
        // Never reached Telegram: nothing to delete there.
        await post.deleteOne();
        continue;
      }
      if (!due(post, now)) continue;
      await attempt(post, now, post.chatId ?? null, async () => {
        await deleteMessage(post, pacer);
        await post.deleteOne();
      });
    }
    for (const base of bases) {
      const post = posts.get(base._id.toString()) ?? (await newPost(base));
      if (!due(post, now)) continue;
      const channel = channelOf.get(base.townHallLevel) ?? null;
      await attempt(post, now, channel ?? post.chatId ?? null, () => syncPost(base, post, channel, pacer));
    }
  } catch (error) {
    if (!(error instanceof SlowDown)) throw error;
    console.warn('[telegram] slowed down by Telegram: the other posts wait for the next run');
  }
}

/** A post not tried before, or one whose wait after a failure is over. */
function due(post: TelegramBasePostDocument, now: Date): boolean {
  return post.status !== BasePostStatus.FAILED || !post.retryAt || post.retryAt <= now;
}

/** The record of a base never posted: its author is chosen now, once. */
async function newPost(base: PublishedBase): Promise<TelegramBasePostDocument> {
  return new TelegramBasePostModel({
    baseId: base._id,
    townHallLevel: base.townHallLevel,
    status: BasePostStatus.NO_CHANNEL,
    authorName: await authorNameOf(base.createdBy as string),
  });
}

/**
 * Runs a step for a post, saving the failure on it (and when to try again). `chatId` is the channel
 * the step writes in: refused there (403), the channel is marked as closed to the bot.
 */
async function attempt(
  post: TelegramBasePostDocument,
  now: Date,
  chatId: number | null,
  step: () => Promise<void>,
): Promise<void> {
  try {
    await step();
  } catch (error) {
    // Anything else (a bug, a broken image…) fails this base only: the others still go out.
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof TelegramApiError) && !(error instanceof MissingImage)) {
      console.error(`[telegram] base ${post.baseId.toString()} not synced:`, error);
    }
    const failures = (post.failures ?? 0) + 1;
    post.set({
      status: BasePostStatus.FAILED,
      error: message.slice(0, 300),
      failures,
      retryAt: new Date(now.getTime() + Math.min(FIRST_RETRY_MS * 2 ** (failures - 1), MAX_RETRY_MS)),
    });
    await post.save();
    console.warn(`[telegram] base ${post.baseId.toString()}: ${message}`);
    if (error instanceof TelegramApiError && error.status === 403 && chatId !== null) {
      // The bot was removed from the channel or lost the right to post.
      await TelegramChatModel.updateOne({ chatId }, { $set: { canPost: false } });
    }
    if (error instanceof TelegramApiError && error.status === 429) throw new SlowDown();
  }
}

/** Sends, changes, moves or leaves alone the post of a base. */
async function syncPost(
  base: PublishedBase,
  post: TelegramBasePostDocument,
  channel: number | null,
  pacer: Pacer,
): Promise<void> {
  const caption = basePostCaption({ ...base, authorName: post.authorName ?? null });
  const posted = post.chatId !== null && post.messageId !== null;

  if (posted && channel === null) {
    // No channel for the town hall now: the post stays, unless the base moved to another town hall.
    if (post.townHallLevel !== base.townHallLevel) {
      await deleteMessage(post, pacer);
      return markWaiting(post, base);
    }
    if (post.status !== BasePostStatus.SENT) return markSent(post, base, caption, post.chatId!, post.messageId!);
    return;
  }
  if (channel === null) return markWaiting(post, base);

  if (posted && post.chatId !== channel) {
    await deleteMessage(post, pacer);
  } else if (posted) {
    const sameImage = post.imageKey === base.imageKey;
    if (sameImage && post.caption === caption && post.layoutUrl === base.layoutUrl) {
      if (post.status !== BasePostStatus.SENT) return markSent(post, base, caption, channel, post.messageId!);
      return;
    }
    const edited = sameImage
      ? await editCaption(channel, post.messageId!, caption, base.layoutUrl, pacer)
      : await editPhoto(channel, post.messageId!, base, caption, pacer);
    if (edited) return markSent(post, base, caption, channel, post.messageId!);
    // The post was deleted by hand in the channel: sent again below.
  }
  const messageId = await sendPhoto(channel, base, caption, pacer);
  return markSent(post, base, caption, channel, messageId);
}

async function markSent(
  post: TelegramBasePostDocument,
  base: PublishedBase,
  caption: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  post.set({
    status: BasePostStatus.SENT,
    townHallLevel: base.townHallLevel,
    chatId,
    messageId,
    imageKey: base.imageKey,
    caption,
    layoutUrl: base.layoutUrl,
    error: null,
    failures: 0,
    retryAt: null,
  });
  await post.save();
}

async function markWaiting(post: TelegramBasePostDocument, base: PublishedBase): Promise<void> {
  post.set({
    status: BasePostStatus.NO_CHANNEL,
    townHallLevel: base.townHallLevel,
    chatId: null,
    messageId: null,
    imageKey: null,
    caption: null,
    layoutUrl: null,
    error: null,
    failures: 0,
    retryAt: null,
  });
  await post.save();
}

function copyButton(layoutUrl: string): string {
  return JSON.stringify({ inline_keyboard: [[{ text: COPY_BASE_BUTTON, url: layoutUrl }]] });
}

class MissingImage extends Error {}

/** The picture of a base as JPEG (Telegram shows WebP files as stickers, not as photos). */
async function photoOf(base: PublishedBase): Promise<Blob> {
  const image = await imageStore.read(base.imageKey, 'full');
  if (!image) throw new MissingImage(`image ${base.imageKey} not found`);
  const jpeg = await sharp(image.data).jpeg({ quality: 90 }).toBuffer();
  return new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' });
}

async function sendPhoto(chatId: number, base: PublishedBase, caption: string, pacer: Pacer): Promise<number> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', await photoOf(base), 'base.jpg');
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('reply_markup', copyButton(base.layoutUrl));
  await pacer.wait();
  const message = await telegramApi<{ message_id: number }>('sendPhoto', form);
  return message.message_id;
}

/** `false` when the message no longer exists. */
async function editPhoto(chatId: number, messageId: number, base: PublishedBase, caption: string, pacer: Pacer): Promise<boolean> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('message_id', String(messageId));
  form.append('media', JSON.stringify({ type: 'photo', media: 'attach://photo', caption, parse_mode: 'HTML' }));
  form.append('photo', await photoOf(base), 'base.jpg');
  form.append('reply_markup', copyButton(base.layoutUrl));
  await pacer.wait();
  return edited(() => telegramApi('editMessageMedia', form));
}

async function editCaption(chatId: number, messageId: number, caption: string, layoutUrl: string, pacer: Pacer): Promise<boolean> {
  await pacer.wait();
  return edited(() =>
    telegramApi('editMessageCaption', {
      chat_id: chatId,
      message_id: messageId,
      caption,
      parse_mode: 'HTML',
      reply_markup: JSON.parse(copyButton(layoutUrl)),
    }),
  );
}

async function edited(edit: () => Promise<unknown>): Promise<boolean> {
  try {
    await edit();
    return true;
  } catch (error) {
    if (!(error instanceof TelegramApiError) || error.status !== 400) throw error;
    if (/not modified/i.test(error.message)) return true;
    if (/not found|can't be edited/i.test(error.message)) return false;
    throw error;
  }
}

/** Deletes the post of a base; one already gone (deleted by hand) counts as deleted. */
async function deleteMessage(post: TelegramBasePostDocument, pacer: Pacer): Promise<void> {
  if (post.chatId === null || post.messageId === null) return;
  await pacer.wait();
  try {
    await telegramApi('deleteMessage', { chat_id: post.chatId, message_id: post.messageId });
  } catch (error) {
    if (!(error instanceof TelegramApiError) || error.status !== 400) throw error;
  }
  post.set({ chatId: null, messageId: null });
}

/** Spaces out the calls that write in the channels, within one run. */
class Pacer {
  private first = true;

  async wait(): Promise<void> {
    if (!this.first && sendIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, sendIntervalMs));
    this.first = false;
  }
}

/** How the posts stand, for the administration. */
export interface BasePostsSummary {
  sent: number;
  /** Published bases waiting for a channel, by town hall (highest first). */
  waiting: { townHallLevel: number; bases: number }[];
  /** Posts that failed, most recent first. */
  failed: { baseId: string; townHallLevel: number; error: string; retryAt: string | null }[];
  /** Published bases not handled yet (the sync has not run since they were published). */
  pending: number;
}

export async function basePostsSummary(): Promise<BasePostsSummary> {
  const [posts, published] = await Promise.all([
    TelegramBasePostModel.find().select('baseId townHallLevel status error retryAt updatedAt').sort({ updatedAt: -1 }).lean(),
    DefenseBaseModel.find(PUBLISHED_BASES).select('_id').lean(),
  ]);
  const publishedIds = new Set(published.map((base) => base._id.toString()));
  const live = posts.filter((post) => publishedIds.has(post.baseId.toString()));
  const waiting = new Map<number, number>();
  for (const post of live) {
    if (post.status === BasePostStatus.NO_CHANNEL) waiting.set(post.townHallLevel, (waiting.get(post.townHallLevel) ?? 0) + 1);
  }
  return {
    sent: live.filter((post) => post.status === BasePostStatus.SENT).length,
    waiting: [...waiting].sort(([a], [b]) => b - a).map(([townHallLevel, bases]) => ({ townHallLevel, bases })),
    failed: live
      .filter((post) => post.status === BasePostStatus.FAILED)
      .map((post) => ({
        baseId: post.baseId.toString(),
        townHallLevel: post.townHallLevel,
        error: post.error ?? '',
        retryAt: post.retryAt?.toISOString() ?? null,
      })),
    pending: publishedIds.size - live.length,
  };
}

/** Makes the failed posts due now (administrators: "Try again"). */
export async function retryFailedPosts(): Promise<void> {
  await TelegramBasePostModel.updateMany({ status: BasePostStatus.FAILED }, { $set: { retryAt: null } });
}
