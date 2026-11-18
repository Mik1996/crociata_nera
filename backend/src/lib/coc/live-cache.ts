import { CocApiError } from './coc-client';

/**
 * Short-lived memory of Clash of Clans API responses read on a page request (member list, current
 * war, war log): the tables of a page ask for new rows at every filter or sort change, and the API
 * must not be called each time.
 *
 * - Concurrent requests for a key that is not in memory share one call to the API.
 * - A failed read is remembered for {@link FAILURE_TTL_MS}: meanwhile requests get the same error
 *   without calling the API again (during an outage each call would wait for its timeout).
 * - When the API is unavailable ({@link isOutage}) the last response is served instead of the
 *   error, up to {@link MAX_STALE_MS} after it expired.
 * - Entries that can no longer be served are removed when read and by a sweep at most every
 *   {@link SWEEP_INTERVAL_MS}; at most {@link MAX_ENTRIES} are kept (oldest first out).
 */

/** How long a failed read is answered with the same error. */
export const FAILURE_TTL_MS = 15_000;
/** How long after its expiry a response may still be served while the API is unavailable. */
export const MAX_STALE_MS = 60 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_ENTRIES = 5_000;

interface Entry {
  /** Last successful response, if any. */
  value?: { data: unknown; expiresAt: number };
  /** Last failed read, answered until `until`. */
  failure?: { error: unknown; until: number };
  /** Read in progress, shared by concurrent requests. */
  pending?: Promise<unknown>;
}

const entries = new Map<string, Entry>();
let nextSweepAt = 0;

/**
 * The API cannot answer now (unreachable, timeout, missing token, throttled, server error, IP not
 * allowed), as opposed to a definite answer such as "not found" or "private war log".
 */
export function isOutage(error: unknown): boolean {
  if (!(error instanceof CocApiError)) return false;
  const { status } = error;
  return (
    status === 0 || status === 429 || status >= 500 || (status === 403 && !error.isPrivateWarLog)
  );
}

function staleValue(entry: Entry, now: number): { data: unknown } | null {
  return entry.value && now < entry.value.expiresAt + MAX_STALE_MS ? entry.value : null;
}

/** The entry can still answer a request (or is being read). */
function isAlive(entry: Entry, now: number): boolean {
  return (
    !!entry.pending || (!!entry.failure && now < entry.failure.until) || !!staleValue(entry, now)
  );
}

function sweep(now: number): void {
  if (now < nextSweepAt && entries.size <= MAX_ENTRIES) return;
  nextSweepAt = now + SWEEP_INTERVAL_MS;
  for (const [key, entry] of entries) if (!isAlive(entry, now)) entries.delete(key);
  // Still too many: the oldest entries (first inserted) go first, except reads in progress.
  for (const [key, entry] of entries) {
    if (entries.size <= MAX_ENTRIES) break;
    if (!entry.pending) entries.delete(key);
  }
}

export function cachedRead<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const now = Date.now();
  let entry = entries.get(key);
  if (entry && !isAlive(entry, now)) {
    entries.delete(key);
    entry = undefined;
  }

  if (entry?.value && now < entry.value.expiresAt) return Promise.resolve(entry.value.data as T);
  if (entry?.pending) return entry.pending as Promise<T>;
  if (entry?.failure && now < entry.failure.until) {
    const stale = isOutage(entry.failure.error) ? staleValue(entry, now) : null;
    return stale ? Promise.resolve(stale.data as T) : Promise.reject(entry.failure.error);
  }

  const current: Entry = entry ?? {};
  if (!entry) {
    sweep(now);
    entries.set(key, current);
  }
  const pending = read().then(
    (data) => {
      current.value = { data, expiresAt: Date.now() + ttlMs };
      current.failure = undefined;
      return data;
    },
    (error: unknown) => {
      const at = Date.now();
      current.failure = { error, until: at + FAILURE_TTL_MS };
      const stale = isOutage(error) ? staleValue(current, at) : null;
      if (!stale) throw error;
      console.warn(
        `[coc] ${key}: API unavailable, serving the last response (${(error as Error).message})`,
      );
      return stale.data as T;
    },
  );
  current.pending = pending;
  const settle = () => {
    if (current.pending === pending) current.pending = undefined;
  };
  pending.then(settle, settle);
  return pending;
}

/** Forgets every response (tests). */
export function resetLiveCache(): void {
  entries.clear();
  nextSweepAt = 0;
}

/** Number of keys in memory (tests). */
export function liveCacheSize(): number {
  return entries.size;
}
