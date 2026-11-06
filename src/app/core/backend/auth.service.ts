import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, of, shareReplay, take, tap } from 'rxjs';
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
  /** Clash of Clans tag linked to the signed-in account (e.g. `#ABC123`), if any. */
  readonly playerTag = computed(() => this.session()?.user.playerTag?.toUpperCase() ?? null);
  readonly isAdmin = computed(() => this.session()?.user.roles?.includes('ADMIN') ?? false);

  signUp(request: SignUpRequest): Observable<BackendUser> {
    return this.post('sign-up', { ...request, language: this.language.current() });
  }

  /** Links (or unlinks, with `null`) the Clash of Clans player tag of the signed-in user. */
  updateProfile(changes: { playerTag: string | null }): Observable<BackendUser> {
    return this.http.patch<BaseResult<BackendUser>>(`${this.baseUrl}/me`, changes).pipe(
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
   * New access token from the refresh cookie. Concurrent callers share a single request
   * (the backend rotates the cookie: two parallel refreshes would look like token reuse).
   * Emits `null` when there is no valid session.
   */
  refresh(): Observable<string | null> {
    this.refreshing$ ??= this.http
      .post<BaseResult<AuthResult>>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(
        map((response) => response.result),
        tap((result) => this.session.set(result)),
        map((result) => result?.accessToken ?? null),
        catchError(() => {
          this.session.set(null);
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
