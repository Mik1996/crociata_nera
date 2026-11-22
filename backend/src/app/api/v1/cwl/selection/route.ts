import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { selectionQuerySchema } from '@/modules/cwl/cwl-selection.schemas';
import { getCwlSelection } from '@/modules/cwl/cwl-selection.service';

/**
 * `GET /api/v1/cwl/selection?season=YYYY-MM`: the selection of a season for the Clan War League
 * line-up (15 starters and 3 reserves), the open one by default: live ranking while open, frozen
 * once closed. Administrators, leaders and co-leaders of the clans of the Crusade only.
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, leaderAccess: true }, async ({ request }) => {
  const { season } = parseQuery(request, selectionQuerySchema);
  return { result: await getCwlSelection(season) };
});

export const OPTIONS = preflight;
