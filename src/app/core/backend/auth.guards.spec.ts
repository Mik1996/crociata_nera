import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { adminGuard, authGuard, clanGuard, guestGuard, returnUrlParams, safeReturnUrl } from './auth.guards';
import { AuthService } from './auth.service';

const signedIn = {
  result: { accessToken: 't', accessTokenExpiresAt: '', user: { username: 'a' } },
  messages: [],
  status: { code: 200, name: 'HTTP_STATUS.OK' },
};

describe('auth guards', () => {
  let httpMock: HttpTestingController;

  function setup(useMockApi = false): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi })],
    });
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  function run(guard: typeof authGuard, url = '/x'): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
    return isObservable(result) ? firstValueFrom(result as Observable<boolean | UrlTree>) : Promise.resolve(result as boolean | UrlTree);
  }

  it('waits for the startup session restore', async () => {
    setup();
    TestBed.inject(AuthService).restoreSession();
    const result = run(guestGuard);
    httpMock.expectOne('/api/v1/auth/refresh').flush(signedIn);
    expect(String(await result)).toBe('/');
  });

  it('lets guests reach sign-in and sends them to the welcome page from protected pages', async () => {
    setup();
    expect(await run(guestGuard)).toBe(true);
    expect(String(await run(authGuard, '/wars'))).toBe('/?returnUrl=%2Fwars');
    expect(String(await run(authGuard, '/'))).toBe('/');
  });

  it('keeps return URLs only for real pages', () => {
    setup();
    expect(returnUrlParams('/wars/1')).toEqual({ returnUrl: '/wars/1' });
    for (const none of ['/', '', '/sign-in', '/sign-up?x=1', '/?returnUrl=%2Fwars', '/reset-password?token=x', '/verify-email?token=y', null]) {
      expect(returnUrlParams(none)).toEqual({});
    }
  });

  it('lets signed-in users through', async () => {
    setup();
    TestBed.inject(AuthService).restoreSession();
    const result = run(authGuard, '/wars');
    httpMock.expectOne('/api/v1/auth/refresh').flush(signedIn);
    expect(await result).toBe(true);
  });

  it('keeps every page open with mock data (no backend)', async () => {
    setup(true);
    expect(await run(authGuard, '/wars')).toBe(true);
    expect(String(await run(guestGuard))).toBe('/');
  });

  it('accepts only in-app return URLs', () => {
    setup();
    expect(safeReturnUrl('/wars/1')).toBe('/wars/1');
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '', null, undefined]) {
      expect(safeReturnUrl(bad)).toBe('/');
    }
  });

  it('opens administration pages to admins only', async () => {
    setup();
    TestBed.inject(AuthService).restoreSession();
    const pending = run(adminGuard);
    httpMock.expectOne('/api/v1/auth/refresh').flush(signedIn);
    expect(String(await pending)).toBe('/');

    TestBed.inject(AuthService).restoreSession();
    const admin = run(adminGuard);
    httpMock.expectOne('/api/v1/auth/refresh').flush({ ...signedIn, result: { ...signedIn.result, user: { username: 'a', roles: ['USER', 'ADMIN'] } } });
    expect(await admin).toBe(true);
  });

  it('opens the clans pages to members of the Crusade and admins, the others go to their profile', async () => {
    setup();
    expect(String(await run(clanGuard, '/wars'))).toBe('/?returnUrl=%2Fwars');

    const auth = TestBed.inject(AuthService);
    const as = async (user: object) => {
      auth.restoreSession();
      const pending = run(clanGuard, '/wars');
      httpMock.expectOne('/api/v1/auth/refresh').flush({ ...signedIn, result: { ...signedIn.result, user } });
      return pending;
    };
    expect(String(await as({ username: 'a', roles: ['USER'], clanAccess: false }))).toBe('/profile');
    expect(await as({ username: 'a', roles: ['USER'], clanAccess: true })).toBe(true);
    expect(await as({ username: 'a', roles: ['USER', 'ADMIN'], clanAccess: false })).toBe(true);
  });

  it('keeps the clans pages open with mock data', async () => {
    setup(true);
    expect(await run(clanGuard, '/wars')).toBe(true);
  });
});
