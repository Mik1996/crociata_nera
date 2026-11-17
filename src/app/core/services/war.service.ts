import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap, of } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { HttpCacheService } from '../http/http-cache.service';
import { ParticipantsSummary, War, WarHistoryRow, WarHistorySummary } from '../models';
import { TableQuery } from '../../shared/table/table-filters';
import { TablePage } from '../../shared/table/table-page';
import { ParticipantRow } from '../utils/war-stats';

/** Access to the clan's war data. */
@Injectable({ providedIn: 'root' })
export class WarService {
  private readonly api = inject(CocApiService);
  private readonly cache = inject(HttpCacheService);

  /** Forgets the cached war history, so the next read hits the API (manual refresh). */
  refreshHistory(): void {
    this.cache.invalidateMatching('/archive/wars');
    this.cache.invalidateMatching('/warlog');
  }

  /** Forgets the cached current war, so the next read hits the API (manual refresh). */
  refreshCurrentWar(): void {
    this.cache.invalidateMatching('/currentwar');
    this.cache.invalidateMatching('/participants');
  }

  getCurrentWar(): Observable<War | null> {
    return this.api.getCurrentWar();
  }

  /** Ended wars, most recent first (HTTP responses are cached by `cacheInterceptor`). */
  getHistory(): Observable<War[]> {
    return this.api.getWarHistory();
  }

  /** A page of the ended wars (filtered, sorted and paged by the backend), with the record of all. */
  getHistoryTable(query: TableQuery): Observable<TablePage<WarHistoryRow, WarHistorySummary>> {
    return this.api.getWarHistoryTable(query);
  }

  /** A page of the clan's players in a war (filtered, sorted and paged by the backend). */
  getParticipantsTable(
    warId: string,
    query: TableQuery,
  ): Observable<TablePage<ParticipantRow, ParticipantsSummary>> {
    return this.api.getWarParticipantsTable(warId, query);
  }

  getWar(id: string): Observable<War | null> {
    return this.api.getWar(id);
  }

  /** Most recent war: the current one if present, otherwise the last ended one. */
  getLatestWar(): Observable<War | null> {
    return this.getCurrentWar().pipe(
      switchMap((current) =>
        current ? of(current) : this.getHistory().pipe(map((history) => history[0] ?? null)),
      ),
    );
  }
}
