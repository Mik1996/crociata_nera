import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { War, WarResult } from '../../core/models';
import { WarService } from '../../core/services/war.service';
import { matchesText, sortRows, SortState } from '../../core/utils/sort';
import { warResult } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ResultBadge } from '../../shared/components/result-badge';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TABLE_WRAP } from '../../shared/directives/table-wrap';

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

type ResultFilter = 'all' | WarResult;

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
  selector: 'app-war-history-page',
  imports: [
    TABLE_WRAP,
    LocalDatePipe,
    LocalNumberPipe,
    TranslatePipe,
    FormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonToggleModule,
    PageHeader,
    LoadState,
    KpiCard,
    ResultBadge,
    ScrollFade,
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

  protected readonly search = signal('');
  protected readonly resultFilter = signal<ResultFilter>('all');
  private readonly sort = signal<SortState>({ field: 'date', direction: 'desc' });
  protected readonly page = signal({ index: 0, size: 10 });

  private readonly rows = computed(() => (this.resource.hasValue() ? this.resource.value().map(rowFromWar) : []));

  protected readonly record = computed(() => {
    const rows = this.rows();
    const count = (r: WarResult) => rows.filter((x) => x.result === r).length;
    return { total: rows.length, victories: count('victory'), defeats: count('defeat'), draws: count('draw') };
  });

  protected readonly filteredRows = computed(() => {
    const search = this.search();
    const result = this.resultFilter();
    const filtered = this.rows().filter(
      (r) =>
        (result === 'all' || r.result === result) &&
        (!search || matchesText(r.opponent, search) || matchesText(r.opponentTag, search)),
    );
    return sortRows(filtered, this.sort());
  });

  protected readonly pageRows = computed(() => {
    const { index, size } = this.page();
    return this.filteredRows().slice(index * size, (index + 1) * size);
  });

  protected updateSearch(value: string): void {
    this.search.set(value);
    this.goToFirstPage();
  }

  protected updateFilter(value: ResultFilter): void {
    this.resultFilter.set(value);
    this.goToFirstPage();
  }

  protected updateSort(sort: Sort): void {
    this.sort.set({ field: sort.active, direction: sort.direction });
    this.goToFirstPage();
  }

  protected changePage(event: PageEvent): void {
    this.page.set({ index: event.pageIndex, size: event.pageSize });
  }

  protected open(row: HistoryRow): void {
    void this.router.navigate(['/wars', row.id]);
  }

  private goToFirstPage(): void {
    this.page.update((p) => ({ ...p, index: 0 }));
  }
}
