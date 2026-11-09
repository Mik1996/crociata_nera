import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getClanRecords } from '@/modules/records/clan-records.service';

/**
 * `GET /api/v1/clan/records`: all-time records of the clan (perfect wars, win streak, highest
 * Clan War League, best positions in the country rankings, most Clan Capital trophies).
 * Public: shown on the welcome page.
 */
export const GET = apiHandler({ apiName: ApiName.CLAN_RECORDS }, async () => ({ result: await getClanRecords() }));

export const OPTIONS = preflight;
