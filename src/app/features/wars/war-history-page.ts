import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { War, WarResult } from '../../core/models';
import { WarService } from '../../core/services/war.service';
import { sortRows, SortState } from '../../core/utils/sort';
import { warResult } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ResultBadge } from '../../shared/components/result-badge';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { resultKey, WAR_RESULTS } from '../../shared/labels';
import { Table } from '../../shared/table/table';
import { TableFilters } from '../../shared/table/table-filters';

interface HistoryRow {
  id: string;
  date: string;
  opponent: string;
  opponentTag: string;
  teamSize: number;
  result: WarResult;
  stars: number;
  starsConceded: number;
  destruction: number;
  destructionConceded: number;
  hasDetails: boolean;
}

function rowFromWar(w: War): HistoryRow {
  return {
    id: w.id,
    date: w.endTime,
    opponent: w.opponent.name,
    opponentTag: w.opponent.tag,
    teamSize: w.teamSize,
    result: warResult(w),
    stars: w.clan.stars,
    starsConceded: w.opponent.stars,
    destruction: w.clan.destructionPercentage,
    destructionConceded: w.opponent.destructionPercentage,
    hasDetails: w.hasDetails,
  };
}

@Component({
  selector: 'crn-war-history-page',
  imports: [
    LocalDatePipe,
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatTableModule,
    MatSortModule,
    PageHeader,
    LoadState,
    KpiCard,
    ResultBadge,
    ScrollFade,
    Table,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './war-history-page.html',
  styleUrl: './war-history-page.scss',
})
export class WarHistoryPage {
  private readonly wars = inject(WarService);
  private readonly router = inject(Router);

  protected readonly resource = rxResource({ stream: () => this.wars.getHistory() });
  protected readonly columns = ['date', 'opponent', 'teamSize', 'result', 'stars', 'destruction'];

  protected readonly filters: TableFilters<HistoryRow> = {
    date: { type: 'date' },
    opponent: {
      type: 'text',
      value: (r) => [r.opponent, r.opponentTag],
      placeholder: 'history.searchPlaceholder',
    },
    teamSize: { type: 'number' },
    result: {
      type: 'select',
      options: WAR_RESULTS.map((r) => ({ value: r, label: resultKey(r) })),
    },
    stars: { type: 'number' },
    destruction: { type: 'number' },
  };

  private readonly sort = signal<SortState>({ field: 'date', direction: 'desc' });

  private readonly allRows = computed(() =>
    this.resource.hasValue() ? this.resource.value().map(rowFromWar) : [],
  );

  protected readonly record = computed(() => {
    const rows = this.allRows();
    const count = (r: WarResult) => rows.filter((x) => x.result === r).length;
    return {
      total: rows.length,
      victories: count('victory'),
      defeats: count('defeat'),
      draws: count('draw'),
    };
  });

  /** Wars sorted; the table filters them. */
  protected readonly rows = computed(() => sortRows(this.allRows(), this.sort()));

  protected updateSort(sort: Sort): void {
    this.sort.set({ field: sort.active, direction: sort.direction });
  }

  protected open(row: HistoryRow): void {
    void this.router.navigate(['/wars', row.id]);
  }
}
