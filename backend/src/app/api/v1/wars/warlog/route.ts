import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getWarLog } from '@/modules/clan/clan-live.service';

/** `GET /api/v1/wars/warlog`: the clan's war log, as the Clash of Clans API lists it (empty when private). */
export const GET = apiHandler({ apiName: ApiName.COC_READ, clanAccess: true }, async () => ({
  result: await getWarLog(),
}));

export const OPTIONS = preflight;
