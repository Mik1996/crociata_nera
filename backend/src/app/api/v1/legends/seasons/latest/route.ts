import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { latestLegendSeason } from '@/modules/legends/legend-season.service';

/**
 * `GET /api/v1/legends/seasons/latest`: the last processed Legend League season with the members of
 * the Crusade who ended it among the first 10,000 of the world (`null` before the first one).
 */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, clanAccess: true }, async () => ({
  result: await latestLegendSeason(),
}));

export const OPTIONS = preflight;
