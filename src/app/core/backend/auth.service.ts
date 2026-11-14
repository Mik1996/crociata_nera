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
import { isOffline } from '../pwa/connectivity';
import { clearPrivateOfflineData } from '../pwa/offline-data';
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
 * - Offline (or with the backend unreachable) the session cannot be checked: the user of the last
 *   session is then remembered from a minimal profile in localStorage ({@link OfflineProfile}: no
 *   token, no email), so the pages cached by the service worker stay open. The session is checked
 *   again as soon as the backend answers; a rejected session signs out and forgets the profile.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(APP_CONFIG).backendBaseUrl}/auth`;
  private readonly language = inject(LanguageService);

  private readonly session = signal<AuthResult | null>(null);
  /** User of the last session, while the backend cannot confirm it (offline). */
  private readonly rememberedUser = signal<BackendUser | null>(null);
  private refreshing$: Observable<string | null> | null = null;
  /** Startup session restore, shared with guards that must wait for it. */
  private restoring$: Observable<unknown> = of(null);
  /**
   * The refresh cookie could not be checked yet (backend unreachable): a session may exist.
   * Tried again later, when the page comes back to the foreground and when the network returns.
   */
  private restorePending = false;
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

  readonly user = computed<BackendUser | null>(() => this.session()?.user ?? this.rememberedUser());
  readonly isAuthenticated = computed(() => this.user() !== null);
  /** Signed in from the remembered profile: the backend has not confirmed the session yet. */
  readonly isUnconfirmed = computed(
    () => this.session() === null && this.rememberedUser() !== null,
  );
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  /** Clash of Clans accounts linked to the signed-in user, verified or not. */
  readonly linkedPlayers = computed(() => this.user()?.players ?? []);
  /** Tags of the signed-in user's accounts proven with the in-game API token. */
  readonly playerTags = computed(
    () =>
      new Set(
        this.linkedPlayers()
          .filter((p) => p.verified)
          .map((p) => p.tag.toUpperCase()),
      ),
  );
  /** `true` for one of the signed-in user's verified accounts: marks "your" rows in the tables. */
  readonly isMyPlayer = (tag: string): boolean => this.playerTags().has(tag.toUpperCase());
  readonly isAdmin = computed(() => this.user()?.roles?.includes('ADMIN') ?? false);
  /**
   * Full access to the clans' pages: administrators and members of a clan of the Crusade with a
   * verified linked account (worked out by the backend, which enforces it on every request).
   */
  readonly hasClanAccess = computed(() => this.isAdmin() || (this.user()?.clanAccess ?? false));
  /**
   * Access to the leaders' pages (CWL line-up): administrators, leaders and co-leaders of a clan
   * of the Crusade (worked out and enforced by the backend).
   */
  readonly hasLeaderAccess = computed(() => this.isAdmin() || (this.user()?.leaderAccess ?? false));

  signUp(request: SignUpRequest): Observable<BackendUser> {
    return this.post('sign-up', { ...request, language: this.language.current() });
  }

  /**
   * Links one more Clash of Clans account, after the backend verified it with the API token shown
   * in the game (Settings → More Settings).
   */
  linkPlayer(playerTag: string, token: string): Observable<BackendUser> {
    return this.http
      .post<BaseResult<BackendUser>>(`${this.baseUrl}/me/player`, { playerTag, token })
      .pipe(
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
      .post<BaseResult<null>>(`${this.baseUrl}/forgot-password`, {
        email,
        language: this.language.current(),
      })
      .pipe(map(() => undefined));
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.http
      .post<BaseResult<null>>(`${this.baseUrl}/reset-password`, request)
      .pipe(map(() => undefined));
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
      .post<BaseResult<null>>(`${this.baseUrl}/verify-email/resend`, {
        language: this.language.current(),
      })
      .pipe(map(() => undefined));
  }

  signIn(request: SignInRequest): Observable<BackendUser> {
    return this.post('sign-in', request);
  }

  /** Revokes the session on the backend; the local session is cleared in any case. */
  signOut(): Observable<void> {
    return this.http
      .post<BaseResult<null>>(`${this.baseUrl}/sign-out`, {}, { withCredentials: true })
      .pipe(
        map(() => undefined),
        catchError(() => of(undefined)),
        finalize(() => this.endSession()),
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
   *   the next request tries again. Without a session yet (startup restore) it is tried again later.
   */
  refresh(): Observable<string | null> {
    return this.refreshWithRetries(REFRESH_RETRIES);
  }

  private refreshWithRetries(retries: number): Observable<string | null> {
    const request = this.http.post<BaseResult<AuthResult>>(
      `${this.baseUrl}/refresh`,
      {},
      { withCredentials: true },
    );
    this.refreshing$ ??= underRefreshLock(request).pipe(
      retry({
        count: retries,
        delay: (error: unknown, attempt) =>
          isSessionRejected(error)
            ? throwError(() => error)
            : timer(attempt * REFRESH_RETRY_DELAY_MS),
      }),
      map((response) => response.result),
      tap((result) => (result ? this.startSession(result) : this.endSession())),
      map((result) => result?.accessToken ?? null),
      catchError((error: unknown) => {
        if (isSessionRejected(error)) {
          this.endSession();
        } else if (!this.session()) {
          this.rememberUser();
          this.scheduleRestoreRetry();
        }
        return of(null);
      }),
      finalize(() => (this.refreshing$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing$;
  }

  /**
   * Called once at startup: silently restores the session if the refresh cookie is valid.
   * While the backend is unreachable (restarting during a deploy) it keeps trying for a while
   * ({@link STARTUP_REFRESH_RETRIES}): the guards wait, instead of treating the user as signed out.
   * After that it tries again in the background, the user of the last session being remembered
   * meanwhile. Offline nothing is worth waiting for: the remembered user is used at once.
   */
  restoreSession(): void {
    this.listenForRestoreChances();
    this.restoring$ = this.refreshWithRetries(isOffline() ? 0 : STARTUP_REFRESH_RETRIES).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.restoring$.subscribe();
  }

  /** Completes once the startup restore is done (immediately if it never started). */
  whenReady(): Observable<void> {
    return this.restoring$.pipe(
      take(1),
      map(() => undefined),
    );
  }

  private scheduleRestoreRetry(): void {
    this.restorePending = true;
    if (this.restoreTimer) return;
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      this.retryRestore();
    }, RESTORE_RETRY_MS);
  }

  private stopRestoreRetries(): void {
    this.restorePending = false;
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = null;
  }

  /** Tries the pending restore again (no-op once it got an answer or the user signed in). */
  private retryRestore(): void {
    if (!this.restorePending || this.session()) return;
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = null;
    this.refresh().subscribe();
  }

  /** A suspended mobile tab or a lost connection is when the backend is most likely back. */
  private listenForRestoreChances(): void {
    if (this.listening || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.listening = true;
    window.addEventListener('online', () => this.retryRestore());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.retryRestore();
    });
  }

  /** A session confirmed by the backend: it replaces the remembered user, whose profile is updated. */
  private startSession(result: AuthResult): void {
    this.session.set(result);
    this.rememberedUser.set(null);
    this.stopRestoreRetries();
    saveOfflineProfile(result.user);
  }

  /** Signed out or session rejected: nothing of the user stays in the browser. */
  private endSession(): void {
    this.session.set(null);
    this.rememberedUser.set(null);
    this.stopRestoreRetries();
    removeOfflineProfile();
    void clearPrivateOfflineData();
  }

  /** The backend cannot be reached: the user of the last session, if any, stays signed in. */
  private rememberUser(): void {
    if (!this.rememberedUser()) this.rememberedUser.set(loadOfflineProfile());
  }

  /** Replaces the user in the current session (after a profile change). */
  private patchUser(user: BackendUser): void {
    const session = this.session();
    if (session) this.startSession({ ...session, user });
  }

  private post(
    path: 'sign-up' | 'sign-in',
    body: SignUpRequest | SignInRequest,
  ): Observable<BackendUser> {
    return this.http
      .post<BaseResult<AuthResult>>(`${this.baseUrl}/${path}`, body, { withCredentials: true })
      .pipe(
        tap((response) => this.startSession(response.result!)),
        map((response) => response.result!.user),
      );
  }
}

/** localStorage key of the {@link OfflineProfile} of the last session. */
export const OFFLINE_PROFILE_KEY = 'crociata-nera.offline-profile';

/**
 * What is remembered of the signed-in user to open the clans' pages offline: what the pages and
 * the guards need, never the token nor the email address.
 */
type OfflineProfile = Pick<
  BackendUser,
  'id' | 'username' | 'roles' | 'players' | 'emailVerified' | 'clanAccess' | 'leaderAccess'
>;

function saveOfflineProfile(user: BackendUser): void {
  const { id, username, roles, players, emailVerified, clanAccess, leaderAccess } = user;
  const profile: OfflineProfile = {
    id,
    username,
    roles,
    players,
    emailVerified,
    clanAccess,
    leaderAccess,
  };
  try {
    localStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable (private mode, blocked site data): offline the user is signed out.
  }
}

function loadOfflineProfile(): BackendUser | null {
  try {
    const profile = JSON.parse(
      localStorage.getItem(OFFLINE_PROFILE_KEY) ?? 'null',
    ) as OfflineProfile | null;
    if (!profile || typeof profile.id !== 'string' || typeof profile.username !== 'string')
      return null;
    return {
      ...profile,
      roles: Array.isArray(profile.roles) ? profile.roles : [],
      players: Array.isArray(profile.players) ? profile.players : [],
      emailVerified: profile.emailVerified === true,
      clanAccess: profile.clanAccess === true,
      leaderAccess: profile.leaderAccess === true,
      email: '',
      createdAt: '',
    };
  } catch {
    return null;
  }
}

function removeOfflineProfile(): void {
  try {
    localStorage.removeItem(OFFLINE_PROFILE_KEY);
  } catch {
    // Nothing was stored either.
  }
}

/** Extra attempts of a refresh that failed for a temporary reason. */
const REFRESH_RETRIES = 2;
/**
 * Extra attempts of the startup restore: 1 + 2 + … + 6 s ≈ 21 s, enough for the backend to
 * restart during a deploy. Only a backend that is unreachable makes the startup wait that long.
 */
export const STARTUP_REFRESH_RETRIES = 6;
/** Wait before the n-th retry: n × this delay (1 s, then 2 s). */
export const REFRESH_RETRY_DELAY_MS = 1000;
/** Background retry of a startup restore that never got an answer from the backend. */
export const RESTORE_RETRY_MS = 30_000;

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
