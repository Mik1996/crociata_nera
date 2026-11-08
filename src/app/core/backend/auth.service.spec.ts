import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { authInterceptor } from './auth.interceptor';
import { AuthService, REFRESH_RETRY_DELAY_MS } from './auth.service';
import { AuthResult, BaseResult } from './backend-api.types';

const ok = <T>(result: T): BaseResult<T> => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });
const session = (token: string): AuthResult => ({
  accessToken: token,
  accessTokenExpiresAt: '2026-11-06T12:00:00.000Z',
  user: { id: '1', email: 'a@b.io', username: 'alice', roles: ['USER'], players: [], emailVerified: false, createdAt: '' },
});

describe('AuthService and authInterceptor', () => {
  let auth: AuthService;
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
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

  afterEach(() => httpMock.verify());

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
});
