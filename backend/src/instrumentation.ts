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

  const { startTelegram } = await import('./modules/telegram/telegram-updates');
  try {
    startTelegram();
  } catch (error) {
    console.error('[telegram] not started:', (error as Error).message);
  }

  // Data migrations of the saved documents (no-op once done).
  const { connectToDatabase } = await import('./lib/db/mongoose');
  const { migrateLinkedPlayers } = await import('./modules/auth/user.model');
  const { migrateCwlSeasonIndex } = await import('./modules/cwl/cwl.model');
  const { migrateBaseStatus } = await import('./modules/bases/defense-base.model');
  const { migrateSecondaryClanJoins } = await import('./modules/commendations/player.model');
  const { migrateCwlExclusionIndex } = await import('./modules/cwl/cwl-exclusion.model');
  const { migrateSingleCommendations } = await import('./modules/commendations/commendation-sync.service');
  connectToDatabase()
    .then(migrateLinkedPlayers)
    .catch((error: unknown) => console.error('[migrations] linked players:', (error as Error).message));
  connectToDatabase()
    .then(migrateCwlSeasonIndex)
    .catch((error: unknown) => console.error('[migrations] CWL season index:', (error as Error).message));
  connectToDatabase()
    .then(migrateBaseStatus)
    .catch((error: unknown) => console.error('[migrations] defense base status:', (error as Error).message));
  connectToDatabase()
    .then(migrateSecondaryClanJoins)
    .catch((error: unknown) => console.error('[migrations] secondary clan joins:', (error as Error).message));
  connectToDatabase()
    .then(migrateCwlExclusionIndex)
    .catch((error: unknown) => console.error('[migrations] CWL exclusion index:', (error as Error).message));
  connectToDatabase()
    .then(migrateSingleCommendations)
    .catch((error: unknown) => console.error('[migrations] one-off commendations:', (error as Error).message));
}
