import { env } from '../config/env';
import { crusadeClanTags, primaryClanTag } from '../coc/crusade-clans';
import { connectToDatabase } from '../db/mongoose';
import { syncCommendations } from '@/modules/commendations/commendation-sync.service';
import { syncPlayerProfiles } from '@/modules/commendations/player-profile-sync.service';
import { syncCwl } from '@/modules/cwl/cwl-sync.service';
import { syncRaids } from '@/modules/raids/raid-sync.service';
import { syncClanRecords } from '@/modules/records/clan-records.service';
import { syncWars, WarSyncReport } from '@/modules/wars/war-sync.service';

interface SchedulerState {
  started: boolean;
  running: boolean;
  timer: NodeJS.Timeout | null;
  lastReport: WarSyncReport | null;
  nextRunAt: Date | null;
  /** Last read before the end of the Raid Weekend in progress. */
  raidCheckAt: Date | null;
  /** Last read of the donations before the end of the game season. */
  seasonCheckAt: Date | null;
}

// One scheduler per process, even if the module is evaluated again (dev hot reload).
const globalState = globalThis as typeof globalThis & { __warSync?: SchedulerState };
const state: SchedulerState = (globalState.__warSync ??= {
  started: false,
  running: false,
  timer: null,
  lastReport: null,
  nextRunAt: null,
  raidCheckAt: null,
  seasonCheckAt: null,
});

/** Shortest wait between two runs, whatever the end time of the current war. */
const MIN_DELAY_MS = 30_000;

/**
 * Built-in scheduler, started once when the server boots (`src/instrumentation.ts`).
 * Reads the current war every `WAR_SYNC_INTERVAL_MINUTES`, and also wakes up one minute
 * after the end of the current war to catch the final `warEnded` state.
 *
 * Needs a long-running Node server (`next start`, Docker, a VM…). On serverless platforms
 * set `WAR_SYNC_INTERVAL_MINUTES=0` and call `POST /api/v1/cron/war-sync` from a cron job.
 */
export function startWarSyncScheduler(): void {
  if (state.started) return;
  const config = env();
  if (config.WAR_SYNC_INTERVAL_MINUTES === 0) {
    console.info('[war-sync] built-in scheduler disabled (WAR_SYNC_INTERVAL_MINUTES=0)');
    return;
  }
  if (!config.COC_API_TOKEN || !config.CLAN_TAG) {
    console.warn('[war-sync] not started: COC_API_TOKEN and CLAN_TAG must be set (.env.local in development)');
    return;
  }
  state.started = true;
  console.info(`[war-sync] reading the current war of ${config.CLAN_TAG} every ${config.WAR_SYNC_INTERVAL_MINUTES} min`);
  void runAndReschedule();
}

/** Runs a sync now unless one is already running; shared by the scheduler and the cron route. */
export async function runWarSync(): Promise<WarSyncReport | null> {
  if (state.running) return null;
  state.running = true;
  try {
    await connectToDatabase();
    const report = await syncWars();
    state.lastReport = report;
    logReport(report);
    await runOtherClansWarSync(report);
    await runCwlSync();
    await runRaidSync();
    await runRecordSync();
    // Commendations of the periods closed by the syncs above.
    await runCommendationSync();
    // Last: heroes of the members saved above (CWL line-up).
    await runProfileSync();
    return report;
  } finally {
    state.running = false;
  }
}

/** The other clans of the Crusade (not `CLAN_TAG`). */
function otherClanTags(): string[] {
  return crusadeClanTags().filter((tag) => tag !== primaryClanTag());
}

/**
 * Regular wars of the other clans of the Crusade (their commendations and the CWL line-up). The
 * report stays the main clan's, but wakes up for the earliest war end of all the clans.
 */
async function runOtherClansWarSync(report: WarSyncReport): Promise<void> {
  for (const clanTag of otherClanTags()) {
    try {
      const other = await syncWars(new Date(), clanTag);
      if (other.error) console.warn(`[war-sync] ${clanTag}: ${other.error.reason} (${other.error.status}): ${other.error.message}`);
      if (other.nextCheckAt && (!report.nextCheckAt || other.nextCheckAt < report.nextCheckAt)) {
        report.nextCheckAt = other.nextCheckAt;
      }
    } catch (error) {
      console.error(`[war-sync] ${clanTag} run failed:`, error);
    }
  }
}

