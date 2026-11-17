import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getCurrentWar } from '@/modules/clan/clan-live.service';

/** `GET /api/v1/wars/current`: the clan's war in progress (`currentwar` format); `null` when not at war. */
export const GET = apiHandler({ apiName: ApiName.COC_READ, clanAccess: true }, async () => ({
  result: await getCurrentWar(),
}));

export const OPTIONS = preflight;
