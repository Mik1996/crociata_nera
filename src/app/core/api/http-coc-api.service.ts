import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { cacheFor } from '../http/http-cache';
import { BaseResult } from '../backend/backend-api.types';
import { Clan, ClanRanks, CwlSeason, CwlSeasonSummary, HistoryPeriod, MonthSummary, PlayerProfile, RaidSeason, War } from '../models';
import { buildCwlSeason, cwlMonth, mapRaidSeason } from '../utils/cwl';
import { CocApiService } from './coc-api';
import { CocApiClient } from './coc-api-client';
import { closeExpiredWars, mapClan, mapWar, mapWarLogEntry, mergeWarHistory, mapPlayerProfile } from './coc-api.mappers';
import { errorBody, isPrivateWarLog, toApiError } from './coc-api-errors';
import { CocCapitalRaidSeason, CocClan, CocCwlSeasonRecord, CocWar, CocWarLog, CocPlayer } from './coc-api.types';

export { CocApiHttpError, toApiError } from './coc-api-errors';

/**
 * HTTP implementation of the data layer.
 *
 * Requests go to `AppConfig.apiBaseUrl`, which must point to the BACKEND PROXY (`server/`),
 * never directly to api.clashofclans.com: the API token stays server-side.
 *
 * Endpoints used:
 * - `GET {base}/clans/{tag}`              -> `/v1/clans/{tag}`
 * - `GET {base}/clans/{tag}/currentwar`   -> `/v1/clans/{tag}/currentwar`
 * - `GET {base}/clans/{tag}/warlog`       -> `/v1/clans/{tag}/warlog` (summaries only)
 * - `GET {base}/archive/wars`             -> `currentwar` snapshots saved by the proxy (with details)
 * - `GET {base}/history`                  -> list of months in the monthly history
 * - `GET {base}/history/{YYYY-MM|all}`    -> statistics for a period
 * - `GET {base}/players/{tag}`            -> `/v1/players/{tag}`
 *
 * Every other official endpoint is available, as raw responses, through `CocApiClient`.
 *
 * War history and monthly statistics come first from the application backend
 * (`{backend}/wars/archive`, `{backend}/history`), which saves every war in MongoDB; if the
 * backend cannot answer, the proxy archive above is used instead.
 *
 * Responses are cached by `cacheInterceptor`: 15 minutes by default, less for data that
 * changes during a war (see {@link CACHE}).
 */
/** Location id of the worldwide ("International") rankings. */
export const GLOBAL_LOCATION_ID = 32000006;
/** The rankings list at most the top 200 clans. */
const RANKING_SIZE = 200;

/** Raid Weekends requested from the API (about 2 months). */
const RAID_SEASONS = 10;

/** Saved wars requested from the backend for the history (the war log covers older ones). */
const ARCHIVE_LIMIT = 60;

/** Cache duration per kind of data (the others use the 15-minute default). */
const CACHE = {
  /** Attacks arrive continuously during the battle day. */
  currentWar: cacheFor({ minutes: 2 }),
  /** The proxy archives the current war every 15 minutes. */
  archive: cacheFor({ minutes: 5 }),
  /** Profiles change with every upgrade, but rarely within minutes. */
  player: cacheFor({ minutes: 10 }),
};

