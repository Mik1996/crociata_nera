import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { listMemberStats, MEMBER_STATS_TABLE } from '@/modules/wars/member-stats.table';

/** `GET /api/v1/players`: the members of the clan with their war statistics, filtered, sorted and paged. */
export const GET = apiHandler({ apiName: ApiName.TABLES_READ, clanAccess: true }, async ({ request }) => ({
  result: await listMemberStats(parseTableQuery(request, MEMBER_STATS_TABLE)),
}));

export const OPTIONS = preflight;
