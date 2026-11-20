import { isValidObjectId } from 'mongoose';
import { ApiError, throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { TelegramApiError, telegramApi } from '@/lib/telegram/telegram-client';
import { TelegramChatModel, TelegramChatPurpose } from '@/modules/telegram/telegram-chat.model';
import { assertConfigured } from '@/modules/telegram/telegram-chats.service';
import { captionToHtml, fitCaption, generatedCaption } from './announcement-caption';
import { AnnouncementData, RecordData } from './announcement-data';
import { settleRecord } from './announcement-drafts.service';
import {
  Announcement,
  AnnouncementDocument,
  AnnouncementKind,
  AnnouncementModel,
  AnnouncementState,
} from './announcement.model';
import { announcementSvgs, renderAnnouncementImage, renderAnnouncementImages } from './image/announcement-image';

/** Announcements already published or discarded listed after the drafts. */
const RECENT_DECIDED = 30;

/** An announcement as the administration shows it. */
export interface AnnouncementView {
  id: string;
  kind: AnnouncementKind;
  state: AnnouncementState;
  clanTag: string;
  clanName: string;
  /** Period (`2026-11`) or record name (`warWinStreak`). */
  subject: string;
  /** Records: the new value (league id for `cwlLeague`); `null` for the other kinds. */
  value: number | null;
  /** Records: name of the league reached (`cwlLeague` only). */
  leagueName: string | null;
  /** Caption that goes (or went) with the pictures: `**text**` is bold. */
  caption: string;
  /** The caption was written by an administrator (not the generated one). */
  captionEdited: boolean;
  /** Pictures of the post. */
  pages: number;
  error: string | null;
  /** A publication was interrupted: the post may already be in the channel (check before publishing). */
  interrupted: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Link of the post in a public channel (`null`: private channel or not published). */
  postUrl: string | null;
}

/** The drafts (newest first), then the latest announcements published or discarded. */
export async function listAnnouncements(): Promise<AnnouncementView[]> {
  const [drafts, decided] = await Promise.all([
    AnnouncementModel.find({ state: { $in: [AnnouncementState.DRAFT, AnnouncementState.PUBLISHING] } }).sort({ createdAt: -1 }),
    AnnouncementModel.find({ state: { $in: [AnnouncementState.PUBLISHED, AnnouncementState.DISCARDED] } })
      .sort({ updatedAt: -1 })
      .limit(RECENT_DECIDED),
  ]);
  const usernames = new Map(
    (await TelegramChatModel.find({ username: { $ne: null } }).select('chatId username').lean()).map((c) => [c.chatId, c.username!]),
  );
  return Promise.all([...drafts, ...decided].map((doc) => toView(doc, usernames)));
}

async function toView(doc: AnnouncementDocument, usernames: Map<number, string>): Promise<AnnouncementView> {
  const data = doc.data as AnnouncementData;
  const username = doc.chatId != null ? usernames.get(doc.chatId) : undefined;
  const firstMessage = doc.messageIds[0];
  return {
    id: doc._id.toString(),
    kind: doc.kind as AnnouncementKind,
    state: doc.state as AnnouncementState,
    clanTag: doc.clanTag,
    clanName: data.clanName,
    subject: doc.subject,
    value: data.kind === 'record' ? data.value : null,
    leagueName: data.kind === 'record' ? (data.leagueName ?? null) : null,
    caption: captionOf(doc),
    captionEdited: doc.caption !== null,
    pages: doc.messageIds.length || (await announcementSvgs(data)).length,
    error: doc.error ?? null,
    interrupted: doc.interrupted ?? false,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    postUrl: username && firstMessage ? `https://t.me/${username}/${firstMessage}` : null,
  };
}

function captionOf(doc: Pick<Announcement, 'caption' | 'data'>): string {
  return doc.caption ?? fitCaption(generatedCaption(doc.data as AnnouncementData));
}

async function findAnnouncement(id: string): Promise<AnnouncementDocument> {
  const doc = isValidObjectId(id) ? await AnnouncementModel.findById(id) : null;
  if (!doc) throwException(404, MessageKey.ANNOUNCEMENT_NOT_FOUND);
  return doc;
}

async function findDraft(id: string): Promise<AnnouncementDocument> {
  const doc = await findAnnouncement(id);
  if (doc.state !== AnnouncementState.DRAFT) throwException(409, MessageKey.ANNOUNCEMENT_NOT_DRAFT);
  return doc;
}

async function viewOf(doc: AnnouncementDocument): Promise<AnnouncementView> {
  const usernames = new Map<number, string>();
  if (doc.chatId != null) {
    const chat = await TelegramChatModel.findOne({ chatId: doc.chatId }).select('username').lean();
    if (chat?.username) usernames.set(doc.chatId, chat.username);
  }
  return toView(doc, usernames);
}

/** Changes the caption of a draft; `null` goes back to the generated one. */
export async function updateCaption(id: string, caption: string | null): Promise<AnnouncementView> {
  await findDraft(id);
  // Only while still a draft: a publication started meanwhile keeps the caption it sent.
  const doc = await AnnouncementModel.findOneAndUpdate(
    { _id: id, state: AnnouncementState.DRAFT },
    { $set: { caption } },
    { returnDocument: 'after' },
  );
  if (!doc) throwException(409, MessageKey.ANNOUNCEMENT_NOT_DRAFT);
  return viewOf(doc);
}

/** Picture `page` (0-based) of an announcement as JPEG. */
export async function announcementImage(id: string, page: number): Promise<Buffer> {
  const doc = await findAnnouncement(id);
  const image = await renderAnnouncementImage(doc.data as AnnouncementData, page);
  if (!image) throwException(404, MessageKey.NOT_FOUND);
  return image;
}

/** Drops a draft: it is not published (a record announcement then waits for a better value). */
export async function discardAnnouncement(id: string, userId: string): Promise<AnnouncementView> {
  const doc = await findDraft(id);
  const updated = await AnnouncementModel.findOneAndUpdate(
    { _id: doc._id, state: AnnouncementState.DRAFT },
    { $set: { state: AnnouncementState.DISCARDED, decidedBy: userId, error: null, interrupted: false } },
    { returnDocument: 'after' },
  );
  if (!updated) throwException(409, MessageKey.ANNOUNCEMENT_NOT_DRAFT);
  if (updated.kind === AnnouncementKind.RECORD) await settleRecord(updated.data as RecordData);
  return viewOf(updated);
}

/**
 * Publishes a draft in the announcements channel: its pictures (an album when more than one) with
 * the caption on the first. On failure it stays a draft, with Telegram's error.
 */
export async function publishAnnouncement(id: string, userId: string): Promise<AnnouncementView> {
  assertConfigured();
  await findDraft(id);
  const chat = await TelegramChatModel.findOne({ purpose: TelegramChatPurpose.ANNOUNCEMENTS }).lean();
  if (!chat?.canPost) throwException(409, MessageKey.TELEGRAM_NO_ANNOUNCEMENTS_CHAT);

  // Taken from the drafts first: a second click (or another administrator) cannot post it twice.
  const doc = await AnnouncementModel.findOneAndUpdate(
    { _id: id, state: AnnouncementState.DRAFT },
    { $set: { state: AnnouncementState.PUBLISHING } },
    { returnDocument: 'after' },
  );
  if (!doc) throwException(409, MessageKey.ANNOUNCEMENT_NOT_DRAFT);

  let messageIds: number[];
  try {
    const images = await renderAnnouncementImages(doc.data as AnnouncementData);
    messageIds = await sendPost(chat.chatId, images, captionToHtml(captionOf(doc)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await AnnouncementModel.updateOne({ _id: doc._id }, { $set: { state: AnnouncementState.DRAFT, error: message.slice(0, 300) } });
    if (!(error instanceof TelegramApiError)) throw error;
    console.warn(`[announcements] ${doc.key} not published: ${message}`);
    if (error.status === 403) await TelegramChatModel.updateOne({ chatId: chat.chatId }, { $set: { canPost: false } });
    throw new ApiError(502, [{ key: MessageKey.TELEGRAM_API_UNAVAILABLE }]);
  }

  doc.set({
    state: AnnouncementState.PUBLISHED,
    publishedAt: new Date(),
    chatId: chat.chatId,
    messageIds,
    decidedBy: userId,
    error: null,
    interrupted: false,
  });
  await doc.save();
  if (doc.kind === AnnouncementKind.RECORD) await settleRecord(doc.data as RecordData);
  console.info(`[announcements] ${doc.key} published in chat ${chat.chatId}`);
  return viewOf(doc);
}

const jpeg = (image: Buffer) => new Blob([new Uint8Array(image)], { type: 'image/jpeg' });

/** Sends the pictures with the caption; returns the ids of the messages. */
async function sendPost(chatId: number, images: Buffer[], caption: string): Promise<number[]> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (images.length === 1) {
    form.append('photo', jpeg(images[0]!), 'announcement.jpg');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    const message = await telegramApi<{ message_id: number }>('sendPhoto', form);
    return [message.message_id];
  }
  const media = images.map((_, i) => ({
    type: 'photo',
    media: `attach://page${i}`,
    ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
  }));
  form.append('media', JSON.stringify(media));
  images.forEach((image, i) => form.append(`page${i}`, jpeg(image), `announcement-${i + 1}.jpg`));
  const messages = await telegramApi<{ message_id: number }[]>('sendMediaGroup', form);
  return messages.map((m) => m.message_id);
}
