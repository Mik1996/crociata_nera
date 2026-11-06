import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CocApiService } from '../api/coc-api';
import { HistoryPeriod, MonthSummary } from '../models';

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
}
