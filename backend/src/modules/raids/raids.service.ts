import { CocApiError } from '@/lib/coc/coc-client';
import { liveRaidSeasons } from '@/lib/coc/live-coc';
import { env } from '@/lib/config/env';
import { RaidSeasonModel } from './raid.model';

/**
 * Saved Raid Weekends of the main clan (`CLAN_TAG`), most recent first, in the format of the Clash
 * of Clans API. With none saved yet (new installation), the weekends the API lists (it has the
 * members of the one in progress only); none when it cannot be read either.
 */
export async function listRaidSeasons(limit = 10): Promise<Record<string, unknown>[]> {
  const clanTag = env().CLAN_TAG;
  const docs = await RaidSeasonModel.find(clanTag ? { clanTag } : {}).sort({ startTime: -1 }).limit(limit);
  if (docs.length || !clanTag) return docs.map((d) => d.season as Record<string, unknown>);
  try {
    return await liveRaidSeasons(clanTag, limit);
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    return [];
  }
}
