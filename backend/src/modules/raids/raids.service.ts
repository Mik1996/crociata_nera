import { env } from '@/lib/config/env';
import { RaidSeasonModel } from './raid.model';

/** Saved Raid Weekends of the main clan (`CLAN_TAG`), most recent first, in the format of the Clash of Clans API. */
export async function listRaidSeasons(limit = 10): Promise<Record<string, unknown>[]> {
  const clanTag = env().CLAN_TAG;
  const docs = await RaidSeasonModel.find(clanTag ? { clanTag } : {}).sort({ startTime: -1 }).limit(limit);
  return docs.map((d) => d.season as Record<string, unknown>);
}
