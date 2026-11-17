import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { CWL_SELECTION_TABLE, listSelectionPlayers } from '@/modules/cwl/cwl-selection.table';

/**
 * `GET /api/v1/cwl/selection/players`: the ranking of the CWL line-up, filtered, sorted and paged.
 * Administrators, leaders and co-leaders of the clans of the Crusade only.
 */
export const GET = apiHandler({ apiName: ApiName.TABLES_READ, leaderAccess: true }, async ({ request }) => ({
  result: await listSelectionPlayers(parseTableQuery(request, CWL_SELECTION_TABLE)),
}));

export const OPTIONS = preflight;
