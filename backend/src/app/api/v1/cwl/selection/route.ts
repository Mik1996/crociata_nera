import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getCwlSelection } from '@/modules/cwl/cwl-selection.service';

/**
 * `GET /api/v1/cwl/selection`: ranking of the clan members for the Clan War League line-up (15
 * starters and 3 reserves). Administrators, leaders and co-leaders of the clans of the Crusade only.
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, leaderAccess: true }, async () => ({
  result: await getCwlSelection(),
}));

export const OPTIONS = preflight;
