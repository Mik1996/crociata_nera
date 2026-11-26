import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { TableQuery } from '../../shared/components/table/table-filters';
import { TablePage, tableQueryParams } from '../../shared/components/table/table-page';
import { APP_CONFIG } from '../config/app-config';
import { noCache } from '../http/http-cache';
import {
  BaseResult,
  CwlExclusion,
  CwlSelection,
  CwlSelectionPlayer,
  CwlSelectionView,
} from './backend-api.types';

/**
 * Selections of the CWL line-up, one per season (read by every member of the clans): the open one
 * follows the live ranking, closed ones are frozen. Administrators and the leader of Crociata Nera
 * exclude players and close or reopen a selection.
 * Implementations: {@link HttpCwlSelectionService} (backend) and `MockCwlSelectionService` (demo
 * without backend), chosen by `provideCocApi`.
 */
export abstract class CwlSelectionService {
  /** The selection of a season, with the caller's permissions; the open one when `season` is left out. */
  abstract get(season?: string): Observable<CwlSelectionView>;
  /** The players of a selection as a table, filtered, sorted and paged by the backend. */
  abstract getPlayersTable(
    query: TableQuery,
    season?: string,
  ): Observable<TablePage<CwlSelectionPlayer>>;
  /**
   * Excludes a player from the open selection, or from every season `untilRevoked`
   * (`permissions.manage`); excluding again replaces reason and duration.
   */
  abstract exclude(
    tag: string,
    reason: string | null,
    untilRevoked: boolean,
  ): Observable<CwlExclusion>;
  /** Takes an excluded player back into the line-up (`permissions.manage`). */
  abstract readmit(tag: string): Observable<void>;
  /** Closes the open selection: its ranking is frozen, the next season opens (`permissions.manage`). */
  abstract close(season: string): Observable<CwlSelection>;
  /** Opens a closed selection again, while its CWL has not started (`permissions.manage`). */
  abstract reopen(season: string): Observable<CwlSelection>;
}

/** Most characters of the reason of an exclusion (same limit as the backend). */
export const MAX_EXCLUSION_REASON_LENGTH = 200;

@Injectable()
export class HttpCwlSelectionService extends CwlSelectionService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).backendBaseUrl}/cwl/selection`;

  get(season?: string): Observable<CwlSelectionView> {
    // Always fresh: the ranking follows the members, their town halls, the wars and the exclusions.
    return this.http
      .get<BaseResult<CwlSelectionView>>(this.url, {
        params: season ? { season } : {},
        context: noCache(),
      })
      .pipe(map((response) => response.result!));
  }

  getPlayersTable(query: TableQuery, season?: string): Observable<TablePage<CwlSelectionPlayer>> {
    const params = tableQueryParams(query);
    return this.http
      .get<BaseResult<TablePage<CwlSelectionPlayer>>>(`${this.url}/players`, {
        params: season ? { ...params, season } : params,
        context: noCache(),
      })
      .pipe(map((response) => response.result!));
  }

  exclude(tag: string, reason: string | null, untilRevoked: boolean): Observable<CwlExclusion> {
    return this.http
      .put<BaseResult<CwlExclusion>>(this.exclusionUrl(tag), { reason, untilRevoked })
      .pipe(map((response) => response.result!));
  }

  close(season: string): Observable<CwlSelection> {
    return this.http
      .post<BaseResult<CwlSelection>>(`${this.url}/${encodeURIComponent(season)}/close`, {})
      .pipe(map((response) => response.result!));
  }

  reopen(season: string): Observable<CwlSelection> {
    return this.http
      .post<BaseResult<CwlSelection>>(`${this.url}/${encodeURIComponent(season)}/reopen`, {})
      .pipe(map((response) => response.result!));
  }

  readmit(tag: string): Observable<void> {
    return this.http.delete<BaseResult<null>>(this.exclusionUrl(tag)).pipe(map(() => undefined));
  }

  /** The tag goes in the path without `#`. */
  private exclusionUrl(tag: string): string {
    return `${this.url}/exclusions/${encodeURIComponent(tag.replace(/^#/, ''))}`;
  }
}
