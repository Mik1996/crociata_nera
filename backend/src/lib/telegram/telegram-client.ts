import { env } from '../config/env';

/** A failed call of the Telegram Bot API (`status` 0: Telegram could not be reached). */
export class TelegramApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds to wait before the next call (HTTP 429). */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

/** Longest wait for a Telegram answer (long polling adds its own timeout on top). */
const REQUEST_TIMEOUT_MS = 30_000;

/** `true` when a bot token is configured. */
export function isTelegramConfigured(): boolean {
  return !!env().TELEGRAM_BOT_TOKEN;
}

/**
 * Calls a method of the Telegram Bot API. `params` is sent as JSON, or as `multipart/form-data`
 * when it is a `FormData` (file uploads). The token is part of the URL: it is never logged, and
 * errors carry only Telegram's description.
 */
export async function telegramApi<T>(
  method: string,
  params: Record<string, unknown> | FormData = {},
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_API_BASE_URL: baseUrl } = env();
  if (!token) throw new TelegramApiError(0, 'Telegram is not configured');
  const multipart = params instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/bot${token}/${method}`, {
      method: 'POST',
      headers: multipart ? undefined : { 'content-type': 'application/json' },
      body: multipart ? params : JSON.stringify(params),
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TelegramApiError(0, `Telegram unreachable (${(error as Error).name})`);
  }
  let body: TelegramResponse<T>;
  try {
    body = (await response.json()) as TelegramResponse<T>;
  } catch {
    throw new TelegramApiError(response.status, `unexpected answer from Telegram (HTTP ${response.status})`);
  }
  if (!body.ok) {
    throw new TelegramApiError(
      body.error_code ?? response.status,
      body.description ?? `HTTP ${response.status}`,
      body.parameters?.retry_after ?? null,
    );
  }
  return body.result as T;
}

/** The bot itself (`getMe`), read once. */
export interface TelegramBot {
  id: number;
  username: string;
}

let bot: Promise<TelegramBot> | null = null;

export function telegramBot(): Promise<TelegramBot> {
  bot ??= telegramApi<TelegramBot>('getMe').catch((error: unknown) => {
    bot = null;
    throw error;
  });
  return bot;
}

/** Test helper: forget the bot read with `getMe`. */
export function resetTelegramBot(): void {
  bot = null;
}

/** Escapes text for a message sent with `parse_mode: 'HTML'`. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
