import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { apiHandler } from '@/lib/http/api-handler';
import { MessageKey } from '@/lib/http/message-key';
import { runWarSync } from '@/lib/scheduler/war-sync-scheduler';

/**
 * `POST /api/v1/cron/war-sync` with `Authorization: Bearer <CRON_SECRET>`: runs the war sync
 * once. For deployments without a long-running server (Vercel Cron, GitHub Actions, crontab…).
 * Disabled (404) while `CRON_SECRET` is not set.
 */
export const POST = apiHandler({ database: false }, async ({ request }) => {
  const secret = env().CRON_SECRET;
  if (!secret) throwException(404, MessageKey.NOT_FOUND);

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const given = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throwException(401, MessageKey.UNAUTHORIZED);
  }

  const report = await runWarSync();
  // `null`: a run was already in progress (e.g. the built-in scheduler); nothing to do.
  return { status: report?.error ? 502 : 200, result: report, messages: report?.error ? [{ key: MessageKey.WAR_SYNC_FAILED }] : [] };
});
