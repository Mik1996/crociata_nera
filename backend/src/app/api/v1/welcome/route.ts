import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getWelcome } from '@/modules/clan/clan-live.service';

/**
 * `GET /api/v1/welcome` (public): what the welcome page, the "Join us" page and the header show of
 * the clans of the Crusade (members by name and role only) and the main clan's rankings.
 */
export const GET = apiHandler({ apiName: ApiName.WELCOME, database: false }, async () => ({
  result: await getWelcome(),
}));

export const OPTIONS = preflight;
