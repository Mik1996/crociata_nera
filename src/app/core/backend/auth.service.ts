import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  defer,
  finalize,
  firstValueFrom,
  from,
  map,
  Observable,
  of,
  retry,
  shareReplay,
  take,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { LanguageService } from '../i18n/language.service';
import {
  AuthResult,
  BackendUser,
  BaseResult,
  ChangePasswordRequest,
  ResetPasswordRequest,
  SignInRequest,
  SignUpRequest,
} from './backend-api.types';

/**
 * Session with the application backend.
 *
 * - The access token lives in memory only (a signal), never in localStorage.
 * - The refresh token is an httpOnly cookie managed by the browser: JavaScript cannot read it.
 *   On startup {@link restoreSession} exchanges it for a new access token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(APP_CONFIG).backendBaseUrl}/auth`;
  private readonly language = inject(LanguageService);

  private readonly session = signal<AuthResult | null>(null);
  private refreshing$: Observable<string | null> | null = null;
  /** Startup session restore, shared with guards that must wait for it. */
  private restoring$: Observable<unknown> = of(null);

  readonly user = computed<BackendUser | null>(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  /** Clash of Clans accounts linked to the signed-in user, verified or not. */
  readonly linkedPlayers = computed(() => this.session()?.user.players ?? []);
  /** Tags of the signed-in user's accounts proven with the in-game API token. */
  readonly playerTags = computed(
    () => new Set(this.linkedPlayers().filter((p) => p.verified).map((p) => p.tag.toUpperCase())),
  );
  /** `true` for one of the signed-in user's verified accounts: marks "your" rows in the tables. */
  readonly isMyPlayer = (tag: string): boolean => this.playerTags().has(tag.toUpperCase());
  readonly isAdmin = computed(() => this.session()?.user.roles?.includes('ADMIN') ?? false);

  signUp(request: SignUpRequest): Observable<BackendUser> {
    return this.post('sign-up', { ...request, language: this.language.current() });
  }

  /**
   * Links one more Clash of Clans account, after the backend verified it with the API token shown
   * in the game (Settings → More Settings).
   */
  linkPlayer(playerTag: string, token: string): Observable<BackendUser> {
    return this.http.post<BaseResult<BackendUser>>(`${this.baseUrl}/me/player`, { playerTag, token }).pipe(
      map((response) => response.result!),
      tap((user) => this.patchUser(user)),
    );
  }

  /** Unlinks one Clash of Clans account of the signed-in user. */
  unlinkPlayer(tag: string): Observable<BackendUser> {
    const path = encodeURIComponent(tag.replace(/^#/, ''));
    return this.http.delete<BaseResult<BackendUser>>(`${this.baseUrl}/me/player/${path}`).pipe(
      map((response) => response.result!),
      tap((user) => this.patchUser(user)),
    );
  }

  /** Other sessions are signed out by the backend; this one stays active. */
  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http
      .post<BaseResult<null>>(`${this.baseUrl}/change-password`, request, { withCredentials: true })
      .pipe(map(() => undefined));
  }

  /** Emails a reset link (the backend answers the same way for unknown addresses). */
  forgotPassword(email: string): Observable<void> {
    return this.http
      .post<BaseResult<null>>(`${this.baseUrl}/forgot-password`, { email, language: this.language.current() })
      .pipe(map(() => undefined));
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.http.post<BaseResult<null>>(`${this.baseUrl}/reset-password`, request).pipe(map(() => undefined));
  }

  verifyEmail(token: string): Observable<BackendUser> {
    return this.http.post<BaseResult<BackendUser>>(`${this.baseUrl}/verify-email`, { token }).pipe(
      map((response) => response.result!),
      tap((user) => {
        if (this.session()?.user.id === user.id) this.patchUser(user);
      }),
    );
  }

  resendVerification(): Observable<void> {
    return this.http
      .post<BaseResult<null>>(`${this.baseUrl}/verify-email/resend`, { language: this.language.current() })
      .pipe(map(() => undefined));
  }

  signIn(request: SignInRequest): Observable<BackendUser> {
    return this.post('sign-in', request);
  }

  /** Revokes the session on the backend; the local session is cleared in any case. */
  signOut(): Observable<void> {
    return this.http.post<BaseResult<null>>(`${this.baseUrl}/sign-out`, {}, { withCredentials: true }).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => this.session.set(null)),
    );
  }

  /**
   * New access token from the refresh cookie. Emits `null` when no token could be obtained.
   *
   * - Concurrent callers of this tab share a single request, and the tabs of the browser take
   *   turns (Web Locks): the backend rotates the cookie at every refresh, so the next tab sends
   *   the new one.
   * - Only a 401 (session rejected by the backend) signs out. Temporary failures (backend
   *   restarting during a deploy, no network, rate limit) are retried, then the session is kept:
   *   the next request tries again.
   */
  refresh(): Observable<string | null> {
    const request = this.http.post<BaseResult<AuthResult>>(`${this.baseUrl}/refresh`, {}, { withCredentials: true });
    this.refreshing$ ??= underRefreshLock(request)
      .pipe(
        retry({
          count: REFRESH_RETRIES,
          delay: (error: unknown, attempt) =>
            isSessionRejected(error) ? throwError(() => error) : timer(attempt * REFRESH_RETRY_DELAY_MS),
        }),
        map((response) => response.result),
        tap((result) => this.session.set(result)),
        map((result) => result?.accessToken ?? null),
        catchError((error: unknown) => {
          if (isSessionRejected(error)) this.session.set(null);
          return of(null);
        }),
        finalize(() => (this.refreshing$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshing$;
  }

  /** Called once at startup: silently restores the session if the refresh cookie is valid. */
  restoreSession(): void {
    this.restoring$ = this.refresh().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.restoring$.subscribe();
  }

  /** Completes once the startup restore is done (immediately if it never started). */
  whenReady(): Observable<void> {
    return this.restoring$.pipe(
      take(1),
      map(() => undefined),
    );
  }

  /** Replaces the user in the current session (after a profile change). */
  private patchUser(user: BackendUser): void {
    const session = this.session();
    if (session) this.session.set({ ...session, user });
  }

  private post(path: 'sign-up' | 'sign-in', body: SignUpRequest | SignInRequest): Observable<BackendUser> {
    return this.http.post<BaseResult<AuthResult>>(`${this.baseUrl}/${path}`, body, { withCredentials: true }).pipe(
      tap((response) => this.session.set(response.result)),
      map((response) => response.result!.user),
    );
  }
}

/** Extra attempts of a refresh that failed for a temporary reason. */
const REFRESH_RETRIES = 2;
/** Wait before the n-th retry: n × this delay (1 s, then 2 s). */
export const REFRESH_RETRY_DELAY_MS = 1000;

/** The backend rejected the refresh cookie (expired, revoked, missing): the session is over. */
function isSessionRejected(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

/**
 * Runs the refresh request while holding a lock shared by every tab of the site (Web Locks API),
 * so two tabs never send the same refresh cookie at once. Browsers without the API (or tests)
 * run the request directly.
 */
function underRefreshLock<T>(request: Observable<T>): Observable<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return request;
  return defer(() => from(locks.request('cn-session-refresh', () => firstValueFrom(request))));
}
