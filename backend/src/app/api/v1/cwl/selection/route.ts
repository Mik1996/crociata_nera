import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { userHasChiefAccess, userHasLeaderAccess } from '@/modules/access/clan-access.service';
import { selectionQuerySchema } from '@/modules/cwl/cwl-selection.schemas';
import { getCwlSelection } from '@/modules/cwl/cwl-selection.service';

/**
 * `GET /api/v1/cwl/selection?season=YYYY-MM`: the selection of a season for the Clan War League
 * line-up (15 starters and 3 reserves), the open one by default: live ranking while open, frozen
 * once closed. Every member of the clans of the Crusade reads it; `permissions` tells the page what
 * the caller may do besides reading (decide: administrators and the leader of Crociata Nera; export:
 * administrators, leaders and co-leaders).
 */
export const GET = apiHandler<object, unknown, true>(
  { apiName: ApiName.WARS_READ, clanAccess: true },
  async ({ request, user }) => {
    const { season } = parseQuery(request, selectionQuerySchema);
    const [selection, manage, exportLineup] = await Promise.all([
      getCwlSelection(season),
      userHasChiefAccess(user.id),
      userHasLeaderAccess(user.id),
    ]);
    return { result: { ...selection, permissions: { manage, export: exportLineup } } };
  },
);

export const OPTIONS = preflight;
