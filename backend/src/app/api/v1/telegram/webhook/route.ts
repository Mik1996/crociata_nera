import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey } from '@/lib/http/message-key';
import { receiveUpdate } from '@/modules/telegram/telegram-updates';

/**
 * `POST /api/v1/telegram/webhook`: updates of the bot, sent by Telegram with the header
 * `X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>`. Disabled (404) while the secret is
 * not set. Always answers 200 to a genuine update, even one it cannot read: Telegram would send it
 * again and again otherwise.
 */
export const POST = apiHandler({ apiName: ApiName.TELEGRAM_WEBHOOK }, async ({ request }) => {
  const secret = env().TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !env().TELEGRAM_BOT_TOKEN) throwException(404, MessageKey.NOT_FOUND);

  const given = Buffer.from(request.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throwException(401, MessageKey.UNAUTHORIZED);
  }

  let update: unknown = null;
  try {
    update = await request.json();
  } catch {
    console.warn('[telegram] webhook: body is not JSON');
  }
  if (update) await receiveUpdate(update);
  return { result: null };
});
