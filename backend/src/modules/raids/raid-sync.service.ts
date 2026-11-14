import { z } from 'zod';
import { env } from '@/lib/config/env';
import { CocApiError, fetchRaidSeasons } from '@/lib/coc/coc-client';
import { cocDate } from '@/lib/coc/coc-date';
import { RaidSeasonModel } from './raid.model';

export interface RaidSyncReport {
  /** Weekends created or updated. */
  saved: number;
  /** Start of the weekend in progress, if any. */
  ongoing: string | null;
  /** Read again just before the end of the weekend in progress, to catch the last attacks. */
  nextCheckAt: string | null;
  error: { status: number; reason: string; message: string } | null;
}

/** Weekends read on every run: the one in progress and the last ones (to record their final totals). */
const SEASONS_PER_RUN = 3;
/** The last read happens this long before the end of the weekend. */
const BEFORE_END_MS = 60_000;

const seasonSchema = z
  .object({ state: z.string(), startTime: cocDate, endTime: cocDate, members: z.array(z.unknown()).optional() })
  .passthrough();
const listSchema = z.object({ items: z.array(z.unknown()) });

/**
 * Saves the recent Raid Weekends. For a past weekend the API no longer lists the members: the
 * ones saved while it was in progress are kept, only the final totals are updated. Idempotent.
 * Runs for one clan: the main one (`CLAN_TAG`) unless another clan of the Crusade is given.
 */
export async function syncRaids(now = new Date(), clanTag: string | null = env().CLAN_TAG ?? null): Promise<RaidSyncReport> {
  const report: RaidSyncReport = { saved: 0, ongoing: null, nextCheckAt: null, error: null };
  if (!clanTag) return report;

  try {
    const { items } = listSchema.parse(await fetchRaidSeasons(clanTag, SEASONS_PER_RUN));
    for (const raw of items) {
      const parsed = seasonSchema.safeParse(raw);
      if (!parsed.success) continue;
      const { state, startTime, endTime, members } = parsed.data;
      const item = raw as Record<string, unknown>;

      const doc = await RaidSeasonModel.findOne({ clanTag, startTime });
      const saved = doc?.season as Record<string, unknown> | undefined;
      // Members missing from the API (past weekend): keep the ones already saved.
      const season = members ? item : saved?.['members'] ? { ...item, members: saved['members'] } : item;

      await RaidSeasonModel.updateOne(
        { clanTag, startTime },
        { $set: { endTime, state, season, hasMembers: Boolean(season['members']), lastSyncedAt: now } },
        { upsert: true },
      );
      report.saved++;

      if (state === 'ongoing') {
        report.ongoing = startTime.toISOString();
        const lastRead = endTime.getTime() - BEFORE_END_MS;
        if (lastRead > now.getTime()) report.nextCheckAt = new Date(lastRead).toISOString();
      }
    }
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
}
