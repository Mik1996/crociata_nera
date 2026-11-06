/**
 * Next.js calls `register` once when the server starts. It starts the war sync scheduler
 * (Node.js runtime only; not during `next build`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startWarSyncScheduler } = await import('./lib/scheduler/war-sync-scheduler');
  try {
    startWarSyncScheduler();
  } catch (error) {
    // Invalid configuration: the API keeps working, the error is reported on the first request.
    console.error('[war-sync] not started:', (error as Error).message);
  }
}
