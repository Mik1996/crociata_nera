import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { cacheInterceptor } from './cache.interceptor';
import { CACHE_INVALIDATES, cacheFor, noCache } from './http-cache';

describe('cacheInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const T0 = new Date('2026-11-06T10:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([cacheInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  const minutes = (n: number) => vi.setSystemTime(new Date(T0.getTime() + n * 60_000));

  async function get(url: string, context?: HttpContext, reply?: unknown): Promise<unknown> {
    const result = firstValueFrom(http.get(url, { context }));
    if (reply !== undefined) httpMock.expectOne(url).flush(reply);
    return result;
  }

  it('serves GETs from the cache for 15 minutes by default', async () => {
    expect(await get('/api/coc/clans/x', undefined, { n: 1 })).toEqual({ n: 1 });

    minutes(14);
    expect(await get('/api/coc/clans/x')).toEqual({ n: 1 }); // no request: verify() would fail

    minutes(15);
    expect(await get('/api/coc/clans/x', undefined, { n: 2 })).toEqual({ n: 2 });
  });

  it('honours a per-request cache duration and noCache()', async () => {
    await get('/api/coc/currentwar', cacheFor({ minutes: 2 }), { n: 1 });
    minutes(1);
    expect(await get('/api/coc/currentwar', cacheFor({ minutes: 2 }))).toEqual({ n: 1 });
    minutes(2);
    expect(await get('/api/coc/currentwar', cacheFor({ minutes: 2 }), { n: 2 })).toEqual({ n: 2 });

    await get('/api/coc/live', noCache(), { n: 1 });
    expect(await get('/api/coc/live', noCache(), { n: 2 })).toEqual({ n: 2 });
  });

  it('keeps query parameters apart and shares identical concurrent requests', async () => {
    const a = firstValueFrom(http.get('/api/v1/wars', { params: { page: 1 } }));
    const b = firstValueFrom(http.get('/api/v1/wars', { params: { page: 1 } }));
    const c = firstValueFrom(http.get('/api/v1/wars', { params: { page: 2 } }));
    httpMock.expectOne('/api/v1/wars?page=1').flush({ page: 1 });
    httpMock.expectOne('/api/v1/wars?page=2').flush({ page: 2 });
    expect(await Promise.all([a, b, c])).toEqual([{ page: 1 }, { page: 1 }, { page: 2 }]);
  });

  it('does not cache errors', async () => {
    const failed = firstValueFrom(http.get('/api/coc/clans/x')).catch((e: unknown) => e);
    httpMock.expectOne('/api/coc/clans/x').flush(null, { status: 503, statusText: 'Unavailable' });
    await failed;
    expect(await get('/api/coc/clans/x', undefined, { ok: true })).toEqual({ ok: true });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('a successful %s invalidates the GETs of the same API', async (method) => {
    await get('/api/v1/wars', undefined, { n: 1 });
    await get('/api/coc/clans/x', undefined, { n: 1 });

    const mutation = firstValueFrom(http.request(method, '/api/v1/wars/abc', { body: {} }));
    httpMock.expectOne('/api/v1/wars/abc').flush({});
    await mutation;

    expect(await get('/api/v1/wars', undefined, { n: 2 })).toEqual({ n: 2 }); // refetched
    expect(await get('/api/coc/clans/x')).toEqual({ n: 1 }); // other API: still cached
  });

  it('a failed mutation leaves the cache alone; CACHE_INVALIDATES widens the scope', async () => {
    await get('/api/v1/wars', undefined, { n: 1 });
    await get('/api/coc/clans/x', undefined, { n: 1 });

    const failed = firstValueFrom(http.post('/api/v1/wars', {})).catch(() => null);
    httpMock.expectOne('/api/v1/wars').flush(null, { status: 400, statusText: 'Bad Request' });
    await failed;
    expect(await get('/api/v1/wars')).toEqual({ n: 1 });

    const all = firstValueFrom(http.post('/api/v1/x', {}, { context: new HttpContext().set(CACHE_INVALIDATES, ['']) }));
    httpMock.expectOne('/api/v1/x').flush({});
    await all;
    expect(await get('/api/coc/clans/x', undefined, { n: 2 })).toEqual({ n: 2 });
  });

  it('does not store a response that started before an invalidation', async () => {
    const slow = firstValueFrom(http.get('/api/v1/me'));
    const mutation = firstValueFrom(http.post('/api/v1/auth/sign-out', {}));
    httpMock.expectOne('/api/v1/auth/sign-out').flush({});
    await mutation;
    httpMock.expectOne('/api/v1/me').flush({ user: 'old' });
    await slow;

    expect(await get('/api/v1/me', undefined, { user: null })).toEqual({ user: null });
  });
});
