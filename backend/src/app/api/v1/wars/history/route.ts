import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { listWarHistory, WAR_HISTORY_TABLE } from '@/modules/wars/war-history.table';

/**
 * `GET /api/v1/wars/history?page&limit&sort&order&<filters>`: the ended wars of the clan (saved
 * ones and war log summaries), filtered, sorted and paged, with the record of every war.
 */
export const GET = apiHandler({ apiName: ApiName.TABLES_READ, clanAccess: true }, async ({ request }) => ({
  result: await listWarHistory(parseTableQuery(request, WAR_HISTORY_TABLE)),
}));

export const OPTIONS = preflight;
