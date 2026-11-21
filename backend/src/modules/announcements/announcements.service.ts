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
import { announcementLink } from './announcement-link';
import { AnnouncementLanguage, announcementTexts, DEFAULT_ANNOUNCEMENT_LANGUAGE } from './announcement-texts';
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
  /** Records: the new value (league id for `cwlLeague`); promotions: the league id; Legend seasons: the trophies. */
  value: number | null;
  /** League reached (English, as the API writes it): records `cwlLeague` and promotions. */
  leagueName: string | null;
  /** Promotions and Legend seasons: the player. */
  playerName: string | null;
  /**
   * Caption that goes with the pictures (`**text**` is bold): the one written by an administrator,
   * or the generated one in the language asked.
   */
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
  /** Language of the caption and the pictures: the one it was published in, else the one asked. */
  language: AnnouncementLanguage;
  /** Link of the post in a public channel (`null`: private channel or not published). */
  postUrl: string | null;
}

/** The drafts (newest first), then the latest announcements published or discarded. */
export async function listAnnouncements(language: AnnouncementLanguage): Promise<AnnouncementView[]> {
  const [drafts, decided] = await Promise.all([
    AnnouncementModel.find({ state: { $in: [AnnouncementState.DRAFT, AnnouncementState.PUBLISHING] } }).sort({ createdAt: -1 }),
    AnnouncementModel.find({ state: { $in: [AnnouncementState.PUBLISHED, AnnouncementState.DISCARDED] } })
      .sort({ updatedAt: -1 })
      .limit(RECENT_DECIDED),
  ]);
  const usernames = new Map(
    (await TelegramChatModel.find({ username: { $ne: null } }).select('chatId username').lean()).map((c) => [c.chatId, c.username!]),
  );
  return Promise.all([...drafts, ...decided].map((doc) => toView(doc, usernames, language)));
}

/** How many drafts wait for an administrator (the badges of the menu). */
export async function countDrafts(): Promise<number> {
  return AnnouncementModel.countDocuments({ state: AnnouncementState.DRAFT });
}

/** The language of an announcement's words: the one it was published in, else the one asked. */
function languageOf(doc: Pick<Announcement, 'state' | 'language'>, asked: AnnouncementLanguage): AnnouncementLanguage {
  if (doc.state !== AnnouncementState.PUBLISHED) return asked;
  return (doc.language as AnnouncementLanguage | null) ?? DEFAULT_ANNOUNCEMENT_LANGUAGE;
}

async function toView(doc: AnnouncementDocument, usernames: Map<number, string>, asked: AnnouncementLanguage): Promise<AnnouncementView> {
  const data = doc.data as AnnouncementData;
  const language = languageOf(doc, asked);
  const username = doc.chatId != null ? usernames.get(doc.chatId) : undefined;
  const firstMessage = doc.messageIds[0];
  return {
    id: doc._id.toString(),
    kind: doc.kind as AnnouncementKind,
    state: doc.state as AnnouncementState,
    clanTag: doc.clanTag,
    clanName: data.clanName,
    subject: doc.subject,
    value:
      data.kind === 'record'
        ? data.value
        : data.kind === 'promotion'
          ? data.league.id
          : data.kind === 'legendSeason'
            ? data.trophies
            : null,
    leagueName:
      data.kind === 'record' ? (data.leagueName ?? null) : data.kind === 'promotion' ? data.league.name : null,
    playerName: data.kind === 'promotion' || data.kind === 'legendSeason' ? data.playerName : null,
    caption: captionOf(doc, language),
    captionEdited: doc.caption !== null,
    pages: doc.messageIds.length || (await announcementSvgs(data, language)).length,
    error: doc.error ?? null,
    interrupted: doc.interrupted ?? false,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    publishedAt: doc.publishedAt?.toISOString() ?? null,
    language,
    postUrl: username && firstMessage ? `https://t.me/${username}/${firstMessage}` : null,
  };
}

