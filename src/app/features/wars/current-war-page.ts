import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { WarService } from '../../core/services/war.service';
import { computeWarKpi, participantRows } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { WarParticipantsTable } from './components/war-participants-table';
import { WarSummary } from './components/war-summary';

@Component({
  selector: 'app-current-war-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    LoadState,
    KpiCard,
    WarSummary,
    WarParticipantsTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './current-war-page.html',
  styleUrl: './current-war-page.scss',
})
export class CurrentWarPage {
  private readonly wars = inject(WarService);

  protected readonly resource = rxResource({ stream: () => this.wars.getCurrentWar() });
  protected readonly war = computed(() => (this.resource.hasValue() ? this.resource.value() : null));
  protected readonly rows = computed(() => {
    const w = this.war();
    return w ? participantRows(w) : [];
  });
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w ? computeWarKpi(w) : null;
  });
}
