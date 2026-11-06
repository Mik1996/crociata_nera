import { HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, of, share, tap } from 'rxjs';
import { CACHE_DURATION, CACHE_INVALIDATES } from './http-cache';
import { HttpCacheService } from './http-cache.service';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Client-side HTTP cache.
 *
 * - **GET**: successful responses are kept for `CACHE_DURATION` (15 minutes by default,
 *   overridable per request with `cacheFor()` / `noCache()`); identical requests made at the
 *   same time share one network call.
 * - **POST, PUT, PATCH, DELETE**: once successful, they drop the cached GETs of the same API
 *   (or the prefixes given with `CACHE_INVALIDATES`), so the next read is fresh.
 *
 * Server `Cache-Control` headers are not consulted: the duration is decided by the client.
 */
export const cacheInterceptor: HttpInterceptorFn = (request, next) => {
  const cache = inject(HttpCacheService);

  if (MUTATIONS.has(request.method)) {
    return next(request).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.ok) cache.invalidate(...invalidationPrefixes(request));
      }),
    );
  }

  const duration = request.context.get(CACHE_DURATION);
  if (request.method !== 'GET' || duration <= 0) return next(request);

  const key = request.urlWithParams;
  const cached = cache.get(key);
  if (cached) return of(cached.clone());

  const pending = cache.inFlight.get(key);
  if (pending) return pending;

  const generation = cache.currentGeneration;
  const shared = next(request).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.ok) cache.set(key, event, duration, generation);
    }),
    finalize(() => cache.inFlight.delete(key)),
    share(),
  );
  cache.inFlight.set(key, shared);
  return shared;
};

/** `/api/v1/auth/sign-in` → `['/api/v1/']`; absolute URLs keep their origin. */
function invalidationPrefixes(request: HttpRequest<unknown>): string[] {
  const explicit = request.context.get(CACHE_INVALIDATES);
  if (explicit) return explicit;
  const match = /^((?:https?:\/\/[^/]+)?\/[^/?#]+\/[^/?#]+\/)/.exec(request.url);
  return [match?.[1] ?? ''];
}
