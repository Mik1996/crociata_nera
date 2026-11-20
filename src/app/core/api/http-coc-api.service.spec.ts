import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { CocApiService } from './coc-api';
import { CocWar, CocWarLog } from './coc-api.types';
import { HttpCacheService } from '../http/http-cache.service';
import { CocApiHttpError, HttpCocApiService } from './http-coc-api.service';

const ok = <T>(result: T) => ({
  result,
  messages: [],
  status: { code: 200, name: 'HTTP_STATUS.OK' },
});
const notFound = (key: string) => ({
  result: null,
  messages: [{ key }],
  status: { code: 404, name: 'HTTP_STATUS.NOT_FOUND' },
});

const snapshot: CocWar = {
  state: 'warEnded',
  teamSize: 1,
  preparationStartTime: '20261001T100000.000Z',
  startTime: '20261002T090000.000Z',
  endTime: '20261003T090000.000Z',
  clan: {
    tag: '#2J8JVVCLC',
    name: 'Crociata Nera',
    clanLevel: 10,
    attacks: 2,
    stars: 3,
    destructionPercentage: 100,
    members: [{ tag: '#A', name: 'A', townhallLevel: 15, mapPosition: 1, opponentAttacks: 1 }],
  },
  opponent: {
    tag: '#OPP',
    name: 'Opp',
    clanLevel: 8,
    attacks: 1,
    stars: 1,
    destructionPercentage: 50,
    members: [],
  },
};

