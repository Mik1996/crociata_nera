import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { WarService } from '../../core/services/war.service';
import { computeWarKpi, participantRows } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { WarParticipantsTable } from './components/war-participants-table';
import { WarSummary } from './components/war-summary';
import { ScrollFade } from '../../shared/directives/scroll-fade';

@Component({
  selector: 'app-war-detail-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    LoadState,
    KpiCard,
    WarSummary,
    WarParticipantsTable,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './war-detail-page.html',
  styleUrl: './war-detail-page.scss',
})
export class WarDetailPage {
  private readonly wars = inject(WarService);

  /** Route parameter `:id` (bound automatically by the router). */
  readonly id = input.required<string>();

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.wars.getWar(params),
  });
  protected readonly war = computed(() => (this.resource.hasValue() ? this.resource.value() : null));
  protected readonly rows = computed(() => {
    const w = this.war();
    return w ? participantRows(w) : [];
  });
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w?.hasDetails ? computeWarKpi(w) : null;
  });
}
