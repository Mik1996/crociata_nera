import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/backend/auth.service';
import { provideCocApiTest } from './testing/fixtures';

describe('app routes', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  it.each(['/dashboard', '/current-war', '/wars', '/wars/123', '/players', '/players/%23ABC', '/statistics', '/missing'])(
    'sends signed-out users from %s to the welcome page, remembering the page',
    async (url) => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      const router = TestBed.inject(Router);
      expect(router.url.split('?')[0]).toBe('/');
      expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(url);
    },
  );

  it('opens the sign-up page while signed out', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/sign-up');
    expect(TestBed.inject(Router).url).toBe('/sign-up');
  });

  it('shows the welcome page to signed-out users', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-welcome-page');
  });

  it.each([
    ['/join', 'app-join-page'],
    ['/settings', 'app-settings-page'],
  ])('opens %s while signed out', async (url, tag) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    expect(TestBed.inject(Router).url).toBe(url);
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe(tag);
  });

  it('opens the sign-in page while signed out', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/sign-in?returnUrl=%2Fwars');
    expect(TestBed.inject(Router).url).toBe('/sign-in?returnUrl=%2Fwars');
  });

  /** Signs in (startup session restore) as a user with the given fields and navigates. */
  async function signedInAt(url: string, user: object): Promise<RouterTestingHarness> {
    TestBed.inject(AuthService).restoreSession();
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl(url);
    httpMock.expectOne('/api/v1/auth/refresh').flush({
      result: { accessToken: 't', accessTokenExpiresAt: '', user: { username: 'a', roles: ['USER'], ...user } },
      messages: [],
      status: { code: 200, name: 'HTTP_STATUS.OK' },
    });
    await navigation.catch(() => undefined);
    return harness;
  }

  it('waits for the session restore before deciding', async () => {
    await signedInAt('/statistics', { clanAccess: true });
    expect(TestBed.inject(Router).url).toBe('/statistics');
  });

  it.each(['/dashboard', '/current-war', '/cwl', '/raids', '/wars/123', '/players/%23ABC', '/statistics'])(
    'sends signed-in users outside the clans of the Crusade from %s to their profile',
    async (url) => {
      await signedInAt(url, { clanAccess: false });
      expect(TestBed.inject(Router).url).toBe('/profile');
    },
  );

  it('opens the profile to signed-in users outside the clans of the Crusade', async () => {
    const harness = await signedInAt('/profile', { clanAccess: false });
    expect(TestBed.inject(Router).url).toBe('/profile');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-profile-page');
  });
});
