import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from './auth.service';

/**
 * Only for signed-out users (sign-in, sign-up): signed-in users go to the dashboard.
 * With mock data there is no backend, so these pages are not reachable.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (inject(APP_CONFIG).useMockApi) return router.parseUrl('/dashboard');
  return auth.whenReady().pipe(map(() => (auth.isAuthenticated() ? router.parseUrl('/dashboard') : true)));
};

/**
 * Only for signed-in users: the others go to sign-in and come back afterwards.
 * Waits for the startup session restore, so a valid refresh cookie is not mistaken for
 * "signed out". With mock data (demo without backend) every page stays open.
 * Usable both as `canActivate` and `canActivateChild`.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (inject(APP_CONFIG).useMockApi) return true;
  return auth.whenReady().pipe(map(() => (auth.isAuthenticated() ? true : signInRedirect(router, state.url))));
};

/** Pages that need no return URL: after sign-in the user lands on the dashboard anyway. */
const HOME_URLS = new Set(['', '/', '/dashboard']);

/** `/sign-in?returnUrl=…` (without a return URL for the home page and the auth pages). */
export function signInRedirect(router: Router, returnUrl: string) {
  const keep = !HOME_URLS.has(returnUrl) && !returnUrl.startsWith('/sign-');
  return router.createUrlTree(['/sign-in'], { queryParams: keep ? { returnUrl } : {} });
}

/** Accepts only in-app paths as redirect targets (no `//evil.com` or absolute URLs). */
export function safeReturnUrl(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/dashboard';
}
