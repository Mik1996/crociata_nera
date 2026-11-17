import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';
import { cacheFor, noCache } from '../http/http-cache';
import { BaseResult } from '../backend/backend-api.types';
import {
  Clan,
  ClanRanks,
  ClanRecords,
  CwlPlayerRow,
  CwlSeason,
  CwlSeasonSummary,
  DonationSeason,
  HistoryPeriod,
  MemberStatsRow,
  MemberStatsSummary,
  Membership,
  MonthSummary,
  ParticipantsSummary,
  PeriodWarRow,
  PlayerProfile,
  PublicClansData,
  RaidMemberRow,
  RaidMembersSummary,
  RaidSeason,
  RankingOptions,
  RankingRow,
  War,
  WarHistoryRow,
  WarHistorySummary,
  WarPerformance,
} from '../models';
import { TableQuery } from '../../shared/table/table-filters';
import { TablePage, tableQueryParams, TableParams } from '../../shared/table/table-page';
import { ParticipantRow } from '../utils/war-stats';
import { buildCwlSeason, cwlMonth, mapRaidSeason } from '../utils/cwl';
import { CocApiService } from './coc-api';
import {
  closeExpiredWars,
  mapClan,
  mapPlayerProfile,
  mapWar,
  mapWarLogEntry,
  mergeWarHistory,
} from './coc-api.mappers';
import { toBackendError } from './coc-api-errors';
import {
  CocCapitalRaidSeason,
  CocClan,
  CocCwlSeasonRecord,
  CocPlayer,
  CocWar,
  CocWarLogEntry,
} from './coc-api.types';

export { CocApiHttpError, toBackendError } from './coc-api-errors';

/**
 * HTTP implementation of the data layer: every read goes to the application backend
 * (`AppConfig.backendBaseUrl`, `/api/v1`), never to api.clashofclans.com (the token stays
 * server-side) nor to the old proxy. The backend reads the official API (keeping each response a
 * while) and serves what it saves in MongoDB (wars, history, CWL, Raid Weekends, donations, records).
 *
 * Responses of the official API keep its format (`GET /clan`, `/wars/current`, `/wars/warlog`,
 * `/wars/archive`, `/players/{tag}/profile`…): the mappers of `coc-api.mappers.ts` turn them into
 * the models of the site. The pages' tables are filtered, sorted and paged by the backend: one
 * request per page, sort and filter change (`get…Table`, query string from {@link tableQueryParams}).
 *
 * Responses are cached by `cacheInterceptor`: 15 minutes by default, less for data that changes
 * during a war (see {@link CACHE}).
 */

/** Raid Weekends requested (about 2 months). */
const RAID_SEASONS = 10;
/** Game seasons read by default (one year). */
const DONATION_SEASONS = 12;

/** Saved wars requested for the history (the war log covers older ones). */
const ARCHIVE_LIMIT = 60;

/** Cache duration per kind of data (the others use the 15-minute default). */
const CACHE = {
  /** Attacks arrive continuously during the battle day. */
  currentWar: cacheFor({ minutes: 2 }),
  /** Members, league, capital. */
  clan: cacheFor({ minutes: 5 }),
  /** The backend saves the current war every few minutes. */
  archive: cacheFor({ minutes: 5 }),
  /** Profiles change with every upgrade, but rarely within minutes. */
  player: cacheFor({ minutes: 10 }),
};

