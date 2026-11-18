import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { WarHistoryRow } from '../../core/models';
import { WarService } from '../../core/services/war.service';
import { KpiCard } from '../../shared/components/kpi-card/kpi-card';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ResultBadge } from '../../shared/components/result-badge/result-badge';
import { WAR_HISTORY_FILTERS } from '../../shared/components/table/clan-tables';
import { serverTable } from '../../shared/components/table/server-table';
import { Table } from '../../shared/components/table/table';
import { ScrollFade } from '../../shared/directives/scroll-fade';

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

  /** Ended wars, filtered, sorted and paged by the backend, with the record of every war. */
  protected readonly history = serverTable({
    load: (query) => this.wars.getHistoryTable(query),
  });
  protected readonly columns = ['date', 'opponent', 'teamSize', 'result', 'stars', 'destruction'];
  protected readonly filters = WAR_HISTORY_FILTERS;

  protected open(row: WarHistoryRow): void {
    void this.router.navigate(['/wars', row.id]);
  }
}