const warLog: CocWarLog = {
  items: [
    {
      result: 'win',
      endTime: '20261003T090000.000Z',
      teamSize: 1,
      attacksPerMember: 2,
      clan: { tag: '#2J8JVVCLC', clanLevel: 10, attacks: 2, stars: 3, destructionPercentage: 100 },
      opponent: { tag: '#OPP', name: 'Opp', clanLevel: 8, stars: 1, destructionPercentage: 50 },
    },
    {
      result: 'lose',
      endTime: '20260920T090000.000Z',
      teamSize: 1,
      attacksPerMember: 2,
      clan: { tag: '#2J8JVVCLC', clanLevel: 10, attacks: 1, stars: 1, destructionPercentage: 40 },
      opponent: { tag: '#OLD', name: 'Vecchi', clanLevel: 8, stars: 3, destructionPercentage: 100 },
    },
    {
      result: null,
      endTime: '20260910T090000.000Z',
      teamSize: 15,
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
        provideCocApiTest({ useMockApi: false, clanTag: '#2J8JVVCLC' }),
      ],
    });
    api = TestBed.inject(CocApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('is selected when useMockApi is false', () => {
    expect(api).toBeInstanceOf(HttpCocApiService);
  });

  it('reads the clan from the backend and maps it; never sends a Clash of Clans token', async () => {
    const response = firstValueFrom(api.getClan());
    const req = http.expectOne('/api/v1/clan');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(ok({ tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 10, memberList: [] }));
    expect((await response).name).toBe('Crociata Nera');
    http.expectNone((r) => r.url.startsWith('/api/coc'));
  });

  it('reads the public data of the clans for the welcome page: the clan, the sisters and the rankings', async () => {
    const response = firstValueFrom(api.getWelcome());
    http.expectOne('/api/v1/welcome').flush(
      ok({
        clans: [
          {
            tag: '#2J8JVVCLC',
            name: 'Crociata Nera',
            clanLevel: 10,
            memberList: [{ name: 'Alice', role: 'leader' }],
          },
          { tag: '#2JU8RPR2G', name: 'Crociata Rossa', clanLevel: 14, memberList: [] },
        ],
        ranks: { local: 12, global: null },
      }),
    );
    const welcome = await response;
    expect(welcome.clan.members).toEqual([
      expect.objectContaining({ name: 'Alice', role: 'leader' }),
    ]);
    expect(welcome.sisters.map((c) => c.name)).toEqual(['Crociata Rossa']);
    expect(welcome.ranks).toEqual({ local: 12, global: null });
  });

  it('reads the clans of the Crusade the linked accounts are in, always fresh', async () => {
    const response = firstValueFrom(api.getMemberships());
    const membership = {
      tag: '#A',
      name: 'A',
      role: 'elder',
      townHallLevel: 17,
      clanTag: '#2J8JVVCLC',
      clanName: 'Crociata Nera',
    };
    http.expectOne('/api/v1/auth/me/memberships').flush(ok([membership]));
    expect(await response).toEqual([membership]);
  });

  it('reads a game profile from the backend; null for an unknown player', async () => {
    const missing = firstValueFrom(api.getPlayer('#NOPE'));
    http
      .expectOne('/api/v1/players/%23NOPE/profile')
      .flush(notFound('ERROR.PLAYER_NOT_FOUND'), { status: 404, statusText: 'Not Found' });
    expect(await missing).toBeNull();
  });

  it('reads the CWL seasons saved by the backend and builds the season', async () => {
    const list = firstValueFrom(api.getCwlSeasons());
    http
      .expectOne('/api/v1/cwl/seasons')
      .flush({
        result: [{ season: '2026-11', state: 'ended' }],
        messages: [],
        status: { code: 200 },
      });
    expect(await list).toEqual([{ season: '2026-11', state: 'ended' }]);

    const detail = firstValueFrom(api.getCwlSeason('2026-11'));
    http.expectOne('/api/v1/cwl/seasons/2026-11').flush({
      result: {
        season: '2026-11',
        state: 'ended',
        clanTag: '#2J8JVVCLC',
        clans: [
          { tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 18, members: [] },
          { tag: '#OPP', name: 'Opp', clanLevel: 9, members: [] },
        ],
        rounds: [{ warTags: ['#W1'] }],
        wars: [{ ...snapshot, warTag: '#W1' }],
      },
      messages: [],
      status: { code: 200 },
    });
    const season = await detail;
    expect(season!.standings[0]).toMatchObject({
      tag: '#2J8JVVCLC',
      stars: 13,
      wins: 1,
      isOwn: true,
    });
    expect(season!.players[0]).toMatchObject({ tag: '#A' });
  });

  it('a CWL season not recorded (backend 404) is null', async () => {
    const detail = firstValueFrom(api.getCwlSeason('2020-01'));
    http
      .expectOne('/api/v1/cwl/seasons/2020-01')
      .flush(
        { result: null, messages: [{ key: 'ERROR.CWL_SEASON_NOT_FOUND' }], status: { code: 404 } },
        { status: 404, statusText: 'Not Found' },
      );
    expect(await detail).toBeNull();
  });

  const raidItem = (withMembers: boolean) => ({
    state: 'ended',
    startTime: '20261030T070000.000Z',
    endTime: '20261102T070000.000Z',
    capitalTotalLoot: 1000,
    raidsCompleted: 1,
    totalAttacks: 1,
    enemyDistrictsDestroyed: 1,
    offensiveReward: 1,
    defensiveReward: 1,
    ...(withMembers
      ? {
          members: [
            {
              tag: '#A',
              name: 'A',
              attacks: 6,
              attackLimit: 5,
              bonusAttackLimit: 1,
              capitalResourcesLooted: 31000,
            },
          ],
        }
      : {}),
    attackLog: [],
    defenseLog: [],
  });

  it('reads the Raid Weekends saved by the backend, with the members of past weekends', async () => {
    const raids = firstValueFrom(api.getRaidSeasons());
    http
      .expectOne('/api/v1/raids/seasons?limit=10')
      .flush({ result: [raidItem(true)], messages: [], status: { code: 200 } });
    expect((await raids)[0]).toMatchObject({
      state: 'ended',
      hasMembers: true,
      members: [{ tag: '#A', attackLimit: 6, looted: 31000 }],
    });
  });

  it('reads the war in progress from the backend; null when the clan is not at war', async () => {
    const war = firstValueFrom(api.getCurrentWar());
    http.expectOne('/api/v1/wars/current').flush(ok({ ...snapshot, state: 'inWar' }));
    expect((await war)?.state).toBe('battle');

    const none = firstValueFrom(api.getCurrentWar());
    // Cached: ask past the cache.
    TestBed.inject(HttpCacheService).invalidateMatching('/wars/current');
    http.expectOne('/api/v1/wars/current').flush(ok(null));
    expect(await none).toBeNull();
  });

  it('turns the errors of the backend into translatable messages', async () => {
    const response = firstValueFrom(api.getClan());
    http
      .expectOne('/api/v1/clan')
      .flush(
        { result: null, messages: [{ key: 'ERROR.COC_API_UNAVAILABLE' }], status: { code: 502 } },
        { status: 502, statusText: 'Bad Gateway' },
      );
    const error = await response.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CocApiHttpError);
    expect((error as CocApiHttpError).i18nKey).toBe('ERROR.COC_API_UNAVAILABLE');
  });

  it('says the backend is unreachable when it gives no answer', async () => {
    const response = firstValueFrom(api.getClan());
    http.expectOne('/api/v1/clan').flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    const error = await response.catch((e: unknown) => e);
    expect((error as CocApiHttpError).i18nKey).toBe('auth.errors.backendUnreachable');
  });

  const ARCHIVE = '/api/v1/wars/archive?limit=60';

  it('builds the history from the wars saved by the backend, merged with the war log', async () => {
    const response = firstValueFrom(api.getWarHistory());
    http.expectOne(ARCHIVE).flush(ok([snapshot]));
    http.expectOne('/api/v1/wars/warlog').flush(ok(warLog.items));
    const history = await response;
    expect(history.map((w) => [w.opponent.tag, w.hasDetails])).toEqual([
      ['#OPP', true],
      ['#OLD', false],
    ]);
  });

  it('uses only the archive when the war log is private (empty)', async () => {
    const response = firstValueFrom(api.getWarHistory());
    http.expectOne(ARCHIVE).flush(ok([snapshot]));
    http.expectOne('/api/v1/wars/warlog').flush(ok([]));
    const history = await response;
    expect(history).toHaveLength(1);
    expect(history[0].hasDetails).toBe(true);
  });

  it('reads months and periods from the backend history', async () => {
    const months = firstValueFrom(api.getHistoryMonths());
    http
      .expectOne('/api/v1/history')
      .flush(
        ok([{ month: '2026-11', updatedAt: 'x', wars: 2, victories: 2, draws: 0, defeats: 0 }]),
      );
    expect((await months)[0].month).toBe('2026-11');

    const period = firstValueFrom(api.getHistoryPeriod('all'));
    http
      .expectOne('/api/v1/history/all')
      .flush(ok({ period: 'all', updatedAt: null, wars: [], players: [] }));
    expect((await period)?.period).toBe('all');
  });

  it('a month without wars (backend 404) returns null', async () => {
    const period = firstValueFrom(api.getHistoryPeriod('2026-01'));
    http
      .expectOne('/api/v1/history/2026-01')
      .flush(
        {
          result: null,
          messages: [{ key: 'ERROR.HISTORY_NOT_FOUND' }],
          status: { code: 404, name: 'HTTP_STATUS.NOT_FOUND' },
        },
        { status: 404, statusText: 'Not Found' },
      );
    expect(await period).toBeNull();
  });
});