@Injectable()
export class HttpCocApiService extends CocApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly client = inject(CocApiClient);

  private get clanPath(): string {
    return `${this.config.apiBaseUrl}/clans/${encodeURIComponent(this.config.clanTag)}`;
  }

  getClan(): Observable<Clan> {
    return this.http.get<CocClan>(this.clanPath).pipe(map(mapClan), catchError(toApiError));
  }

  getClanRanks(): Observable<ClanRanks> {
    return this.getClan().pipe(
      switchMap((clan) =>
        forkJoin({
          local: clan.locationId ? this.rankIn(clan.locationId) : of(undefined),
          global: this.rankIn(GLOBAL_LOCATION_ID),
        }),
      ),
    );
  }

  /** Position of the clan in a location ranking: `null` beyond the top 200, `undefined` on errors. */
  private rankIn(locationId: number): Observable<number | null | undefined> {
    return this.client.clanRankings(locationId, { limit: RANKING_SIZE }).pipe(
      map((ranking) => ranking.items.find((c) => c.tag === this.config.clanTag)?.rank ?? null),
      catchError(() => of(undefined)),
    );
  }

  getCurrentWar(): Observable<War | null> {
    return this.http.get<CocWar>(`${this.clanPath}/currentwar`, { context: CACHE.currentWar }).pipe(
      map(mapWar),
      catchError((err: HttpErrorResponse) =>
        // Private war log: the API does not expose the current war.
        isPrivateWarLog(err) ? of(null) : toApiError(err),
      ),
    );
  }

  getWarHistory(): Observable<War[]> {
    const proxyArchive$ = this.http.get<CocWar[]>(`${this.config.apiBaseUrl}/archive/wars`, { context: CACHE.archive });
    const archive$ = this.http
      .get<BaseResult<CocWar[]>>(`${this.config.backendBaseUrl}/wars/archive`, {
        params: { limit: ARCHIVE_LIMIT },
        context: CACHE.archive,
      })
      .pipe(
        map((response) => response.result ?? []),
        // Backend unreachable: fall back to the proxy archive.
        catchError(() => proxyArchive$),
        map((snapshots) => snapshots.map(mapWar).filter((w): w is War => w !== null)),
        // The archive is optional: if missing, only the war log is used.
        catchError(() => of<War[]>([])),
      );
    const warLog$ = this.http.get<CocWarLog>(`${this.clanPath}/warlog`).pipe(
      map((log) => log.items.map(mapWarLogEntry).filter((w): w is War => w !== null)),
      catchError((err: HttpErrorResponse) => (isPrivateWarLog(err) ? of<War[]>([]) : toApiError(err))),
    );
    return forkJoin([archive$, warLog$]).pipe(
      map(([archived, warLog]) => mergeWarHistory(closeExpiredWars(archived, new Date()), warLog)),
    );
  }

  getHistoryMonths(): Observable<MonthSummary[]> {
    const proxy$ = this.http.get<MonthSummary[]>(`${this.config.apiBaseUrl}/history`).pipe(catchError(toApiError));
    return this.http.get<BaseResult<MonthSummary[]>>(`${this.config.backendBaseUrl}/history`).pipe(
      map((response) => response.result ?? []),
      catchError(() => proxy$),
    );
  }

  getHistoryPeriod(period: string): Observable<HistoryPeriod | null> {
    const path = `/history/${encodeURIComponent(period)}`;
    const proxy$ = this.http
      .get<HistoryPeriod>(`${this.config.apiBaseUrl}${path}`)
      .pipe(
        // 404 = no wars recorded in the month.
        catchError((err: HttpErrorResponse) => (err.status === 404 && errorBody(err) ? of(null) : toApiError(err))),
      );
    return this.http.get<BaseResult<HistoryPeriod>>(`${this.config.backendBaseUrl}${path}`).pipe(
      map((response) => response.result),
      // 404 from the backend = no wars in that month; any other failure: ask the proxy.
      catchError((err: HttpErrorResponse) => (err.status === 404 && isBackendError(err) ? of(null) : proxy$)),
    );
  }

  getPlayer(tag: string): Observable<PlayerProfile | null> {
    return this.http.get<CocPlayer>(`${this.config.apiBaseUrl}/players/${encodeURIComponent(tag)}`, { context: CACHE.player }).pipe(
      map(mapPlayerProfile),
      // 404 = the player does not exist.
      catchError((err: HttpErrorResponse) => (err.status === 404 && errorBody(err) ? of(null) : toApiError(err))),
    );
  }

  getCwlSeasons(): Observable<CwlSeasonSummary[]> {
    return this.http
      .get<BaseResult<{ season: string; state: string }[]>>(`${this.config.backendBaseUrl}/cwl/seasons`, { context: CACHE.archive })
      .pipe(
        map((response) =>
          (response.result ?? []).map((s) => ({
            season: cwlMonth(s.season),
            state: s.state === 'ended' ? ('ended' as const) : s.state === 'preparation' ? ('preparation' as const) : ('inWar' as const),
          })),
        ),
      );
  }

  getCwlSeason(season: string): Observable<CwlSeason | null> {
    return this.http
      .get<BaseResult<CocCwlSeasonRecord>>(`${this.config.backendBaseUrl}/cwl/seasons/${encodeURIComponent(season)}`, {
        context: CACHE.archive,
      })
      .pipe(
        map((response) => (response.result ? buildCwlSeason(response.result, this.config.clanTag) : null)),
        // 404 = season not recorded.
        catchError((err: HttpErrorResponse) => (err.status === 404 && isBackendError(err) ? of(null) : toApiError(err))),
      );
  }

  /**
   * From the backend, which also keeps the members of past weekends (the API lists them only
   * while a weekend is in progress); if the backend has nothing or cannot answer, from the API.
   */
  getRaidSeasons(limit = RAID_SEASONS): Observable<RaidSeason[]> {
    const api$ = this.client
      .clanCapitalRaidSeasons(this.config.clanTag, { limit })
      .pipe(map((list) => list.items));
    return this.http
      .get<BaseResult<CocCapitalRaidSeason[]>>(`${this.config.backendBaseUrl}/raids/seasons`, {
        params: { limit },
        context: CACHE.archive,
      })
      .pipe(
        map((response) => response.result ?? []),
        catchError(() => of<CocCapitalRaidSeason[]>([])),
        switchMap((saved) => (saved.length ? of(saved) : api$)),
        map((seasons) => seasons.map(mapRaidSeason)),
      );
  }

  getWar(id: string): Observable<War | null> {
    return this.getCurrentWar().pipe(
      catchError(() => of(null)),
      // If it is not the current war, look it up in the history.
      switchMap((current) =>
        current?.id === id
          ? of(current)
          : this.getWarHistory().pipe(map((wars) => wars.find((w) => w.id === id) ?? null)),
      ),
    );
  }
}

/** The backend answered with its envelope (as opposed to a proxy or network error). */
function isBackendError(err: HttpErrorResponse): boolean {
  return typeof err.error === 'object' && err.error !== null && 'status' in err.error && 'messages' in err.error;
}
