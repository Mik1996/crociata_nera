import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listArchive } from '@/modules/wars/wars.service';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(60) });

/**
 * `GET /api/v1/wars/archive?limit=60`: saved wars with members and attacks, in the
 * `currentwar` format of the Clash of Clans API (the frontend history source).
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listArchive(parseQuery(request, querySchema).limit),
}));

export const OPTIONS = preflight;
