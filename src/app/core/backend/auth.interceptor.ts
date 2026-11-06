import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from './auth.service';

/** Session endpoints: authenticated by credentials or the refresh cookie, never by the token. */
const SESSION_PATHS = ['/auth/sign-in', '/auth/sign-up', '/auth/refresh', '/auth/sign-out'];

/**
 * Adds `Authorization: Bearer <access token>` to requests for the application backend
 * (never to the Clash of Clans proxy). On a 401 it refreshes the token once and retries.
 * Session endpoints are left alone: retrying a failed refresh with a refresh would loop.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const backendBaseUrl = inject(APP_CONFIG).backendBaseUrl;
  const path = request.url.startsWith(`${backendBaseUrl}/`) ? request.url.slice(backendBaseUrl.length) : null;
  if (path === null || SESSION_PATHS.some((p) => path === p || path.startsWith(`${p}?`))) {
    return next(request);
  }

  const auth = inject(AuthService);
  const token = auth.accessToken();
  return next(withToken(request, token)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token) return throwError(() => error);
      return auth.refresh().pipe(
        switchMap((fresh) => (fresh ? next(withToken(request, fresh)) : throwError(() => error))),
      );
    }),
  );
};

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}
