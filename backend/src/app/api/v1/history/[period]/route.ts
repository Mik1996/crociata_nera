import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getPeriod } from '@/modules/wars/history.service';

/** `GET /api/v1/history/{YYYY-MM|all}`: wars and player ranking of a period. */
export const GET = apiHandler<{ period: string }, unknown, true>(
  { apiName: ApiName.WARS_READ, clanAccess: true },
  async ({ params }) => ({ result: await getPeriod(decodeURIComponent(params.period)) }),
);

export const OPTIONS = preflight;
