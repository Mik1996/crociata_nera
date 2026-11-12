import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listRaidSeasonsQuerySchema } from '@/modules/raids/raids.schemas';
import { listRaidSeasons } from '@/modules/raids/raids.service';

/**
 * `GET /api/v1/raids/seasons`: saved Raid Weekends, most recent first, in the format of
 * `GET /clans/{tag}/capitalraidseasons` — with the members also for past weekends.
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listRaidSeasons(parseQuery(request, listRaidSeasonsQuerySchema).limit),
}));

export const OPTIONS = preflight;
