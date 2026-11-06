import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, Observable } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { authGuard, guestGuard, safeReturnUrl } from './auth.guards';
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
    expect(String(await result)).toBe('/dashboard');
  });

  it('lets guests reach sign-in and sends them there from protected pages', async () => {
    setup();
    expect(await run(guestGuard)).toBe(true);
    expect(String(await run(authGuard, '/wars'))).toBe('/sign-in?returnUrl=%2Fwars');
    expect(String(await run(authGuard, '/'))).toBe('/sign-in');
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
    expect(String(await run(guestGuard))).toBe('/dashboard');
  });

  it('accepts only in-app return URLs', () => {
    setup();
    expect(safeReturnUrl('/wars/1')).toBe('/wars/1');
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '', null, undefined]) {
      expect(safeReturnUrl(bad)).toBe('/dashboard');
    }
  });
});
