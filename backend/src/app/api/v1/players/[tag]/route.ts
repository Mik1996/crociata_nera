import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getPlayer } from '@/modules/commendations/players.service';

/**
 * `GET /api/v1/players/{tag}`: a saved player with the data read from Clash of Clans and the
 * commendations earned (frozen when awarded). The tag is URL-encoded (`%23ABC123`).
 */
export const GET = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.WARS_READ, auth: true },
  async ({ params }) => ({ result: await getPlayer(decodeURIComponent(params.tag)) }),
);

export const OPTIONS = preflight;
