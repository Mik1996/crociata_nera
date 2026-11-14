/**
 * Data group of `ngsw-config.json` holding the clan pages' data, readable only by members:
 * the service worker keeps it for offline use, so it is dropped when the session ends.
 */
export const PRIVATE_DATA_GROUP = 'clan-data';

/**
 * Deletes the service worker caches of {@link PRIVATE_DATA_GROUP} (cached responses and their
 * bookkeeping). Without Cache Storage (tests, old browsers, insecure origins) it does nothing.
 */
export async function clearPrivateOfflineData(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.includes(`:${PRIVATE_DATA_GROUP}:`))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Storage unavailable (private mode, blocked site data): nothing was cached either.
  }
}
