import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listDonationSeasons } from '@/modules/donations/donation.service';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(36).default(12) });

/**
 * `GET /api/v1/donations/seasons`: game seasons, most recent first (the one in progress
 * included), with the troops donated by each player as counted by the backend.
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async ({ request }) => ({
  result: await listDonationSeasons(parseQuery(request, querySchema).limit),
}));

export const OPTIONS = preflight;
