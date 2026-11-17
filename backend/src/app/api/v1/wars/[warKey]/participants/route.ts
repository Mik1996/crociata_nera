import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { listParticipants, PARTICIPANTS_TABLE } from '@/modules/wars/war-participants.table';

/** `GET /api/v1/wars/{warKey}/participants`: the clan's players in a war, filtered, sorted and paged. */
export const GET = apiHandler<{ warKey: string }, unknown, true>(
  { apiName: ApiName.TABLES_READ, clanAccess: true },
  async ({ request, params }) => ({
    result: await listParticipants(decodeURIComponent(params.warKey), parseTableQuery(request, PARTICIPANTS_TABLE)),
  }),
);

export const OPTIONS = preflight;
