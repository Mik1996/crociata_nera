import { isTelegramConfigured, telegramBot } from '@/lib/telegram/telegram-client';
import { basePostsSummary, BasePostsSummary } from './base-posts.service';
import { PublicTelegramChat } from './telegram-chat.model';
import { listChats } from './telegram-chats.service';
import { telegramUpdatesMode, TelegramUpdatesMode } from './telegram-updates';

/** The Telegram bot as the administration shows it. */
export interface TelegramStatus {
  /** A bot token is configured. */
  configured: boolean;
  /** `@username` of the bot (without `@`); `null` when off or Telegram cannot be reached. */
  botUsername: string | null;
  /** How the bot's updates reach the backend; `null` while off. */
  updates: TelegramUpdatesMode | null;
  chats: PublicTelegramChat[];
  basePosts: BasePostsSummary;
}

export async function telegramStatus(): Promise<TelegramStatus> {
  const configured = isTelegramConfigured();
  const [botUsername, chats, basePosts] = await Promise.all([
    configured ? telegramBot().then((bot) => bot.username, () => null) : null,
    listChats(),
    basePostsSummary(),
  ]);
  return { configured, botUsername, updates: configured ? telegramUpdatesMode() : null, chats, basePosts };
}
