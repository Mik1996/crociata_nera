import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CocWar } from '../api/coc-api.types';
import { provideCocApiTest } from '../../testing/fixtures';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { SYNCED_WARS_STORAGE_KEY, warKey, WarSyncService } from './war-sync.service';

const war = (overrides: Partial<CocWar> = {}): CocWar => ({
  state: 'inWar',
  teamSize: 1,
  preparationStartTime: '20261104T100000.000Z',
  startTime: '20261105T100000.000Z',
  endTime: '20261106T100000.000Z',
  clan: { tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 10, attacks: 0, stars: 0, destructionPercentage: 0, members: [] },
  opponent: { tag: '#OPP999', name: 'Rivals', clanLevel: 8, attacks: 0, stars: 0, destructionPercentage: 0, members: [] },
  ...overrides,
});

const signedIn = {
  result: {
    accessToken: 'tok',
    accessTokenExpiresAt: '',
    user: { id: '1', email: 'a@b.io', username: 'a', roles: ['USER'], playerTag: null, emailVerified: false, createdAt: '' },
  },
  messages: [],
  status: { code: 200, name: 'HTTP_STATUS.OK' },
};

describe('WarSyncService', () => {
  let sync: WarSyncService;
  let httpMock: HttpTestingController;

  function signIn(): void {
    TestBed.inject(AuthService).restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(signedIn);
    TestBed.tick();
  }

  beforeEach(() => {
    localStorage.removeItem(SYNCED_WARS_STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
      ],
    });
    sync = TestBed.inject(WarSyncService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('uses the same war key as the proxy archive and the backend', () => {
    expect(warKey(war())).toBe('20261104T100000-OPP999');
    expect(warKey(war({ state: 'notInWar' }))).toBeNull();
  });

  it('sends nothing while signed out, then sends the pending war on sign-in', () => {
    sync.submit(war());
    httpMock.expectNone('/api/v1/wars');

    signIn();
    const req = httpMock.expectOne('/api/v1/wars');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    expect(req.request.body).toEqual(war());
    req.flush({});
  });

  it('sends a war again only when it changes', () => {
    signIn();
    sync.submit(war());
    httpMock.expectOne('/api/v1/wars').flush({});

    sync.submit(war());
    httpMock.expectNone('/api/v1/wars');

    sync.submit(war({ clan: { ...war().clan!, stars: 3, attacks: 1 } }));
    httpMock.expectOne('/api/v1/wars').flush({});
  });

  it('retries after a failure and ignores wars that cannot be saved', () => {
    signIn();
    sync.submit(war({ state: 'notInWar' }));
    httpMock.expectNone('/api/v1/wars');

    sync.submit(war());
    httpMock.expectOne('/api/v1/wars').flush(null, { status: 503, statusText: 'Unavailable' });
    sync.submit(war());
    httpMock.expectOne('/api/v1/wars').flush({});
  });

  it('remembers ended wars across visits', () => {
    signIn();
    sync.submit(war({ state: 'warEnded' }));
    httpMock.expectOne('/api/v1/wars').flush({});

    expect(JSON.parse(localStorage.getItem(SYNCED_WARS_STORAGE_KEY)!)).toEqual(['20261104T100000-OPP999']);
  });
});
