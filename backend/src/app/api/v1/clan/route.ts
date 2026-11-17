import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getMainClan } from '@/modules/clan/clan-live.service';

/** `GET /api/v1/clan`: the clan with its members, as `GET /clans/{tag}` of the Clash of Clans API. */
export const GET = apiHandler({ apiName: ApiName.COC_READ, clanAccess: true }, async () => ({
  result: await getMainClan(),
}));

export const OPTIONS = preflight;
