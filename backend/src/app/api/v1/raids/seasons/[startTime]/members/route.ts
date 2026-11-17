import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseTableQuery } from '@/lib/table/table-query';
import { validate } from '@/lib/validation/parse';
import { listRaidMembers, RAID_MEMBERS_TABLE } from '@/modules/raids/raid-members.table';

/** `GET /api/v1/raids/seasons/{startTime}/members`: the members who attacked in a Raid Weekend, filtered, sorted and paged. */
export const GET = apiHandler<{ startTime: string }, unknown, true>(
  { apiName: ApiName.TABLES_READ, clanAccess: true },
  async ({ request, params }) => {
    const { startTime } = validate(
      z.object({ startTime: z.string().transform(decodeURIComponent).pipe(z.iso.datetime({ offset: true })) }),
      params,
    );
    return { result: await listRaidMembers(new Date(startTime), parseTableQuery(request, RAID_MEMBERS_TABLE)) };
  },
);

export const OPTIONS = preflight;
