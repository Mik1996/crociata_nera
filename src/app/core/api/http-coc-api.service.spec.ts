import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { CocApiService } from './coc-api';
import { CocWar, CocWarLog } from './coc-api.types';
import { CocApiHttpError, HttpCocApiService } from './http-coc-api.service';

const CLAN = '/proxy/clans/%232J8JVVCLC';

const snapshot: CocWar = {
  state: 'warEnded',
  teamSize: 1,
  preparationStartTime: '20261001T100000.000Z',
  startTime: '20261002T090000.000Z',
  endTime: '20261003T090000.000Z',
  clan: {
    tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 10, attacks: 2, stars: 3, destructionPercentage: 100,
    members: [{ tag: '#A', name: 'A', townhallLevel: 15, mapPosition: 1, opponentAttacks: 1 }],
  },
  opponent: { tag: '#OPP', name: 'Opp', clanLevel: 8, attacks: 1, stars: 1, destructionPercentage: 50, members: [] },
};

const warLog: CocWarLog = {
  items: [
    {
      result: 'win', endTime: '20261003T090000.000Z', teamSize: 1, attacksPerMember: 2,
      clan: { tag: '#2J8JVVCLC', clanLevel: 10, attacks: 2, stars: 3, destructionPercentage: 100 },
      opponent: { tag: '#OPP', name: 'Opp', clanLevel: 8, stars: 1, destructionPercentage: 50 },
    },
    {
      result: 'lose', endTime: '20260920T090000.000Z', teamSize: 1, attacksPerMember: 2,
      clan: { tag: '#2J8JVVCLC', clanLevel: 10, attacks: 1, stars: 1, destructionPercentage: 40 },
      opponent: { tag: '#OLD', name: 'Vecchi', clanLevel: 8, stars: 3, destructionPercentage: 100 },
    },
    {
      result: null, endTime: '20260910T090000.000Z', teamSize: 15,
      clan: { tag: '#2J8JVVCLC', clanLevel: 10, stars: 20, destructionPercentage: 70 },
      opponent: { clanLevel: 0, stars: 0, destructionPercentage: 0 },
    },
  ],
};

describe('HttpCocApiService', () => {
  let api: CocApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false, clanTag: '#2J8JVVCLC', apiBaseUrl: '/proxy' }),
      ],
    });
    api = TestBed.inject(CocApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('is selected when useMockApi is false', () => {
    expect(api).toBeInstanceOf(HttpCocApiService);
  });

  it('encodes the clan tag and maps the response', async () => {
    const response = firstValueFrom(api.getClan());
    const req = http.expectOne(CLAN);
    expect(req.request.method).toBe('GET');
    // The token must never be sent from the frontend.
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 10, memberList: [] });
    expect((await response).name).toBe('Crociata Nera');
  });

  it('treats a private war log (403 accessDenied) as no war', async () => {
    const response = firstValueFrom(api.getCurrentWar());
    http.expectOne(`${CLAN}/currentwar`).flush({ reason: 'accessDenied' }, { status: 403, statusText: 'Forbidden' });
    expect(await response).toBeNull();
  });

  it('reports an unauthorised IP instead of hiding it as a private war log', async () => {
    const response = firstValueFrom(api.getCurrentWar());
    http
      .expectOne(`${CLAN}/currentwar`)
      .flush(
        { reason: 'accessDenied.invalidIp', message: 'API key does not allow access from IP 1.2.3.4' },
        { status: 403, statusText: 'Forbidden' },
      );
    const error = await response.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CocApiHttpError);
    expect((error as CocApiHttpError).reason).toBe('accessDenied.invalidIp');
    expect((error as CocApiHttpError).message).toContain('1.2.3.4');
    expect((error as CocApiHttpError).i18nKey).toBe('errors.invalidIp');
    expect((error as CocApiHttpError).i18nParams).toEqual({ detail: 'API key does not allow access from IP 1.2.3.4' });
  });

  it('suggests starting the proxy when it is unreachable', async () => {
    const response = firstValueFrom(api.getClan());
    http.expectOne(CLAN).flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    await expect(response).rejects.toThrow('npm run server');
  });

  it('turns HTTP errors into readable messages', async () => {
    const response = firstValueFrom(api.getClan());
    http.expectOne(CLAN).flush({ reason: 'inMaintenance' }, { status: 503, statusText: 'Maintenance' });
    await expect(response).rejects.toThrow('maintenance');
  });

  it('merges archive and war log, discarding CWL entries', async () => {
    const response = firstValueFrom(api.getWarHistory());
    http.expectOne('/proxy/archive/wars').flush([snapshot]);
    http.expectOne(`${CLAN}/warlog`).flush(warLog);
    const history = await response;
    expect(history.map((w) => [w.opponent.tag, w.hasDetails])).toEqual([
      ['#OPP', true],
      ['#OLD', false],
    ]);
  });

  it('uses only the war log when the proxy archive is unavailable', async () => {
    const response = firstValueFrom(api.getWarHistory());
    http.expectOne('/proxy/archive/wars').flush({}, { status: 404, statusText: 'Not Found' });
    http.expectOne(`${CLAN}/warlog`).flush(warLog);
    expect((await response).every((w) => !w.hasDetails)).toBe(true);
  });

  it('uses only the archive when the war log is private', async () => {
    const response = firstValueFrom(api.getWarHistory());
    http.expectOne('/proxy/archive/wars').flush([snapshot]);
    http.expectOne(`${CLAN}/warlog`).flush({ reason: 'accessDenied' }, { status: 403, statusText: 'Forbidden' });
    const history = await response;
    expect(history).toHaveLength(1);
    expect(history[0].hasDetails).toBe(true);
  });

  it('reads the month list and period data from the proxy history', async () => {
    const months = firstValueFrom(api.getHistoryMonths());
    http.expectOne('/proxy/history').flush([{ month: '2026-11', updatedAt: 'x', wars: 2, victories: 2, draws: 0, defeats: 0 }]);
    expect((await months)[0].month).toBe('2026-11');

    const period = firstValueFrom(api.getHistoryPeriod('all'));
    http.expectOne('/proxy/history/all').flush({ period: 'all', updatedAt: null, wars: [], players: [] });
    expect((await period)?.period).toBe('all');
  });

  it('a month without wars (proxy 404) returns null', async () => {
    const period = firstValueFrom(api.getHistoryPeriod('2026-01'));
    http.expectOne('/proxy/history/2026-01').flush({ reason: 'notFound' }, { status: 404, statusText: 'Not Found' });
    expect(await period).toBeNull();
  });
});
