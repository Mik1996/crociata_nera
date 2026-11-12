import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listCwlSeasonsQuerySchema } from '@/modules/cwl/cwl.schemas';
import { listCwlSeasons } from '@/modules/cwl/cwl.service';

/** `GET /api/v1/cwl/seasons`: saved Clan War League seasons, most recent first. */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listCwlSeasons(parseQuery(request, listCwlSeasonsQuerySchema).limit),
}));

export const OPTIONS = preflight;
