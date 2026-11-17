import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { parseQuery } from '@/lib/validation/parse';
import { listRanking, RANKING_TABLE, rankingOptionsSchema } from '@/modules/wars/history.tables';

/** `GET /api/v1/history/{YYYY-MM|all}/ranking`: the ranking of the players of a period, filtered, sorted and paged. */
export const GET = apiHandler<{ period: string }, unknown, true>(
  { apiName: ApiName.TABLES_READ, clanAccess: true },
  async ({ request, params }) => {
    const options = parseQuery(request, rankingOptionsSchema);
    return { result: await listRanking(decodeURIComponent(params.period), options, parseTableQuery(request, RANKING_TABLE)) };
  },
);

export const OPTIONS = preflight;
