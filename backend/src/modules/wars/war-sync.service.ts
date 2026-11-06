import { env } from '@/lib/config/env';
import { CocApiError, fetchCurrentWar, fetchWarLog } from '@/lib/coc/coc-client';
import { WarModel } from './war.model';
import { cocWarLogSchema, cocWarSchema, CocWarLogEntry } from './wars.schemas';
import { buildWarKey, computeResult, SaveOutcome, upsertWarSnapshot } from './wars.service';

/** Outcome of one synchronisation run (also exposed by the health check and the cron route). */
export interface WarSyncReport {
  ranAt: string;
  /** `currentwar` state; `notInWar` also covers Clan War League days. */
  currentState: string | null;
  warKey: string | null;
  outcome: SaveOutcome | null;
  /** Wars closed from their last snapshot because `warEnded` was never seen. */
  finalized: string[];
  /** Ended wars checked against the war log in this run. */
  warLogMatched: string[];
  /** Earliest moment worth reading again (shortly after the end of the current war). */
  nextCheckAt: string | null;
  error: { status: number; reason: string; message: string } | null;
}

/** Ended wars are compared with the war log for this long (the log keeps only recent wars). */
const WAR_LOG_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
/** Read again this long after a war's end time, when the API already shows `warEnded`. */
const AFTER_END_DELAY_MS = 60 * 1000;

/**
 * One run of the war sync:
 * 1. reads `currentwar` and saves the snapshot (preparation, battle day or ended);
 * 2. closes wars whose end time has passed but were never seen as `warEnded` (the clan
 *    started a new war before the next read), using their last snapshot;
 * 3. completes ended wars with the war log (final stars, destruction, result, clan XP).
 *
 * Every step is idempotent: running it twice, or from two instances, gives the same data.
 */
export async function syncWars(now = new Date()): Promise<WarSyncReport> {
  const report: WarSyncReport = {
    ranAt: now.toISOString(),
    currentState: null,
    warKey: null,
    outcome: null,
    finalized: [],
    warLogMatched: [],
    nextCheckAt: null,
    error: null,
  };
  const clanTag = env().CLAN_TAG;
  if (!clanTag) {
    report.error = { status: 0, reason: 'config.missingClanTag', message: 'CLAN_TAG is not set' };
    return report;
  }

  try {
    const raw = (await fetchCurrentWar(clanTag)) as { state?: string } | null;
    report.currentState = raw?.state ?? null;

    const parsed = cocWarSchema.safeParse(raw);
    if (parsed.success) {
      const war = parsed.data;
      const { outcome } = await upsertWarSnapshot(war, now);
      report.warKey = buildWarKey(war.preparationStartTime, war.opponent.tag);
      report.outcome = outcome;
      if (war.state !== 'warEnded') {
        report.nextCheckAt = new Date(Math.max(war.endTime.getTime() + AFTER_END_DELAY_MS, now.getTime())).toISOString();
      }
    }

    report.finalized = await finalizeUnseenEndings(report.warKey, now);
    report.warLogMatched = await matchWarLog(clanTag, now);
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    report.error = { status: error.status, reason: error.reason, message: error.message };
  }
  return report;
}

/** Closes wars past their end time that are still stored as preparation/battle day. */
async function finalizeUnseenEndings(currentWarKey: string | null, now: Date): Promise<string[]> {
  const stale = await WarModel.find({
    state: { $ne: 'warEnded' },
    endTime: { $lte: now },
    ...(currentWarKey ? { warKey: { $ne: currentWarKey } } : {}),
  });
  for (const war of stale) {
    war.set({
      state: 'warEnded',
      stateRank: 2,
      result: computeResult(war.clan, war.opponent),
      finalizedFrom: 'lastSnapshot',
      endedAt: war.endTime,
    });
    await war.save();
  }
  return stale.map((war) => war.warKey);
}

/**
 * Compares recent ended wars with the war log. The log has the official final numbers:
 * they replace those of a war closed from its last snapshot, and add the clan XP.
 * A private war log is not an error: the wars simply stay as they are.
 */
async function matchWarLog(clanTag: string, now: Date): Promise<string[]> {
  const pending = await WarModel.find({
    state: 'warEnded',
    warLogMatched: false,
    endTime: { $gte: new Date(now.getTime() - WAR_LOG_LOOKBACK_MS) },
  });
  if (!pending.length) return [];

  let entries: CocWarLogEntry[];
  try {
    entries = cocWarLogSchema.parse(await fetchWarLog(clanTag, 20)).items;
  } catch (error) {
    if (error instanceof CocApiError && error.isPrivateWarLog) return [];
    throw error;
  }

  const matched: string[] = [];
  for (const war of pending) {
    const entry = entries.find(
      (e) => e.opponent.tag === war.opponent.tag && Math.abs(e.endTime.getTime() - war.endTime.getTime()) < 60_000,
    );
    if (!entry) continue;

    const clan = { stars: entry.clan.stars, destructionPercentage: entry.clan.destructionPercentage };
    const opponent = { stars: entry.opponent.stars, destructionPercentage: entry.opponent.destructionPercentage };
    war.set({
      'clan.stars': clan.stars,
      'clan.destructionPercentage': clan.destructionPercentage,
      'clan.expEarned': entry.clan.expEarned ?? null,
      'opponent.stars': opponent.stars,
      'opponent.destructionPercentage': opponent.destructionPercentage,
      ...(entry.clan.attacks !== undefined ? { 'clan.attacks': entry.clan.attacks } : {}),
      result: entry.result ?? computeResult(clan, opponent),
      warLogMatched: true,
    });
    await war.save();
    matched.push(war.warKey);
  }
  return matched;
}
