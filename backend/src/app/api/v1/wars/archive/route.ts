import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listArchiveQuerySchema } from '@/modules/wars/wars.schemas';
import { listArchive } from '@/modules/wars/wars.service';

/**
 * `GET /api/v1/wars/archive?limit=60`: saved wars with members and attacks, in the
 * `currentwar` format of the Clash of Clans API (the frontend history source).
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listArchive(parseQuery(request, listArchiveQuerySchema).limit),
}));

export const OPTIONS = preflight;
