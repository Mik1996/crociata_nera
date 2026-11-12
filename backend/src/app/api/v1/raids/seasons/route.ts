import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listRaidSeasons } from '@/modules/raids/raids.service';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(52).default(10) });

/**
 * `GET /api/v1/raids/seasons`: saved Raid Weekends, most recent first, in the format of
 * `GET /clans/{tag}/capitalraidseasons` — with the members also for past weekends.
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listRaidSeasons(parseQuery(request, querySchema).limit),
}));

export const OPTIONS = preflight;
