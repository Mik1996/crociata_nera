import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TableQuery } from '../../shared/components/table/table-filters';
import { TablePage } from '../../shared/components/table/table-page';
import { CocApiService } from '../api/coc-api';
import { HistoryPeriod, MonthSummary, PeriodWarRow, RankingOptions, RankingRow } from '../models';

/** Period that sums all the months of the history. */
export const ALL_PERIODS = 'all';

/** Access to the monthly war history and the player ranking. */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly api = inject(CocApiService);

  /** Available months, most recent first. */
  getMonths(): Observable<MonthSummary[]> {
    return this.api.getHistoryMonths();
  }

  /** Wars and player stats of a month (`YYYY-MM`) or of all months (`all`). */
  getPeriod(period: string): Observable<HistoryPeriod | null> {
    return this.api.getHistoryPeriod(period);
  }

  /** A page of the ranking of a period (filtered, sorted and paged by the backend). */
  getRankingTable(
    period: string,
    options: RankingOptions,
    query: TableQuery,
  ): Observable<TablePage<RankingRow>> {
    return this.api.getRankingTable(period, options, query);
  }

  /** A page of the wars of a period (filtered, sorted and paged by the backend). */
  getWarsTable(period: string, query: TableQuery): Observable<TablePage<PeriodWarRow>> {
    return this.api.getPeriodWarsTable(period, query);
  }
}
