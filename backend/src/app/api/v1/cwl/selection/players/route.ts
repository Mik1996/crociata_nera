import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { parseQuery } from '@/lib/validation/parse';
import { selectionQuerySchema } from '@/modules/cwl/cwl-selection.schemas';
import { CWL_SELECTION_TABLE, listSelectionPlayers } from '@/modules/cwl/cwl-selection.table';

/**
 * `GET /api/v1/cwl/selection/players?season=YYYY-MM`: the ranking of a selection (the open one by
 * default), filtered, sorted and paged. Administrators, leaders and co-leaders of the clans of the
 * Crusade only.
 */
export const GET = apiHandler({ apiName: ApiName.TABLES_READ, leaderAccess: true }, async ({ request }) => {
  const { season } = parseQuery(request, selectionQuerySchema);
  return { result: await listSelectionPlayers(parseTableQuery(request, CWL_SELECTION_TABLE), season) };
});

export const OPTIONS = preflight;
