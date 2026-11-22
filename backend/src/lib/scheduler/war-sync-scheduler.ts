import { env } from '../config/env';
import { crusadeClanTags, primaryClanTag } from '../coc/crusade-clans';
import { connectToDatabase } from '../db/mongoose';
import { syncCommendations, syncMembers } from '@/modules/commendations/commendation-sync.service';
import { syncPlayerProfiles } from '@/modules/commendations/player-profile-sync.service';
import { syncCwl } from '@/modules/cwl/cwl-sync.service';
import { syncCwlSelections } from '@/modules/cwl/cwl-selection.service';
import { syncRaids } from '@/modules/raids/raid-sync.service';
import { syncAnnouncementDrafts } from '@/modules/announcements/announcement-drafts.service';
import { syncLegendSeason } from '@/modules/legends/legend-season.service';
import { syncClanRecords, syncOtherClanRecords } from '@/modules/records/clan-records.service';
import { syncWars, WarSyncReport } from '@/modules/wars/war-sync.service';

/** Steps of a run whose last success is tracked (health check). */
export const SYNC_JOBS = ['warSync', 'cwl', 'raids', 'donations', 'commendations', 'profiles'] as const;
export type SyncJob = (typeof SYNC_JOBS)[number];

interface JobStatus {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
}

interface SchedulerState {
  started: boolean;
  /** When the built-in scheduler started (`null` while stopped). */
  startedAt: Date | null;
  /** Last success and failure of each step, from the scheduler or the cron route. */
  jobs: Record<SyncJob, JobStatus>;
  running: boolean;
  /** Start of the run in progress (a run stuck for too long no longer blocks the next ones). */
  runStartedAt: Date | null;
  timer: NodeJS.Timeout | null;
  lastReport: WarSyncReport | null;
  nextRunAt: Date | null;
  /** Last read before the end of the Raid Weekend in progress. */
  raidCheckAt: Date | null;
  /** Last read of the donations before the end of the game season. */
  seasonCheckAt: Date | null;
  /** Reading of the country ranking before the end of the Legend League season, and right after it. */
  legendCheckAt: Date | null;
}

// One scheduler per process, even if the module is evaluated again (dev hot reload).
const globalState = globalThis as typeof globalThis & { __warSync?: SchedulerState };
const emptyJobs = () =>
  Object.fromEntries(SYNC_JOBS.map((job) => [job, { lastSuccessAt: null, lastFailureAt: null }])) as Record<SyncJob, JobStatus>;
const state: SchedulerState = (globalState.__warSync ??= {
  started: false,
  startedAt: null,
  jobs: emptyJobs(),
  running: false,
  runStartedAt: null,
  timer: null,
  lastReport: null,
  nextRunAt: null,
  raidCheckAt: null,
  seasonCheckAt: null,
  legendCheckAt: null,
});
// A state created by an older version of this module (dev hot reload).
state.jobs ??= emptyJobs();

/** Records the outcome of a step of the run. */
function track(job: SyncJob, ok: boolean): void {
  state.jobs[job] = { ...state.jobs[job], ...(ok ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }) };
}

/** Shortest wait between two runs, whatever the end time of the current war. */
const MIN_DELAY_MS = 30_000;
/** The scheduler waits this long for a run, then schedules the next one anyway. */
export const RUN_TIMEOUT_MS = 15 * 60_000;
/** A run still in progress after this long is considered stuck: a new run may start. */
const STUCK_RUN_MS = 2 * RUN_TIMEOUT_MS;

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
  state.startedAt = new Date();
  console.info(`[war-sync] reading the current war of ${config.CLAN_TAG} every ${config.WAR_SYNC_INTERVAL_MINUTES} min`);
  void runAndReschedule();
}

/** Runs a sync now unless one is already running; shared by the scheduler and the cron route. */
export async function runWarSync(): Promise<WarSyncReport | null> {
  const startedAt = new Date();
  if (state.running && state.runStartedAt && startedAt.getTime() - state.runStartedAt.getTime() < STUCK_RUN_MS) return null;
  if (state.running) console.error(`[war-sync] run started at ${state.runStartedAt?.toISOString()} looks stuck: starting a new one`);
  state.running = true;
  state.runStartedAt = startedAt;
  try {
    await connectToDatabase();
    // Last read of the donations before the season ends: first, the steps below may take a while.
    const seasonEnding = state.seasonCheckAt !== null && state.seasonCheckAt.getTime() <= startedAt.getTime() + MIN_DELAY_MS;
    if (seasonEnding) await runDonationRead();
    const report = await runMainClanWarSync();
    state.lastReport = report;
    logReport(report);
    await runOtherClansWarSync(report);
    await runCwlSync();
    // A CWL just started closes the selection of its line-up.
    await runSelectionSync();
    await runRaidSync();
    await runRecordSync();
    // Commendations of the periods closed by the syncs above.
    await runCommendationSync();
    // End of the Legend League season: country ranking just before it, results of the members after.
    await runLegendSeasonSync();
    // Drafts of the Telegram announcements: periods closed and records beaten above.
    await runAnnouncementDrafts();
    // Last: heroes of the members saved above (CWL line-up).
    await runProfileSync();
    return report;
  } finally {
    // A stuck run that finishes after a newer one started leaves the flag to the newer run.
    if (state.runStartedAt === startedAt) {
      state.running = false;
      state.runStartedAt = null;
    }
  }
}