/** Clan War League group and wars of every clan: a failure here must not stop the regular war sync. */
async function runCwlSync(): Promise<void> {
  for (const clanTag of crusadeClanTags()) {
    try {
      const cwl = await syncCwl(new Date(), clanTag);
      if (cwl.error) console.warn(`[cwl-sync] ${clanTag}: ${cwl.error.reason} (${cwl.error.status}): ${cwl.error.message}`);
      if (cwl.closed.length) console.info(`[cwl-sync] ${clanTag}: seasons closed after the group disappeared: ${cwl.closed.join(', ')}`);
      if (!cwl.error && cwl.season) {
        console.info(`[cwl-sync] ${clanTag}: season=${cwl.season} state=${cwl.state} wars read=${cwl.warsFetched}`);
      }
    } catch (error) {
      console.error(`[cwl-sync] ${clanTag} run failed:`, error);
    }
  }
}

/** Raid Weekends of every clan (members are only listed while the weekend is in progress). */
async function runRaidSync(): Promise<void> {
  let checkAt: Date | null = null;
  for (const clanTag of crusadeClanTags()) {
    try {
      const raids = await syncRaids(new Date(), clanTag);
      const next = raids.nextCheckAt ? new Date(raids.nextCheckAt) : null;
      if (next && (!checkAt || next < checkAt)) checkAt = next;
      if (raids.error) console.warn(`[raid-sync] ${clanTag}: ${raids.error.reason} (${raids.error.status}): ${raids.error.message}`);
    } catch (error) {
      console.error(`[raid-sync] ${clanTag} run failed:`, error);
    }
  }
  state.raidCheckAt = checkAt;
}

/** Clan records: perfect wars of the wars saved above, best values read from the API. */
async function runRecordSync(): Promise<void> {
  try {
    const result = await syncClanRecords();
    if (result.error) console.warn(`[records] ${result.error.reason} (${result.error.status}): ${result.error.message}`);
    if (result.perfectWars.length) console.info(`[records] perfect wars: ${result.perfectWars.join(', ')}`);
    if (result.improved.length) console.info(`[records] new records: ${result.improved.join(', ')}`);
  } catch (error) {
    console.error('[records] run failed:', error);
  }
}

/** Members' data and donations, commendations of the closed periods (saved once, never recomputed). */
async function runCommendationSync(): Promise<void> {
  try {
    const result = await syncCommendations();
    state.seasonCheckAt = result.nextCheckAt ? new Date(result.nextCheckAt) : null;
    if (result.error) console.warn(`[commendations] members not updated: ${result.error.reason} (${result.error.status})`);
    if (result.periodsProcessed.length) {
      console.info(`[commendations] ${result.awards} awarded for ${result.periodsProcessed.join(', ')}`);
    }
  } catch (error) {
    console.error('[commendations] run failed:', error);
  }
}

/** Heroes and equipment of the members, a few profiles per run. */
async function runProfileSync(): Promise<void> {
  try {
    const result = await syncPlayerProfiles();
    if (result.failed) console.warn(`[profiles] ${result.failed} profiles not read`);
  } catch (error) {
    console.error('[profiles] run failed:', error);
  }
}

/** Status for the health check. */
export function warSyncStatus() {
  return {
    scheduler: state.started ? 'running' : 'stopped',
    lastRunAt: state.lastReport?.ranAt ?? null,
    lastError: state.lastReport?.error ?? null,
    currentState: state.lastReport?.currentState ?? null,
    nextRunAt: state.nextRunAt?.toISOString() ?? null,
  };
}

async function runAndReschedule(): Promise<void> {
  let report: WarSyncReport | null = null;
  try {
    report = await runWarSync();
  } catch (error) {
    console.error('[war-sync] run failed:', error);
  }

  const interval = env().WAR_SYNC_INTERVAL_MINUTES * 60_000;
  const untilEnd = report?.nextCheckAt ? new Date(report.nextCheckAt).getTime() - Date.now() : Infinity;
  const untilRaidEnd = state.raidCheckAt ? state.raidCheckAt.getTime() - Date.now() : Infinity;
  const untilSeasonEnd = state.seasonCheckAt ? state.seasonCheckAt.getTime() - Date.now() : Infinity;
  const delay = Math.max(MIN_DELAY_MS, Math.min(interval, untilEnd, untilRaidEnd, untilSeasonEnd));
  state.nextRunAt = new Date(Date.now() + delay);
  state.timer = setTimeout(() => void runAndReschedule(), delay);
  state.timer.unref();
}

function logReport(report: WarSyncReport): void {
  if (report.error) {
    console.warn(`[war-sync] ${report.error.reason} (${report.error.status}): ${report.error.message}`);
    return;
  }
  const parts = [`state=${report.currentState}`];
  if (report.warKey) parts.push(`war=${report.warKey} ${report.outcome}`);
  if (report.finalized.length) parts.push(`closed from last snapshot: ${report.finalized.join(', ')}`);
  if (report.warLogMatched.length) parts.push(`matched with war log: ${report.warLogMatched.join(', ')}`);
  console.info(`[war-sync] ${parts.join(' · ')}`);
}
