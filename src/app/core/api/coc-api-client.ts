import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { cacheFor } from '../http/http-cache';
import {
  CocBattleLogEntry,
  CocCapitalRaidSeason,
  CocClan,
  CocClanMember,
  CocClanRanking,
  CocClanSearchQuery,
  CocClanWarLeagueGroup,
  CocClanWarLeagueWar,
  CocGoldPassSeason,
  CocLabel,
  CocLeague,
  CocLeagueHistoryEntry,
  CocLeagueSeason,
  CocList,
  CocLocation,
  CocPageQuery,
  CocPlayer,
  CocPlayerBuilderBaseRanking,
  CocPlayerRanking,
  CocUntypedResponse,
  CocWar,
  CocWarLog,
} from './coc-api.types';
import { toApiError } from './coc-api-errors';

/** Cache durations, aligned with how often the data changes (and with the proxy cache). */
const CACHE = {
  /** Wars and live clan data. */
  live: cacheFor({ minutes: 2 }),
  /** Profiles, clans, members. */
  standard: cacheFor({ minutes: 10 }),
  /** Rankings and raid seasons. */
  rankings: cacheFor({ minutes: 30 }),
  /** Leagues, tiers and locations: practically static. */
  static: cacheFor({ minutes: 24 * 60 }),
};

type QueryValue = string | number | number[] | undefined;

/**
 * Raw client for every GET endpoint of the official Clash of Clans API, through the proxy
 * (`AppConfig.apiBaseUrl`, never api.clashofclans.com directly: the token stays server-side).
 *
 * Responses are the API JSON as-is (`coc-api.types.ts`); the app pages use the domain models of
 * {@link CocApiService} instead. Errors become `CocApiHttpError` with a translatable message.
 * Tags are passed with the `#` (e.g. `#2J8JVVCLC`) and encoded here.
 */
