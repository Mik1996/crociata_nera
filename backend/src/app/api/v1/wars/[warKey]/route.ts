import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getWar } from '@/modules/wars/wars.service';

/** `GET /api/v1/wars/{warKey}`: a saved war with members and attacks. */
export const GET = apiHandler<{ warKey: string }, unknown, true>(
  { apiName: ApiName.WARS_READ, clanAccess: true },
  async ({ params }) => ({ result: await getWar(decodeURIComponent(params.warKey)) }),
);

export const OPTIONS = preflight;
