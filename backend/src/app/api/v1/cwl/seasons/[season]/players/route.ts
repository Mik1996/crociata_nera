import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { CWL_PLAYERS_TABLE, listCwlPlayers } from '@/modules/cwl/cwl-players.table';

/** `GET /api/v1/cwl/seasons/{season}/players`: the clan's players in a CWL season, filtered, sorted and paged. */
export const GET = apiHandler<{ season: string }, unknown, true>(
  { apiName: ApiName.TABLES_READ, clanAccess: true },
  async ({ request, params }) => ({
    result: await listCwlPlayers(decodeURIComponent(params.season), parseTableQuery(request, CWL_PLAYERS_TABLE)),
  }),
);

export const OPTIONS = preflight;