@Injectable({ providedIn: 'root' })
export class CocApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).apiBaseUrl;

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  /** `GET /players/{playerTag}` */
  player(playerTag: string): Observable<CocPlayer> {
    return this.get(`/players/${tag(playerTag)}`, CACHE.standard);
  }

  /** `GET /players/{playerTag}/battlelog`: recent multiplayer attacks and defenses. */
  playerBattleLog(playerTag: string): Observable<CocList<CocBattleLogEntry>> {
    return this.get(`/players/${tag(playerTag)}/battlelog`, CACHE.live);
  }

  /** `GET /players/{playerTag}/leaguehistory`: results of the past league seasons. */
  playerLeagueHistory(playerTag: string): Observable<CocList<CocLeagueHistoryEntry>> {
    return this.get(`/players/${tag(playerTag)}/leaguehistory`, CACHE.rankings);
  }

  // -------------------------------------------------------------------------
  // Clans
  // -------------------------------------------------------------------------

  /** `GET /clans`: clan search (at least one filter is required by the API). */
  searchClans(query: CocClanSearchQuery): Observable<CocList<CocClan>> {
    return this.get('/clans', CACHE.standard, query);
  }

  /** `GET /clans/{clanTag}` */
  clan(clanTag: string): Observable<CocClan> {
    return this.get(`/clans/${tag(clanTag)}`, CACHE.standard);
  }

  /** `GET /clans/{clanTag}/members` */
  clanMembers(clanTag: string, page?: CocPageQuery): Observable<CocList<CocClanMember>> {
    return this.get(`/clans/${tag(clanTag)}/members`, CACHE.standard, page);
  }

  /** `GET /clans/{clanTag}/warlog` (403 `accessDenied` if the war log is private). */
  clanWarLog(clanTag: string, page?: CocPageQuery): Observable<CocWarLog> {
    return this.get(`/clans/${tag(clanTag)}/warlog`, CACHE.standard, page);
  }

  /** `GET /clans/{clanTag}/currentwar` */
  clanCurrentWar(clanTag: string): Observable<CocWar> {
    return this.get(`/clans/${tag(clanTag)}/currentwar`, CACHE.live);
  }

  /** `GET /clans/{clanTag}/currentwar/leaguegroup`: Clan War League group of the season. */
  clanWarLeagueGroup(clanTag: string): Observable<CocClanWarLeagueGroup> {
    return this.get(`/clans/${tag(clanTag)}/currentwar/leaguegroup`, CACHE.live);
  }

  /** `GET /clans/{clanTag}/capitalraidseasons`: Raid Weekends, most recent first. */
  clanCapitalRaidSeasons(clanTag: string, page?: CocPageQuery): Observable<CocList<CocCapitalRaidSeason>> {
    return this.get(`/clans/${tag(clanTag)}/capitalraidseasons`, CACHE.rankings, page);
  }

  /** `GET /clanwarleagues/wars/{warTag}`: a Clan War League war (tags from {@link clanWarLeagueGroup} rounds). */
  clanWarLeagueWar(warTag: string): Observable<CocClanWarLeagueWar> {
    return this.get(`/clanwarleagues/wars/${tag(warTag)}`, CACHE.live);
  }

  // -------------------------------------------------------------------------
  // Leagues
  // -------------------------------------------------------------------------

  /** `GET /leagues`: home village leagues. */
  leagues(page?: CocPageQuery): Observable<CocList<CocLeague>> {
    return this.get('/leagues', CACHE.static, page);
  }

  /** `GET /leagues/{leagueId}/seasons`: Legend League seasons. */
  leagueSeasons(leagueId: number, page?: CocPageQuery): Observable<CocList<CocLeagueSeason>> {
    return this.get(`/leagues/${id(leagueId)}/seasons`, CACHE.static, page);
  }

  /**
   * `GET /leagues/{leagueId}/seasons/{seasonId}`: player ranking of a Legend League season (`YYYY-MM`).
   * The API requires `limit` between 100 and 25 000 (the proxy accepts up to 1 000).
   */
  leagueSeasonRankings(leagueId: number, seasonId: string, page?: CocPageQuery): Observable<CocList<CocPlayerRanking>> {
    return this.get(`/leagues/${id(leagueId)}/seasons/${encodeURIComponent(seasonId)}`, CACHE.rankings, page);
  }

  /** `GET /leaguetiers` */
  leagueTiers(page?: CocPageQuery): Observable<CocList<CocLeague>> {
    return this.get('/leaguetiers', CACHE.static, page);
  }

  /** `GET /leaguetiers/{leagueTierId}` */
  leagueTier(leagueTierId: number): Observable<CocLeague> {
    return this.get(`/leaguetiers/${id(leagueTierId)}`, CACHE.static);
  }

  /** `GET /warleagues`: Clan War Leagues. */
  warLeagues(page?: CocPageQuery): Observable<CocList<CocLeague>> {
    return this.get('/warleagues', CACHE.static, page);
  }

  /** `GET /warleagues/{leagueId}` */
  warLeague(leagueId: number): Observable<CocLeague> {
    return this.get(`/warleagues/${id(leagueId)}`, CACHE.static);
  }

  /** `GET /capitalleagues` */
  capitalLeagues(page?: CocPageQuery): Observable<CocList<CocLeague>> {
    return this.get('/capitalleagues', CACHE.static, page);
  }

  /** `GET /capitalleagues/{leagueId}` */
  capitalLeague(leagueId: number): Observable<CocLeague> {
    return this.get(`/capitalleagues/${id(leagueId)}`, CACHE.static);
  }

  /** `GET /builderbaseleagues` */
  builderBaseLeagues(page?: CocPageQuery): Observable<CocList<CocLeague>> {
    return this.get('/builderbaseleagues', CACHE.static, page);
  }

  /** `GET /builderbaseleagues/{leagueId}` */
  builderBaseLeague(leagueId: number): Observable<CocLeague> {
    return this.get(`/builderbaseleagues/${id(leagueId)}`, CACHE.static);
  }

  /** `GET /leaguegroup/{leagueGroupTag}/{leagueSeasonId}` */
  leagueGroup(leagueGroupTag: string, leagueSeasonId: string): Observable<CocUntypedResponse> {
    return this.get(`/leaguegroup/${tag(leagueGroupTag)}/${encodeURIComponent(leagueSeasonId)}`, CACHE.live);
  }

  // -------------------------------------------------------------------------
  // Locations and rankings
  // -------------------------------------------------------------------------

  /** `GET /locations` */
  locations(page?: CocPageQuery): Observable<CocList<CocLocation>> {
    return this.get('/locations', CACHE.static, page);
  }

  /** `GET /locations/{locationId}` */
  location(locationId: number): Observable<CocLocation> {
    return this.get(`/locations/${id(locationId)}`, CACHE.static);
  }

  /** `GET /locations/{locationId}/rankings/clans` */
  clanRankings(locationId: number, page?: CocPageQuery): Observable<CocList<CocClanRanking>> {
    return this.get(`/locations/${id(locationId)}/rankings/clans`, CACHE.rankings, page);
  }

  /** `GET /locations/{locationId}/rankings/players` */
  playerRankings(locationId: number, page?: CocPageQuery): Observable<CocList<CocPlayerRanking>> {
    return this.get(`/locations/${id(locationId)}/rankings/players`, CACHE.rankings, page);
  }

  /** `GET /locations/{locationId}/rankings/clans-builder-base` */
  clanBuilderBaseRankings(locationId: number, page?: CocPageQuery): Observable<CocList<CocClanRanking>> {
    return this.get(`/locations/${id(locationId)}/rankings/clans-builder-base`, CACHE.rankings, page);
  }

  /** `GET /locations/{locationId}/rankings/players-builder-base` */
  playerBuilderBaseRankings(locationId: number, page?: CocPageQuery): Observable<CocList<CocPlayerBuilderBaseRanking>> {
    return this.get(`/locations/${id(locationId)}/rankings/players-builder-base`, CACHE.rankings, page);
  }

  /** `GET /locations/{locationId}/rankings/capitals` */
  capitalRankings(locationId: number, page?: CocPageQuery): Observable<CocList<CocClanRanking>> {
    return this.get(`/locations/${id(locationId)}/rankings/capitals`, CACHE.rankings, page);
  }

  // -------------------------------------------------------------------------
  // Gold Pass and labels
  // -------------------------------------------------------------------------

  /** `GET /goldpass/seasons/current` */
  goldPassSeason(): Observable<CocGoldPassSeason> {
    return this.get('/goldpass/seasons/current', CACHE.static);
  }

  /** `GET /labels/clans` */
  clanLabels(page?: CocPageQuery): Observable<CocList<CocLabel>> {
    return this.get('/labels/clans', CACHE.static, page);
  }

  /** `GET /labels/players` */
  playerLabels(page?: CocPageQuery): Observable<CocList<CocLabel>> {
    return this.get('/labels/players', CACHE.static, page);
  }

  // -------------------------------------------------------------------------

  private get<T>(path: string, context: HttpContext, query: CocPageQuery | CocClanSearchQuery = {}): Observable<T> {
    return this.http
      .get<T>(`${this.baseUrl}${path}`, { params: toParams(query), context })
      .pipe(catchError((err: HttpErrorResponse) => toApiError(err)));
  }
}

/** `#2J8JVVCLC` -> `%232J8JVVCLC` (tags are case-insensitive: upper-cased). */
function tag(value: string): string {
  const normalized = value.trim().toUpperCase();
  return encodeURIComponent(normalized.startsWith('#') ? normalized : `#${normalized}`);
}

function id(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid id: ${value}`);
  return String(value);
}

/** Query parameters without empty values; arrays become comma-separated lists. */
function toParams(query: CocPageQuery | CocClanSearchQuery): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query) as [string, QueryValue][]) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    params = params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return params;
}
