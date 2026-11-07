import { RaidSeasonModel } from './raid.model';

/** Saved Raid Weekends, most recent first, in the format of the Clash of Clans API. */
export async function listRaidSeasons(limit = 10): Promise<Record<string, unknown>[]> {
  const docs = await RaidSeasonModel.find().sort({ startTime: -1 }).limit(limit);
  return docs.map((d) => d.season as Record<string, unknown>);
}
