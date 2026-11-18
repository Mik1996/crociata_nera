import { connectToDatabase, isDatabaseConnected } from '@/lib/db/mongoose';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { warSyncStatus } from '@/lib/scheduler/war-sync-scheduler';

/**
 * `GET /api/v1/health`: service, database and synchronisation status. 503 (`degraded`) when
 * MongoDB is unreachable, the war sync has not succeeded for a while, or the Clash of Clans API
 * refuses the key. The war sync error only carries Supercell's reason (e.g. `accessDenied.invalidIp`), no secrets.
 */
export const GET = apiHandler({ database: false, apiName: ApiName.HEALTH }, async () => {
  const database = await connectToDatabase()
    .then(() => isDatabaseConnected())
    .catch(() => false);
  const { lastError, issues: syncIssues, jobs, ...warSync } = warSyncStatus();
  const issues = [...(database ? [] : ['databaseDown' as const]), ...syncIssues];
  const healthy = issues.length === 0;
  return {
    status: healthy ? 200 : 503,
    result: {
      status: healthy ? 'ok' : 'degraded',
      issues,
      database: database ? 'up' : 'down',
      warSync: { ...warSync, lastError: lastError ? { status: lastError.status, reason: lastError.reason } : null },
      jobs,
      time: new Date().toISOString(),
    },
  };
});

export const OPTIONS = preflight;