/** Regular war of the main clan: an unexpected failure is reported, and the other steps still run. */
async function runMainClanWarSync(): Promise<WarSyncReport> {
  const ranAt = new Date();
  try {
    const report = await syncWars(ranAt);
    track('warSync', !report.error);
    return report;
  } catch (error) {
    console.error('[war-sync] run failed:', error);
    track('warSync', false);
    return {
      ranAt: ranAt.toISOString(),
      currentState: null,
      warKey: null,
      outcome: null,
      finalized: [],
      warLogMatched: [],
      nextCheckAt: null,
      error: { status: 500, reason: 'internal', message: (error as Error)?.message ?? String(error) },
    };
  }
}

/** Members' donations, read just before the game season ends (commendations come later in the run). */
async function runDonationRead(): Promise<void> {
  try {
    await syncMembers(new Date());
    track('donations', true);
  } catch (error) {
    console.error('[commendations] last donation read of the season failed:', error);
    track('donations', false);
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
  let ok = true;
  for (const clanTag of crusadeClanTags()) {
    try {
      const cwl = await syncCwl(new Date(), clanTag);
      if (cwl.error) ok = false;
      if (cwl.error) console.warn(`[cwl-sync] ${clanTag}: ${cwl.error.reason} (${cwl.error.status}): ${cwl.error.message}`);
      if (cwl.closed.length) console.info(`[cwl-sync] ${clanTag}: seasons closed after the group disappeared: ${cwl.closed.join(', ')}`);
      if (!cwl.error && cwl.season) {
        console.info(`[cwl-sync] ${clanTag}: season=${cwl.season} state=${cwl.state} wars read=${cwl.warsFetched}`);
      }
    } catch (error) {
      ok = false;
      console.error(`[cwl-sync] ${clanTag} run failed:`, error);
    }
  }
  track('cwl', ok);
}

/** Selections of the CWL line-up: the one whose CWL started is closed, a selection is always open. */
async function runSelectionSync(): Promise<void> {
  try {
    const closed = await syncCwlSelections();
    if (closed.length) console.info(`[cwl-selection] closed as their CWL started: ${closed.join(', ')}`);
  } catch (error) {
    console.error('[cwl-selection] run failed:', error);
  }
}

/** Raid Weekends of every clan (members are only listed while the weekend is in progress). */
async function runRaidSync(): Promise<void> {
  let checkAt: Date | null = null;
  let ok = true;
  for (const clanTag of crusadeClanTags()) {
    try {
      const raids = await syncRaids(new Date(), clanTag);
      if (raids.error) ok = false;
      const next = raids.nextCheckAt ? new Date(raids.nextCheckAt) : null;
      if (next && (!checkAt || next < checkAt)) checkAt = next;
      if (raids.error) console.warn(`[raid-sync] ${clanTag}: ${raids.error.reason} (${raids.error.status}): ${raids.error.message}`);
    } catch (error) {
      ok = false;
      console.error(`[raid-sync] ${clanTag} run failed:`, error);
    }
  }
  track('raids', ok);
  state.raidCheckAt = checkAt;
}

/** Clan records: perfect wars of the wars saved above, best values read from the API. */
async function runRecordSync(): Promise<void> {
  try {
    const result = await syncClanRecords();
    if (result.error) console.warn(`[records] ${result.error.reason} (${result.error.status}): ${result.error.message}`);
    if (result.perfectWars.length) console.info(`[records] perfect wars: ${result.perfectWars.join(', ')}`);
    if (result.improved.length) console.info(`[records] new records: ${result.improved.join(', ')}`);
    for (const other of await syncOtherClanRecords()) {
      if (other.error) console.warn(`[records] ${other.clanTag}: ${other.error.reason} (${other.error.status})`);
      if (other.improved.length) console.info(`[records] ${other.clanTag} new records: ${other.improved.join(', ')}`);
    }
  } catch (error) {
    console.error('[records] run failed:', error);
  }
}

/** Legend League season: reading before its end, results of the members in Legend League I after. */
async function runLegendSeasonSync(): Promise<void> {
  try {
    const result = await syncLegendSeason();
    state.legendCheckAt = result.nextCheckAt ? new Date(result.nextCheckAt) : null;
    if (result.error) console.warn(`[legends] ${result.error.reason} (${result.error.status}): ${result.error.message}`);
    if (result.processed) console.info(`[legends] season ${result.processed} processed`);
  } catch (error) {
    console.error('[legends] run failed:', error);
  }
}

/** Drafts of the announcements (published by an administrator from the site). */
async function runAnnouncementDrafts(): Promise<void> {
  try {
    const result = await syncAnnouncementDrafts();
    if (result.created.length) console.info(`[announcements] new drafts: ${result.created.join(', ')}`);
    if (result.removed.length) console.info(`[announcements] drafts no longer news, removed: ${result.removed.join(', ')}`);
  } catch (error) {
    console.error('[announcements] drafts not prepared:', error);
  }
}

/** Members' data and donations, commendations of the closed periods (saved once, never recomputed). */
async function runCommendationSync(): Promise<void> {
  try {
    const result = await syncCommendations();
    track('commendations', true);
    // The members' donations are read first: an API error leaves them as they were.
    track('donations', !result.error);
    state.seasonCheckAt = result.nextCheckAt ? new Date(result.nextCheckAt) : null;
    if (result.error) console.warn(`[commendations] members not updated: ${result.error.reason} (${result.error.status})`);
    if (result.periodsProcessed.length) {
      console.info(`[commendations] ${result.awards} awarded for ${result.periodsProcessed.join(', ')}`);
    }
  } catch (error) {
    track('commendations', false);
    console.error('[commendations] run failed:', error);
  }
}

/** Heroes and equipment of the members, a few profiles per run. */
async function runProfileSync(): Promise<void> {
  try {
    const result = await syncPlayerProfiles();
    track('profiles', true);
    if (result.failed) console.warn(`[profiles] ${result.failed} profiles not read`);
  } catch (error) {
    track('profiles', false);
    console.error('[profiles] run failed:', error);
  }
}

/** Reasons for a `degraded` health check, besides the database. */
export type SyncIssue = 'warSyncStale' | 'cocAccessDenied';

/**
 * Status for the health check. Issues:
 * - `warSyncStale`: the built-in scheduler runs, but the war sync has not succeeded for twice its
 *   interval (checked once the scheduler has had that long to run);
 * - `cocAccessDenied`: the last war sync was refused by the Clash of Clans API (`accessDenied*`:
 *   API key revoked or bound to another IP).
 */
export function warSyncStatus(now = new Date()) {
  const issues: SyncIssue[] = [];
  const staleAfter = 2 * env().WAR_SYNC_INTERVAL_MINUTES * 60_000;
  const lastSuccess = state.jobs.warSync.lastSuccessAt;
  if (
    state.started &&
    staleAfter > 0 &&
    state.startedAt &&
    now.getTime() - state.startedAt.getTime() > staleAfter &&
    (!lastSuccess || now.getTime() - lastSuccess.getTime() > staleAfter)
  ) {
    issues.push('warSyncStale');
  }
  if (state.lastReport?.error?.reason.startsWith('accessDenied')) issues.push('cocAccessDenied');
  const iso = (date: Date | null) => date?.toISOString() ?? null;
  return {
    scheduler: state.started ? 'running' : 'stopped',
    lastRunAt: state.lastReport?.ranAt ?? null,
    lastSuccessAt: iso(lastSuccess),
    lastError: state.lastReport?.error ?? null,
    currentState: state.lastReport?.currentState ?? null,
    nextRunAt: iso(state.nextRunAt),
    jobs: Object.fromEntries(
      SYNC_JOBS.map((job) => [job, { lastSuccessAt: iso(state.jobs[job].lastSuccessAt), lastFailureAt: iso(state.jobs[job].lastFailureAt) }]),
    ) as Record<SyncJob, { lastSuccessAt: string | null; lastFailureAt: string | null }>,
    issues,
  };
}

/**
 * Waits for `run` at most `timeoutMs`: `timedOut` if it takes longer (the run goes on in the
 * background), so a hung call never stops the scheduler.
 */
export async function withTimeout<T>(run: Promise<T>, timeoutMs: number): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([run.then((value) => ({ timedOut: false as const, value })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runAndReschedule(): Promise<void> {
  let report: WarSyncReport | null = null;
  try {
    const run = runWarSync();
    // A run that keeps going after the timeout must not report an unhandled rejection.
    run.catch((error: unknown) => console.error('[war-sync] run failed:', error));
    const outcome = await withTimeout(run, RUN_TIMEOUT_MS);
    if (outcome.timedOut) console.error(`[war-sync] run still in progress after ${RUN_TIMEOUT_MS / 60_000} min: scheduling the next one`);
    else report = outcome.value;
  } catch {
    // Logged above.
  }

  const interval = env().WAR_SYNC_INTERVAL_MINUTES * 60_000;
  const untilEnd = report?.nextCheckAt ? new Date(report.nextCheckAt).getTime() - Date.now() : Infinity;
  const untilRaidEnd = state.raidCheckAt ? state.raidCheckAt.getTime() - Date.now() : Infinity;
  const untilSeasonEnd = state.seasonCheckAt ? state.seasonCheckAt.getTime() - Date.now() : Infinity;
  const untilLegendEnd = state.legendCheckAt ? state.legendCheckAt.getTime() - Date.now() : Infinity;
  const delay = Math.max(MIN_DELAY_MS, Math.min(interval, untilEnd, untilRaidEnd, untilSeasonEnd, untilLegendEnd));
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
