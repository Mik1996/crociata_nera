import { env } from '@/lib/config/env';
import { connectToDatabase } from '@/lib/db/mongoose';
import { isTelegramConfigured, TelegramApiError, telegramApi } from '@/lib/telegram/telegram-client';
import { requestBasePostSync } from './base-posts.service';
import { handleTelegramUpdate, TELEGRAM_UPDATE_TYPES } from './telegram-chats.service';

/** How the bot's updates reach the backend. */
export type TelegramUpdatesMode = 'webhook' | 'polling';

/** Every this often the posts that failed are tried again. */
const RETRY_EVERY_MS = 5 * 60_000;
/** Long polling: Telegram holds the request this long when nothing happens. */
const POLL_TIMEOUT_S = 25;

interface TelegramState {
  started: boolean;
  mode: TelegramUpdatesMode | null;
  timer: NodeJS.Timeout | null;
}

// One per process, even if the module is evaluated again (dev hot reload).
const globalState = globalThis as typeof globalThis & { __telegram?: TelegramState };
const state: TelegramState = (globalState.__telegram ??= { started: false, mode: null, timer: null });

/** How updates arrive (`null` while Telegram is off). */
export function telegramUpdatesMode(): TelegramUpdatesMode | null {
  return state.mode;
}

/** Path of the webhook below the public URL of the site. */
export const TELEGRAM_WEBHOOK_PATH = '/api/v1/telegram/webhook';

/**
 * Starts the Telegram bot once, when the server boots (`src/instrumentation.ts`): with
 * `TELEGRAM_WEBHOOK_SECRET` Telegram sends the updates to the webhook (production), otherwise the
 * backend asks for them (`getUpdates`, local development). Either way the base posts are brought in
 * line now and every few minutes.
 */
export function startTelegram(): void {
  if (state.started) return;
  if (!isTelegramConfigured()) {
    console.info('[telegram] off (TELEGRAM_BOT_TOKEN not set)');
    return;
  }
  state.started = true;
  const config = env();
  state.mode = config.TELEGRAM_WEBHOOK_SECRET ? 'webhook' : 'polling';
  if (state.mode === 'webhook') void registerWebhook();
  else void poll();

  const sync = () =>
    connectToDatabase()
      .then(requestBasePostSync)
      .catch((error: unknown) => console.error('[telegram] base posts not synced:', (error as Error).message));
  void sync();
  state.timer = setInterval(sync, RETRY_EVERY_MS);
  state.timer.unref?.();
}

async function registerWebhook(): Promise<void> {
  const config = env();
  const url = `${config.APP_URL ?? config.FRONTEND_URL[0]}${TELEGRAM_WEBHOOK_PATH}`;
  try {
    await telegramApi('setWebhook', {
      url,
      secret_token: config.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: TELEGRAM_UPDATE_TYPES,
    });
    console.info(`[telegram] updates sent by Telegram to ${url}`);
  } catch (error) {
    console.error('[telegram] webhook not registered:', (error as Error).message);
  }
}

/** Asks Telegram for the updates in a loop (long polling). */
async function poll(): Promise<void> {
  try {
    // `getUpdates` is refused while a webhook is set.
    await telegramApi('deleteWebhook');
    console.info('[telegram] reading the updates with getUpdates (no TELEGRAM_WEBHOOK_SECRET)');
  } catch (error) {
    console.warn('[telegram] webhook not removed:', (error as Error).message);
  }
  let offset = 0;
  for (;;) {
    try {
      const updates = await telegramApi<{ update_id: number }[]>(
        'getUpdates',
        { offset, timeout: POLL_TIMEOUT_S, allowed_updates: TELEGRAM_UPDATE_TYPES },
        { timeoutMs: (POLL_TIMEOUT_S + 10) * 1000 },
      );
      if (updates.length) await connectToDatabase();
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        await receiveUpdate(update);
      }
    } catch (error) {
      const retryAfter = error instanceof TelegramApiError ? error.retryAfter : null;
      console.warn('[telegram] getUpdates failed:', (error as Error).message);
      await new Promise((resolve) => setTimeout(resolve, (retryAfter ?? 10) * 1000));
    }
  }
}

/**
 * Reads an update (webhook or `getUpdates`): a chat seen or changed may let the bases waiting for a
 * channel go out. Never throws: a bad update must not stop the next ones.
 */
export async function receiveUpdate(update: unknown): Promise<void> {
  try {
    const chatId = await handleTelegramUpdate(update);
    if (chatId !== null) void requestBasePostSync();
  } catch (error) {
    console.warn('[telegram] update not read:', (error as Error).message);
  }
}
