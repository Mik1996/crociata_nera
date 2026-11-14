import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { authInterceptor } from './auth.interceptor';
import {
  AuthService,
  OFFLINE_PROFILE_KEY,
  REFRESH_RETRY_DELAY_MS,
  RESTORE_RETRY_MS,
  STARTUP_REFRESH_RETRIES,
} from './auth.service';
import { AuthResult, BaseResult } from './backend-api.types';

const ok = <T>(result: T): BaseResult<T> => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });
const session = (token: string): AuthResult => ({
  accessToken: token,
  accessTokenExpiresAt: '2026-11-06T12:00:00.000Z',
  user: { id: '1', email: 'a@b.io', username: 'alice', roles: ['USER'], players: [], emailVerified: false, clanAccess: false, createdAt: '' },
});

describe('AuthService and authInterceptor', () => {
  let auth: AuthService;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('signs in, keeps the access token in memory and sends cookies', async () => {
    const user = firstValueFrom(auth.signIn({ identifier: 'alice', password: 'secret123' }));
    const req = httpMock.expectOne('/api/v1/auth/sign-in');
    expect(req.request.withCredentials).toBe(true);
    req.flush(ok(session('t1')));

    expect((await user).username).toBe('alice');
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.accessToken()).toBe('t1');
  });

  it('restores the session from the refresh cookie, or stays signed out', () => {
    auth.restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);

    auth.restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t2')));
    expect(auth.accessToken()).toBe('t2');
  });

  it('retries a refresh that fails for a temporary reason (backend restarting)', async () => {
    vi.useFakeTimers();
    try {
      let token: string | null | undefined;
      auth.refresh().subscribe((t) => (token = t));
      httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 502, statusText: 'Bad Gateway' });
      await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS);
      httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 0, statusText: 'Unknown Error' });
      await vi.advanceTimersByTimeAsync(2 * REFRESH_RETRY_DELAY_MS);
      httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t6')));
      expect(token).toBe('t6');
      expect(auth.isAuthenticated()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the session when the refresh keeps failing temporarily, signs out only on 401', async () => {
    auth.restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t7')));

    vi.useFakeTimers();
    try {
      let token: string | null | undefined;
      auth.refresh().subscribe((t) => (token = t));
      for (let attempt = 0; attempt <= 2; attempt++) {
        httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 503, statusText: 'Unavailable' });
        await vi.advanceTimersByTimeAsync((attempt + 1) * REFRESH_RETRY_DELAY_MS);
      }
      expect(token).toBeNull();
      expect(auth.isAuthenticated()).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    // The backend rejects the cookie: now the session is over (no retry).
    auth.refresh().subscribe();
    httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('keeps restoring the session while the backend restarts, the guards waiting for it', async () => {
    vi.useFakeTimers();
    try {
      let ready = false;
      auth.restoreSession();
      auth.whenReady().subscribe(() => (ready = true));
      for (let attempt = 1; attempt <= 3; attempt++) {
        httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 502, statusText: 'Bad Gateway' });
        await vi.advanceTimersByTimeAsync(attempt * REFRESH_RETRY_DELAY_MS);
      }
      expect(ready).toBe(false);
      httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t8')));
      expect(ready).toBe(true);
      expect(auth.accessToken()).toBe('t8');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tries the restore again in the background when the backend never answered', async () => {
    vi.useFakeTimers();
    try {
      auth.restoreSession();
      for (let attempt = 1; attempt <= STARTUP_REFRESH_RETRIES + 1; attempt++) {
        httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 0, statusText: 'Unknown Error' });
        await vi.advanceTimersByTimeAsync(attempt * REFRESH_RETRY_DELAY_MS);
      }
      expect(auth.isAuthenticated()).toBe(false);

      // The page comes back to the foreground: tried at once.
      document.dispatchEvent(new Event('visibilitychange'));
      httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t9')));
      expect(auth.accessToken()).toBe('t9');

      // Once restored, no more background attempts.
      await vi.advanceTimersByTimeAsync(RESTORE_RETRY_MS);
      httpMock.expectNone('/api/v1/auth/refresh');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a pending restore on a timer, and stops when the backend rejects the cookie', async () => {
    vi.useFakeTimers();
    try {
      auth.restoreSession();
      for (let attempt = 1; attempt <= STARTUP_REFRESH_RETRIES + 1; attempt++) {
        httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 503, statusText: 'Unavailable' });
        await vi.advanceTimersByTimeAsync(attempt * REFRESH_RETRY_DELAY_MS);
      }
      await vi.advanceTimersByTimeAsync(RESTORE_RETRY_MS);
      httpMock.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(auth.isAuthenticated()).toBe(false);

      await vi.advanceTimersByTimeAsync(RESTORE_RETRY_MS);
      document.dispatchEvent(new Event('visibilitychange'));
      httpMock.expectNone('/api/v1/auth/refresh');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one refresh request between concurrent callers', () => {
    auth.refresh().subscribe();
    auth.refresh().subscribe();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t3')));
  });

  it('adds the bearer token to backend requests only', () => {
    auth.restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t4')));

    http.get('/api/v1/wars').subscribe();
    http.get('/api/coc/clans/x').subscribe();
    expect(httpMock.expectOne('/api/v1/wars').request.headers.get('Authorization')).toBe('Bearer t4');
    expect(httpMock.expectOne('/api/coc/clans/x').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes an expired access token once and retries', () => {
    auth.restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('old')));

    let body: unknown;
    http.get('/api/v1/wars').subscribe((b) => (body = b));
    httpMock.expectOne('/api/v1/wars').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('new')));
    const retry = httpMock.expectOne('/api/v1/wars');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ done: true });
    expect(body).toEqual({ done: true });
  });

  it('signs out and clears the local session even if the backend fails', async () => {
    auth.restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t5')));

    const done = firstValueFrom(auth.signOut());
    httpMock.expectOne('/api/v1/auth/sign-out').flush(null, { status: 500, statusText: 'Error' });
    await done;
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('drops the clan data kept for offline use when the session ends', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['ngsw:/:1:data:clan-data:cache', 'ngsw:/:1:data:coc-api:cache'],
      delete: async (name: string) => deleted.push(name) > 0,
    });
    try {
      auth.restoreSession();
      httpMock.expectOne('/api/v1/auth/refresh').flush(ok(session('t6')));

      const done = firstValueFrom(auth.signOut());
      httpMock.expectOne('/api/v1/auth/sign-out').flush(ok(null));
      await done;
      await vi.waitFor(() => expect(deleted).toEqual(['ngsw:/:1:data:clan-data:cache']));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('offline', () => {
    const member = (token: string): AuthResult => {
      const result = session(token);
      return {
        ...result,
        user: { ...result.user, clanAccess: true, players: [{ tag: '#AAA', verified: true }] as never },
      };
    };
    const storedProfile = () => JSON.parse(localStorage.getItem(OFFLINE_PROFILE_KEY) ?? 'null');

    function goOffline(): void {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    }

    afterEach(() => vi.restoreAllMocks());

    /** A new visit of the site: same browser storage, new app instance. */
    function reopenSite() {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([authInterceptor])),
          provideHttpClientTesting(),
          provideCocApiTest({ useMockApi: true }),
        ],
      });
      return {
        fresh: TestBed.inject(AuthService),
        mock: TestBed.inject(HttpTestingController),
        client: TestBed.inject(HttpClient),
      };
    }

    async function signInMember(): Promise<void> {
      const user = firstValueFrom(auth.signIn({ identifier: 'alice', password: 'secret123' }));
      httpMock.expectOne('/api/v1/auth/sign-in').flush(ok(member('t1')));
      await user;
    }

    it('remembers a minimal profile of the signed-in user: no token, no email', async () => {
      await signInMember();
      const profile = storedProfile();
      expect(profile).toEqual({
        id: '1',
        username: 'alice',
        roles: ['USER'],
        players: [{ tag: '#AAA', verified: true }],
        emailVerified: false,
        clanAccess: true,
      });
      expect(JSON.stringify(profile)).not.toContain('t1');
      expect(JSON.stringify(profile)).not.toContain('a@b.io');
    });

    it('opens the clan pages offline with the remembered user, without waiting for retries', async () => {
      await signInMember();
      const { fresh, mock } = reopenSite();
      goOffline();

      let ready = false;
      fresh.restoreSession();
      fresh.whenReady().subscribe(() => (ready = true));
      mock.expectOne('/api/v1/auth/refresh').flush(null, { status: 0, statusText: 'Unknown Error' });

      expect(ready).toBe(true);
      expect(fresh.isAuthenticated()).toBe(true);
      expect(fresh.isUnconfirmed()).toBe(true);
      expect(fresh.hasClanAccess()).toBe(true);
      expect(fresh.isMyPlayer('#aaa')).toBe(true);
      expect(fresh.accessToken()).toBeNull();
      expect(fresh.user()?.email).toBe('');

      // The network is back: the session is confirmed.
      window.dispatchEvent(new Event('online'));
      mock.expectOne('/api/v1/auth/refresh').flush(ok(member('t2')));
      expect(fresh.isUnconfirmed()).toBe(false);
      expect(fresh.accessToken()).toBe('t2');
      mock.verify();
    });

    it('signs out and forgets the profile when the backend rejects the remembered session', async () => {
      await signInMember();
      const { fresh, mock, client } = reopenSite();
      goOffline();
      fresh.restoreSession();
      mock.expectOne('/api/v1/auth/refresh').flush(null, { status: 0, statusText: 'Unknown Error' });
      expect(fresh.isUnconfirmed()).toBe(true);

      // Back online, a page reads clan data without a token: 401, refresh, rejected.
      const failed = firstValueFrom(client.get('/api/v1/wars')).catch((e: unknown) => e);
      const read = mock.expectOne('/api/v1/wars');
      expect(read.request.headers.has('Authorization')).toBe(false);
      read.flush(null, { status: 401, statusText: 'Unauthorized' });
      mock.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
      await failed;

      expect(fresh.isAuthenticated()).toBe(false);
      expect(localStorage.getItem(OFFLINE_PROFILE_KEY)).toBeNull();
      mock.verify();
    });

    it('retries with a fresh token a read made by the remembered user', async () => {
      await signInMember();
      const { fresh, mock, client } = reopenSite();
      goOffline();
      fresh.restoreSession();
      mock.expectOne('/api/v1/auth/refresh').flush(null, { status: 0, statusText: 'Unknown Error' });

      const body = firstValueFrom(client.get('/api/v1/wars'));
      mock.expectOne('/api/v1/wars').flush(null, { status: 401, statusText: 'Unauthorized' });
      mock.expectOne('/api/v1/auth/refresh').flush(ok(member('t3')));
      const retry = mock.expectOne('/api/v1/wars');
      expect(retry.request.headers.get('Authorization')).toBe('Bearer t3');
      retry.flush({ wars: [] });
      expect(await body).toEqual({ wars: [] });
      mock.verify();
    });

    it('forgets the profile at sign-out', async () => {
      await signInMember();
      const done = firstValueFrom(auth.signOut());
      httpMock.expectOne('/api/v1/auth/sign-out').flush(ok(null));
      await done;
      expect(localStorage.getItem(OFFLINE_PROFILE_KEY)).toBeNull();
    });
  });
});
