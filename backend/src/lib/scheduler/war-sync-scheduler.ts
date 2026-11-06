import { env } from '../config/env';
import { connectToDatabase } from '../db/mongoose';
import { syncWars, WarSyncReport } from '@/modules/wars/war-sync.service';

interface SchedulerState {
  started: boolean;
  running: boolean;
  timer: NodeJS.Timeout | null;
  lastReport: WarSyncReport | null;
  nextRunAt: Date | null;
}

// One scheduler per process, even if the module is evaluated again (dev hot reload).
const globalState = globalThis as typeof globalThis & { __warSync?: SchedulerState };
const state: SchedulerState = (globalState.__warSync ??= {
  started: false,
  running: false,
  timer: null,
  lastReport: null,
  nextRunAt: null,
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
    return report;
  } finally {
    state.running = false;
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
  const delay = Math.max(MIN_DELAY_MS, Math.min(interval, untilEnd));
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
