import { HttpErrorResponse } from '@angular/common/http';
import { InterpolationParameters } from '@ngx-translate/core';
import { Observable, throwError } from 'rxjs';
import { TranslatableError } from '../i18n/translatable-error';
import { isOffline } from '../pwa/connectivity';
import { CocClientError } from './coc-api.types';

/**
 * API error carrying Supercell's original `reason` (e.g. `accessDenied.invalidIp`).
 * `message` is in English (logs and diagnostics); the UI uses `i18nKey` to translate it.
 */
export class CocApiHttpError extends Error implements TranslatableError {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
    readonly i18nKey = 'errors.server',
    readonly i18nParams?: InterpolationParameters,
  ) {
    super(message);
    this.name = 'CocApiHttpError';
  }
}

export function errorBody(err: HttpErrorResponse): CocClientError | undefined {
  return typeof err.error === 'object' && err.error && 'reason' in err.error
    ? (err.error as CocClientError)
    : undefined;
}

/** 403 `accessDenied` (without `.invalidIp`) = the clan war log is not public. */
export function isPrivateWarLog(err: HttpErrorResponse): boolean {
  return err.status === 403 && errorBody(err)?.reason === 'accessDenied';
}

/** Converts an HTTP error of the proxy into a {@link CocApiHttpError} with a translatable message. */
export function toApiError(err: HttpErrorResponse): Observable<never> {
  const body = errorBody(err);
  const reason = body?.reason;
  const fail = (key: string, message: string, params?: InterpolationParameters) =>
    throwError(() => new CocApiHttpError(message.trim(), err.status, reason, key, params));

  if (reason === 'accessDenied.invalidIp') {
    const detail = body?.message ?? '';
    return fail(
      'errors.invalidIp',
      'The API key does not allow the IP address of the proxy server. ' +
        'Create a new key on developer.clashofclans.com with the correct IP. ' +
        detail,
      { detail },
    );
  }
  if (reason === 'accessDenied') {
    return fail('errors.accessDenied', 'Access denied by the API: invalid or expired token.');
  }
  if (reason === 'proxy.unreachable') {
    return fail('errors.apiUnreachable', 'The proxy cannot reach api.clashofclans.com.');
  }
  // No network: the request failed (0), or the service worker had no saved copy of it (504).
  if ((err.status === 0 || err.status === 504) && isOffline()) {
    return fail('errors.offline', 'No network connection.');
  }
  if (err.status === 0 || err.status === 502 || err.status === 504 || (err.status === 500 && !body)) {
    return fail('errors.proxyUnreachable', 'Proxy unreachable. Start the backend with “npm run server”.');
  }
  const known: Record<number, [string, string]> = {
    404: ['errors.notFound', 'Clan or resource not found.'],
    429: ['errors.tooManyRequests', 'Too many requests to the API: try again in a moment.'],
    503: ['errors.maintenance', 'Clash of Clans API under maintenance.'],
  };
  const match = known[err.status];
  if (match) return fail(match[0], match[1]);
  return fail('errors.server', body?.message ?? `Server error (${err.status}).`, { status: err.status });
}
