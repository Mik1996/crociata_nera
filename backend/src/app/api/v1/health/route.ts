import { connectToDatabase, isDatabaseConnected } from '@/lib/db/mongoose';
import { apiHandler } from '@/lib/http/api-handler';
import { preflight } from '@/lib/http/cors';

/** `GET /api/v1/health`: service and database status (503 if MongoDB is unreachable). */
export const GET = apiHandler({ database: false }, async () => {
  const database = await connectToDatabase()
    .then(() => isDatabaseConnected())
    .catch(() => false);
  return {
    status: database ? 200 : 503,
    result: { status: database ? 'ok' : 'degraded', database: database ? 'up' : 'down', time: new Date().toISOString() },
  };
});

export const OPTIONS = preflight;
