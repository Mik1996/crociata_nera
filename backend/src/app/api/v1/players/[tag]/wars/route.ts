import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { validate } from '@/lib/validation/parse';
import { playerTagParam } from '@/modules/auth/auth.schemas';
import { listPlayerWars, PLAYER_WARS_TABLE } from '@/modules/wars/member-stats.table';

/** `GET /api/v1/players/{tag}/wars`: the wars of a player among the clan's last ones, filtered, sorted and paged. */
export const GET = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.TABLES_READ, clanAccess: true },
  async ({ request, params }) => {
    const { tag } = validate(z.object({ tag: playerTagParam }), params);
    return { result: await listPlayerWars(tag, parseTableQuery(request, PLAYER_WARS_TABLE)) };
  },
);

export const OPTIONS = preflight;
