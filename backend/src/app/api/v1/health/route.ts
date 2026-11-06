import { connectToDatabase, isDatabaseConnected } from '@/lib/db/mongoose';
import { apiHandler } from '@/lib/http/api-handler';
import { preflight } from '@/lib/http/cors';
import { warSyncStatus } from '@/lib/scheduler/war-sync-scheduler';

/**
 * `GET /api/v1/health`: service, database and war sync status (503 if MongoDB is unreachable).
 * The war sync error only carries Supercell's reason (e.g. `accessDenied.invalidIp`), no secrets.
 */
export const GET = apiHandler({ database: false }, async () => {
  const database = await connectToDatabase()
    .then(() => isDatabaseConnected())
    .catch(() => false);
  const { lastError, ...warSync } = warSyncStatus();
  return {
    status: database ? 200 : 503,
    result: {
      status: database ? 'ok' : 'degraded',
      database: database ? 'up' : 'down',
      warSync: { ...warSync, lastError: lastError ? { status: lastError.status, reason: lastError.reason } : null },
      time: new Date().toISOString(),
    },
  };
});

export const OPTIONS = preflight;
