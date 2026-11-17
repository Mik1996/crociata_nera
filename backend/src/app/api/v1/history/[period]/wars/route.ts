import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { listPeriodWars, PERIOD_WARS_TABLE } from '@/modules/wars/history.tables';

/** `GET /api/v1/history/{YYYY-MM|all}/wars`: the wars of a period, filtered, sorted and paged. */
export const GET = apiHandler<{ period: string }, unknown, true>(
  { apiName: ApiName.TABLES_READ, clanAccess: true },
  async ({ request, params }) => ({
    result: await listPeriodWars(decodeURIComponent(params.period), parseTableQuery(request, PERIOD_WARS_TABLE)),
  }),
);

export const OPTIONS = preflight;
