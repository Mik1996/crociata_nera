import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { provideCocApiTest, sampleWar } from '../../testing/fixtures';
import { CocApiService } from '../api/coc-api';
import { MockCocApiService } from '../api/mock-coc-api.service';
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

  it('caches the history and reloads it after refreshHistory()', async () => {
    const spy = vi.spyOn(api, 'getWarHistory');
    service.refreshHistory();
    await firstValueFrom(service.getHistory());
    await firstValueFrom(service.getHistory());
    expect(spy).toHaveBeenCalledTimes(1);
    service.refreshHistory();
    await firstValueFrom(service.getHistory());
    expect(spy).toHaveBeenCalledTimes(2);
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
