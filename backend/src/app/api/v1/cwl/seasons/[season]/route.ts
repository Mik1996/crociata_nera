import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getCwlSeason } from '@/modules/cwl/cwl.service';

/** `GET /api/v1/cwl/seasons/{season}`: group and wars of a Clan War League season. */
export const GET = apiHandler<{ season: string }, unknown, true>(
  { apiName: ApiName.WARS_READ, auth: true },
  async ({ params }) => ({ result: await getCwlSeason(decodeURIComponent(params.season)) }),
);

export const OPTIONS = preflight;
