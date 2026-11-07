import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { provideCocApiTest } from '../../testing/fixtures';
import { CocApiClient } from './coc-api-client';
import { CocApiHttpError } from './coc-api-errors';

describe('CocApiClient', () => {
  let client: CocApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    client = TestBed.inject(CocApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Each endpoint: the call and the URL it must request through the proxy. */
  const cases: [string, (c: CocApiClient) => Observable<unknown>, string][] = [
    ['player', (c) => c.player('#p1abc'), '/api/coc/players/%23P1ABC'],
    ['playerBattleLog', (c) => c.playerBattleLog('#P1'), '/api/coc/players/%23P1/battlelog'],
    ['playerLeagueHistory', (c) => c.playerLeagueHistory('P1'), '/api/coc/players/%23P1/leaguehistory'],
    ['searchClans', (c) => c.searchClans({ name: 'crociata', minMembers: 10, labelIds: [56000000, 56000001] }),
      '/api/coc/clans?name=crociata&minMembers=10&labelIds=56000000,56000001'],
    ['clan', (c) => c.clan('#C1'), '/api/coc/clans/%23C1'],
    ['clanMembers', (c) => c.clanMembers('#C1', { limit: 10, after: 'abc' }), '/api/coc/clans/%23C1/members?limit=10&after=abc'],
    ['clanWarLog', (c) => c.clanWarLog('#C1', { limit: 5 }), '/api/coc/clans/%23C1/warlog?limit=5'],
    ['clanCurrentWar', (c) => c.clanCurrentWar('#C1'), '/api/coc/clans/%23C1/currentwar'],
    ['clanWarLeagueGroup', (c) => c.clanWarLeagueGroup('#C1'), '/api/coc/clans/%23C1/currentwar/leaguegroup'],
    ['clanCapitalRaidSeasons', (c) => c.clanCapitalRaidSeasons('#C1', { limit: 2 }), '/api/coc/clans/%23C1/capitalraidseasons?limit=2'],
    ['clanWarLeagueWar', (c) => c.clanWarLeagueWar('#8LGUQYPG0'), '/api/coc/clanwarleagues/wars/%238LGUQYPG0'],
    ['leagues', (c) => c.leagues(), '/api/coc/leagues'],
    ['leagueSeasons', (c) => c.leagueSeasons(29000022), '/api/coc/leagues/29000022/seasons'],
    ['leagueSeasonRankings', (c) => c.leagueSeasonRankings(29000022, '2026-10', { limit: 100 }),
      '/api/coc/leagues/29000022/seasons/2026-10?limit=100'],
    ['leagueTiers', (c) => c.leagueTiers(), '/api/coc/leaguetiers'],
    ['leagueTier', (c) => c.leagueTier(105000016), '/api/coc/leaguetiers/105000016'],
    ['warLeagues', (c) => c.warLeagues(), '/api/coc/warleagues'],
    ['warLeague', (c) => c.warLeague(48000015), '/api/coc/warleagues/48000015'],
    ['capitalLeagues', (c) => c.capitalLeagues(), '/api/coc/capitalleagues'],
    ['capitalLeague', (c) => c.capitalLeague(85000022), '/api/coc/capitalleagues/85000022'],
    ['builderBaseLeagues', (c) => c.builderBaseLeagues(), '/api/coc/builderbaseleagues'],
    ['builderBaseLeague', (c) => c.builderBaseLeague(44000041), '/api/coc/builderbaseleagues/44000041'],
    ['leagueGroup', (c) => c.leagueGroup('#G1', '2026-10'), '/api/coc/leaguegroup/%23G1/2026-10'],
    ['locations', (c) => c.locations({ limit: 50 }), '/api/coc/locations?limit=50'],
    ['location', (c) => c.location(32000120), '/api/coc/locations/32000120'],
    ['clanRankings', (c) => c.clanRankings(32000120), '/api/coc/locations/32000120/rankings/clans'],
    ['playerRankings', (c) => c.playerRankings(32000120), '/api/coc/locations/32000120/rankings/players'],
    ['clanBuilderBaseRankings', (c) => c.clanBuilderBaseRankings(32000120), '/api/coc/locations/32000120/rankings/clans-builder-base'],
    ['playerBuilderBaseRankings', (c) => c.playerBuilderBaseRankings(32000120), '/api/coc/locations/32000120/rankings/players-builder-base'],
    ['capitalRankings', (c) => c.capitalRankings(32000120), '/api/coc/locations/32000120/rankings/capitals'],
    ['goldPassSeason', (c) => c.goldPassSeason(), '/api/coc/goldpass/seasons/current'],
    ['clanLabels', (c) => c.clanLabels(), '/api/coc/labels/clans'],
    ['playerLabels', (c) => c.playerLabels({ limit: 20 }), '/api/coc/labels/players?limit=20'],
  ];

  it.each(cases)('%s requests the right endpoint through the proxy', async (_name, call, url) => {
    const response = firstValueFrom(call(client));
    const req = http.expectOne((r) => r.urlWithParams === url);
    expect(req.request.method).toBe('GET');
    req.flush({ ok: true });
    expect(await response).toEqual({ ok: true });
  });

  it('turns API errors into translatable errors', async () => {
    const response = firstValueFrom(client.clan('#C1'));
    http.expectOne('/api/coc/clans/%23C1').flush({ reason: 'requestThrottled' }, { status: 429, statusText: 'Too Many Requests' });
    const error = await response.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CocApiHttpError);
    expect((error as CocApiHttpError).i18nKey).toBe('errors.tooManyRequests');
  });
});
