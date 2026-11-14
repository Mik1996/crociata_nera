/**
 * Next.js calls `register` once when the server starts. It starts the war sync scheduler and
 * runs the data migrations (Node.js runtime only; not during `next build`).
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

  // Data migrations of the saved documents (no-op once done).
  const { connectToDatabase } = await import('./lib/db/mongoose');
  const { migrateLinkedPlayers } = await import('./modules/auth/user.model');
  const { migrateCwlSeasonIndex } = await import('./modules/cwl/cwl.model');
  connectToDatabase()
    .then(migrateLinkedPlayers)
    .catch((error: unknown) => console.error('[migrations] linked players:', (error as Error).message));
  connectToDatabase()
    .then(migrateCwlSeasonIndex)
    .catch((error: unknown) => console.error('[migrations] CWL season index:', (error as Error).message));
}