function captionOf(doc: Pick<Announcement, 'caption' | 'data'>, language: AnnouncementLanguage): string {
  return doc.caption ?? fitCaption(generatedCaption(doc.data as AnnouncementData, language));
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

async function viewOf(doc: AnnouncementDocument, language: AnnouncementLanguage): Promise<AnnouncementView> {
  const usernames = new Map<number, string>();
  if (doc.chatId != null) {
    const chat = await TelegramChatModel.findOne({ chatId: doc.chatId }).select('username').lean();
    if (chat?.username) usernames.set(doc.chatId, chat.username);
  }
  return toView(doc, usernames, language);
}

/** Changes the caption of a draft; `null` goes back to the generated one. */
export async function updateCaption(id: string, caption: string | null, language: AnnouncementLanguage): Promise<AnnouncementView> {
  await findDraft(id);
  // Only while still a draft: a publication started meanwhile keeps the caption it sent.
  const doc = await AnnouncementModel.findOneAndUpdate(
    { _id: id, state: AnnouncementState.DRAFT },
    { $set: { caption } },
    { returnDocument: 'after' },
  );
  if (!doc) throwException(409, MessageKey.ANNOUNCEMENT_NOT_DRAFT);
  return viewOf(doc, language);
}

/** Picture `page` (0-based) of an announcement as JPEG. */
export async function announcementImage(id: string, page: number, language: AnnouncementLanguage): Promise<Buffer> {
  const doc = await findAnnouncement(id);
  const image = await renderAnnouncementImage(doc.data as AnnouncementData, page, languageOf(doc, language));
  if (!image) throwException(404, MessageKey.NOT_FOUND);
  return image;
}

/** Drops a draft: it is not published (a record announcement then waits for a better value). */
export async function discardAnnouncement(id: string, userId: string, language: AnnouncementLanguage): Promise<AnnouncementView> {
  const doc = await findDraft(id);
  const updated = await AnnouncementModel.findOneAndUpdate(
    { _id: doc._id, state: AnnouncementState.DRAFT },
    { $set: { state: AnnouncementState.DISCARDED, decidedBy: userId, error: null, interrupted: false } },
    { returnDocument: 'after' },
  );
  if (!updated) throwException(409, MessageKey.ANNOUNCEMENT_NOT_DRAFT);
  if (updated.kind === AnnouncementKind.RECORD) await settleRecord(updated.data as RecordData);
  return viewOf(updated, language);
}

/**
 * Publishes a draft in the announcements channel, in a language: its pictures (an album when more
 * than one) with the caption on the first. On failure it stays a draft, with Telegram's error.
 */
export async function publishAnnouncement(id: string, userId: string, language: AnnouncementLanguage): Promise<AnnouncementView> {
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
    const data = doc.data as AnnouncementData;
    const images = await renderAnnouncementImages(data, language);
    const link = announcementLink(data);
    const button = link ? { text: announcementTexts(language).caption.openSite, url: link } : null;
    messageIds = await sendPost(chat.chatId, images, captionToHtml(captionOf(doc, language), link), button);
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
    language,
    decidedBy: userId,
    error: null,
    interrupted: false,
  });
  await doc.save();
  if (doc.kind === AnnouncementKind.RECORD) await settleRecord(doc.data as RecordData);
  console.info(`[announcements] ${doc.key} published in chat ${chat.chatId}`);
  return viewOf(doc, language);
}

const jpeg = (image: Buffer) => new Blob([new Uint8Array(image)], { type: 'image/jpeg' });

/**
 * Sends the pictures with the caption; returns the ids of the messages. A single picture gets the
 * button to the site: Telegram allows no buttons on an album (its caption links the site instead).
 */
async function sendPost(chatId: number, images: Buffer[], caption: string, button: { text: string; url: string } | null): Promise<number[]> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (images.length === 1) {
    form.append('photo', jpeg(images[0]!), 'announcement.jpg');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    if (button) form.append('reply_markup', JSON.stringify({ inline_keyboard: [[button]] }));
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
