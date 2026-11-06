import { HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { provideCocApiTest, sampleWar } from '../../testing/fixtures';
import { CocApiService } from '../api/coc-api';
import { MockCocApiService } from '../api/mock-coc-api.service';
import { HttpCacheService } from '../http/http-cache.service';
import { WarService } from './war.service';

describe('WarService', () => {
  let service: WarService;
  let api: CocApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideCocApiTest()] });
    service = TestBed.inject(WarService);
    api = TestBed.inject(CocApiService);
  });

  it('uses the mock when useMockApi is true', () => {
    expect(api).toBeInstanceOf(MockCocApiService);
  });

  it('returns the history with only ended wars, most recent first', async () => {
    const history = await firstValueFrom(service.getHistory());
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((w) => w.state === 'ended')).toBe(true);
    expect(history[0].endTime >= history[history.length - 1].endTime).toBe(true);
  });

  it('refreshHistory() and refreshCurrentWar() drop the cached responses they concern', () => {
    const cache = TestBed.inject(HttpCacheService);
    const response = new HttpResponse({ status: 200, body: [] });
    for (const url of ['/api/coc/archive/wars', '/api/coc/clans/%23X/warlog', '/api/coc/clans/%23X/currentwar', '/api/coc/clans/%23X']) {
      cache.set(url, response, 60_000, cache.currentGeneration);
    }

    service.refreshHistory();
    expect(cache.get('/api/coc/archive/wars')).toBeNull();
    expect(cache.get('/api/coc/clans/%23X/warlog')).toBeNull();
    expect(cache.get('/api/coc/clans/%23X/currentwar')).not.toBeNull();

    service.refreshCurrentWar();
    expect(cache.get('/api/coc/clans/%23X/currentwar')).toBeNull();
    expect(cache.get('/api/coc/clans/%23X')).not.toBeNull();
  });

  it('getLatestWar prefers the current war', async () => {
    const latest = await firstValueFrom(service.getLatestWar());
    expect(latest?.state).toBe('battle');
  });

  it('getLatestWar falls back to the last ended war when no war is in progress', async () => {
    const ended = sampleWar();
    vi.spyOn(api, 'getCurrentWar').mockReturnValue(of(null));
    vi.spyOn(api, 'getWarHistory').mockReturnValue(of([ended]));
    service.refreshHistory();
    expect(await firstValueFrom(service.getLatestWar())).toEqual(ended);
  });

  it('getWar finds a war by id and returns null when missing', async () => {
    const [first] = await firstValueFrom(service.getHistory());
    expect((await firstValueFrom(service.getWar(first.id)))?.id).toBe(first.id);
    expect(await firstValueFrom(service.getWar('missing'))).toBeNull();
  });
});