@Injectable()
export class HttpCocApiService extends CocApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  /** `GET` of a backend route, its `result`; errors become translatable ({@link toBackendError}). */
  private get<T>(
    path: string,
    options: { context?: HttpContext; params?: TableParams } = {},
  ): Observable<T> {
    return this.http.get<BaseResult<T>>(`${this.config.backendBaseUrl}${path}`, options).pipe(
      map((response) => response.result as T),
      catchError(toBackendError),
    );
  }

  /** {@link get}, with `null` when the backend answers 404 (something not recorded). */
  private getOrNull<T>(
    path: string,
    options: { context?: HttpContext; params?: TableParams } = {},
  ): Observable<T | null> {
    return this.http.get<BaseResult<T>>(`${this.config.backendBaseUrl}${path}`, options).pipe(
      map((response) => response.result),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 && isBackendError(err) ? of(null) : toBackendError(err),
      ),
    );
  }

  getClan(): Observable<Clan> {
    return this.get<CocClan>('/clan', { context: CACHE.clan }).pipe(map(mapClan));
  }

  getWelcome(): Observable<PublicClansData> {
    return this.get<{ clans: CocClan[]; ranks: ClanRanks }>('/welcome', {
      context: CACHE.clan,
    }).pipe(
      map(({ clans, ranks }) => {
        const [clan, ...sisters] = clans.map(mapClan);
        return { clan: clan!, sisters, ranks };
      }),
    );
  }

  getMemberships(): Observable<Membership[]> {
    // Follows the links and unlinks made on the profile page.
    return this.get<Membership[]>('/auth/me/memberships', { context: noCache() });
  }

  /** Only the backend has them: it keeps the best values ever read from the API. */
  getClanRecords(): Observable<ClanRecords> {
    return this.get<ClanRecords>('/clan/records', { context: CACHE.archive });
  }

  getCurrentWar(): Observable<War | null> {
    return this.get<CocWar | null>('/wars/current', { context: CACHE.currentWar }).pipe(
      // `null`: not at war, or private war log.
      map((war) => (war ? mapWar(war) : null)),
    );
  }

  /** Saved wars (with players and attacks), completed by the war log (summaries of the older ones). */
  getWarHistory(): Observable<War[]> {
    const archive$ = this.get<CocWar[]>('/wars/archive', {
      params: { limit: String(ARCHIVE_LIMIT) },
      context: CACHE.archive,
    }).pipe(map((snapshots) => snapshots.map(mapWar).filter((w): w is War => w !== null)));
    const warLog$ = this.get<CocWarLogEntry[]>('/wars/warlog', { context: CACHE.archive }).pipe(
      map((items) => items.map(mapWarLogEntry).filter((w): w is War => w !== null)),
    );
    return forkJoin([archive$, warLog$]).pipe(
      map(([archived, warLog]) => mergeWarHistory(closeExpiredWars(archived, new Date()), warLog)),
    );
  }

  getHistoryMonths(): Observable<MonthSummary[]> {
    return this.get<MonthSummary[]>('/history');
  }

  getHistoryPeriod(period: string): Observable<HistoryPeriod | null> {
    // 404 = no wars in that month.
    return this.getOrNull<HistoryPeriod>(`/history/${encodeURIComponent(period)}`);
  }

  getPlayer(tag: string): Observable<PlayerProfile | null> {
    // 404 = the player does not exist.
    return this.getOrNull<CocPlayer>(`/players/${encodeURIComponent(tag)}/profile`, {
      context: CACHE.player,
    }).pipe(map((player) => (player ? mapPlayerProfile(player) : null)));
  }

  getCwlSeasons(): Observable<CwlSeasonSummary[]> {
    return this.get<{ season: string; state: string }[]>('/cwl/seasons', {
      context: CACHE.archive,
    }).pipe(
      map((seasons) =>
        seasons.map((s) => ({
          season: cwlMonth(s.season),
          state:
            s.state === 'ended'
              ? ('ended' as const)
              : s.state === 'preparation'
                ? ('preparation' as const)
                : ('inWar' as const),
        })),
      ),
    );
  }

  getCwlSeason(season: string): Observable<CwlSeason | null> {
    // 404 = season not recorded.
    return this.getOrNull<CocCwlSeasonRecord>(`/cwl/seasons/${encodeURIComponent(season)}`, {
      context: CACHE.archive,
    }).pipe(map((record) => (record ? buildCwlSeason(record, this.config.clanTag) : null)));
  }

  /** Only the backend has them: the API knows the current counters, reset when a player leaves. */
  getDonationSeasons(limit = DONATION_SEASONS): Observable<DonationSeason[]> {
    return this.get<DonationSeason[]>('/donations/seasons', {
      params: { limit: String(limit) },
      context: CACHE.archive,
    });
  }

  /**
   * Saved by the backend, which also keeps the members of past weekends (the API lists them only
   * while a weekend is in progress); with none saved yet, the backend gives those of the API.
   */
  getRaidSeasons(limit = RAID_SEASONS): Observable<RaidSeason[]> {
    return this.get<CocCapitalRaidSeason[]>('/raids/seasons', {
      params: { limit: String(limit) },
      context: CACHE.archive,
    }).pipe(map((seasons) => seasons.map(mapRaidSeason)));
  }

  // --- Tables ---------------------------------------------------------------------------------

  /** A page of a backend table route (`path` below the backend's base URL). */
  private table<T, S = undefined>(
    path: string,
    query: TableQuery,
    context = CACHE.archive,
    extra: TableParams = {},
  ): Observable<TablePage<T, S>> {
    return this.get<TablePage<T, S>>(path, {
      params: { ...tableQueryParams(query), ...extra },
      context,
    });
  }

  getWarHistoryTable(query: TableQuery): Observable<TablePage<WarHistoryRow, WarHistorySummary>> {
    return this.table('/wars/history', query);
  }

  getWarParticipantsTable(
    warId: string,
    query: TableQuery,
  ): Observable<TablePage<ParticipantRow, ParticipantsSummary>> {
    // The war in progress changes during the battle day.
    return this.table(`/wars/${encodeURIComponent(warId)}/participants`, query, CACHE.currentWar);
  }

  getMemberStatsTable(
    query: TableQuery,
  ): Observable<TablePage<MemberStatsRow, MemberStatsSummary>> {
    return this.table('/players', query, CACHE.currentWar);
  }

  getPlayerWarsTable(tag: string, query: TableQuery): Observable<TablePage<WarPerformance>> {
    return this.table(`/players/${encodeURIComponent(tag)}/wars`, query);
  }

  getRankingTable(
    period: string,
    options: RankingOptions,
    query: TableQuery,
  ): Observable<TablePage<RankingRow>> {
    return this.table(`/history/${encodeURIComponent(period)}/ranking`, query, CACHE.archive, {
      minWars: String(options.minWars),
      currentMembersOnly: String(options.currentMembersOnly),
    });
  }

  getPeriodWarsTable(period: string, query: TableQuery): Observable<TablePage<PeriodWarRow>> {
    return this.table(`/history/${encodeURIComponent(period)}/wars`, query);
  }

  getCwlPlayersTable(season: string, query: TableQuery): Observable<TablePage<CwlPlayerRow>> {
    return this.table(`/cwl/seasons/${encodeURIComponent(season)}/players`, query);
  }

  getRaidMembersTable(
    weekend: string,
    query: TableQuery,
  ): Observable<TablePage<RaidMemberRow, RaidMembersSummary>> {
    return this.table(`/raids/seasons/${encodeURIComponent(weekend)}/members`, query);
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

/** The backend answered with its envelope (as opposed to a network error). */
function isBackendError(err: HttpErrorResponse): boolean {
  return (
    typeof err.error === 'object' &&
    err.error !== null &&
    'status' in err.error &&
    'messages' in err.error
  );
}
