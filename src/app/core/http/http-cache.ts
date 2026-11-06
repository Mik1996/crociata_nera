import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Default lifetime of a cached GET response. */
export const DEFAULT_CACHE_DURATION_MS = 15 * 60_000;

/**
 * How long a GET response stays in the cache, in milliseconds (`0` = never cached).
 * Set it per request with {@link cacheFor} / {@link noCache}; unset requests use the default.
 */
export const CACHE_DURATION = new HttpContextToken<number>(() => DEFAULT_CACHE_DURATION_MS);

/**
 * URL prefixes whose cached GETs are dropped when a mutation (POST, PUT, PATCH, DELETE)
 * succeeds. `null` (default) = the API the mutation belongs to (e.g. `/api/v1/…` clears
 * every cached `/api/v1/…` GET). Use `['']` to clear the whole cache.
 */
export const CACHE_INVALIDATES = new HttpContextToken<string[] | null>(() => null);

/** Request context with a custom cache duration, e.g. `{ context: cacheFor({ minutes: 2 }) }`. */
export function cacheFor(duration: { minutes?: number; seconds?: number }, context = new HttpContext()): HttpContext {
  const ms = ((duration.minutes ?? 0) * 60 + (duration.seconds ?? 0)) * 1000;
  return context.set(CACHE_DURATION, ms);
}

/** Request context that bypasses the cache (always hits the network, stores nothing). */
export function noCache(context = new HttpContext()): HttpContext {
  return context.set(CACHE_DURATION, 0);
}
