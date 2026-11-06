import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listWarsQuerySchema } from '@/modules/wars/wars.schemas';
import { listWars } from '@/modules/wars/wars.service';

/**
 * `GET /api/v1/wars?page=1&limit=20&state=warEnded`: war summaries, most recent first.
 * Wars are written only by the backend's war sync (read from the Clash of Clans API).
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, auth: true }, async ({ request }) => ({
  result: await listWars(parseQuery(request, listWarsQuerySchema)),
}));

export const OPTIONS = preflight;
