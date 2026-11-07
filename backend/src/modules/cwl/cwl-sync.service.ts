import { z } from 'zod';
import { env } from '@/lib/config/env';
import { CocApiError, fetchLeagueGroup, fetchLeagueWar } from '@/lib/coc/coc-client';
import { CwlSeasonModel } from './cwl.model';

/** Outcome of one Clan War League synchronisation. */
export interface CwlSyncReport {
  season: string | null;
  /** Group state, or `notInWar` outside the CWL days. */
  state: string | null;
  /** Wars read from the API in this run (ended wars are read only once). */
  warsFetched: number;
  error: { status: number; reason: string; message: string } | null;
}

/** Placeholder of the API for wars not scheduled yet. */
const UNSCHEDULED = '#0';

const groupSchema = z.object({
  state: z.string(),
  season: z.string(),
  clans: z.array(z.object({ tag: z.string() }).passthrough()),
  rounds: z.array(z.object({ warTags: z.array(z.string()) })),
});

const warSchema = z.object({ state: z.string() }).passthrough();

/**
 * Saves the current Clan War League group and its wars. Outside the CWL days the API answers
 * 404 (or `notInWar`): nothing to do. Wars already ended are not read again; the season is
 * marked `ended` once all its scheduled wars have ended. Idempotent.
 */
export async function syncCwl(now = new Date()): Promise<CwlSyncReport> {
  const report: CwlSyncReport = { season: null, state: null, warsFetched: 0, error: null };
  const clanTag = env().CLAN_TAG;
  if (!clanTag) return report;

  try {
    let raw: unknown;
    try {
      raw = await fetchLeagueGroup(clanTag);
    } catch (error) {
      if (error instanceof CocApiError && error.status === 404) {
        report.state = 'notInWar';
        return report;
      }
      throw error;
    }
    const parsed = groupSchema.safeParse(raw);
    if (!parsed.success || parsed.data.state === 'notInWar' || parsed.data.state === 'groupNotFound') {
      report.state = 'notInWar';
      return report;
    }
    const group = parsed.data;
    // Normalised to `YYYY-MM` (the API may also answer `YYYY-MM-DD`): the key used by the frontend.
    const key = group.season.slice(0, 7);
    report.season = key;

    const season = (await CwlSeasonModel.findOne({ season: key })) ?? new CwlSeasonModel({ season: key });
    const wars = new Map(season.wars.map((w) => [w.warTag, { warTag: w.warTag, state: w.state, war: w.war }]));

    const tags = group.rounds.flatMap((r) => r.warTags).filter((tag) => tag !== UNSCHEDULED);
    for (const tag of tags) {
      if (wars.get(tag)?.state === 'warEnded') continue;
      const war = warSchema.parse(await fetchLeagueWar(tag));
      wars.set(tag, { warTag: tag, state: war.state, war });
      report.warsFetched++;
    }

    const scheduled = group.rounds.every((r) => r.warTags.every((tag) => tag !== UNSCHEDULED));
    const allEnded = tags.length > 0 && tags.every((tag) => wars.get(tag)?.state === 'warEnded');
    const state = group.state === 'ended' || (scheduled && allEnded) ? 'ended' : group.state;
    report.state = state;

    season.set({ clanTag, state, clans: group.clans, rounds: group.rounds, wars: [...wars.values()], lastSyncedAt: now });
    season.markModified('clans');
    season.markModified('wars');
    await season.save();
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
}
