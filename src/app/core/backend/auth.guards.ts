import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { AuthService } from './auth.service';

/**
 * Only for signed-out users (sign-in, sign-up): signed-in users go to the home page.
 * With mock data there is no backend, so these pages are not reachable.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (inject(APP_CONFIG).useMockApi) return router.parseUrl('/');
  return auth.whenReady().pipe(map(() => (auth.isAuthenticated() ? router.parseUrl('/') : true)));
};

/**
 * Only for signed-in users: the others go to the (public) welcome page, which keeps the
 * requested page as `returnUrl` for the "Sign in" button.
 * Waits for the startup session restore, so a valid refresh cookie is not mistaken for
 * "signed out". With mock data (demo without backend) every page stays open.
 * Usable both as `canActivate` and `canActivateChild`.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (inject(APP_CONFIG).useMockApi) return true;
  return auth.whenReady().pipe(map(() => (auth.isAuthenticated() ? true : guestRedirect(router, state.url))));
};

/** Pages that need no return URL: after sign-in the user lands on the home page anyway. */
const HOME_URLS = new Set(['', '/']);

/** Query params that carry a page to come back to (none for the home page and the auth pages). */
export function returnUrlParams(returnUrl: string | null | undefined): { returnUrl?: string } {
  return returnUrl && !HOME_URLS.has(returnUrl) && !returnUrl.startsWith('/sign-') && !returnUrl.startsWith('/?')
    ? { returnUrl }
    : {};
}

/** Welcome page for signed-out users: `/?returnUrl=…`. */
export function guestRedirect(router: Router, returnUrl: string) {
  return router.createUrlTree(['/'], { queryParams: returnUrlParams(returnUrl) });
}

/** Accepts only in-app paths as redirect targets (no `//evil.com` or absolute URLs). */
export function safeReturnUrl(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}
