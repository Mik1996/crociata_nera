import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { listMonths } from '@/modules/wars/history.service';

/** `GET /api/v1/history`: months with recorded wars (computed from MongoDB). */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async () => ({ result: await listMonths() }));

export const OPTIONS = preflight;
