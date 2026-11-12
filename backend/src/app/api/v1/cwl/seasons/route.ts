import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listCwlSeasons } from '@/modules/cwl/cwl.service';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(36).default(12) });

/** `GET /api/v1/cwl/seasons`: saved Clan War League seasons, most recent first. */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listCwlSeasons(parseQuery(request, querySchema).limit),
}));

export const OPTIONS = preflight;
