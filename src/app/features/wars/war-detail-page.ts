import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { GAME_ICONS } from '../../core/game/game-assets';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { WarService } from '../../core/services/war.service';
import { computeWarKpi } from '../../core/utils/war-stats';
import { Icon } from '../../shared/components/icon/icon';
import { KpiCard } from '../../shared/components/kpi-card/kpi-card';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { WarParticipantsTable } from './components/war-participants-table';
import { WarSummary } from './components/war-summary';

@Component({
  selector: 'crn-war-detail-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatButtonModule,
    Icon,
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
  protected readonly GAME_ICONS = GAME_ICONS;

  private readonly wars = inject(WarService);

  /** Route parameter `:id` (bound automatically by the router). */
  readonly id = input.required<string>();

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.wars.getWar(params),
  });
  protected readonly war = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w?.hasDetails ? computeWarKpi(w) : null;
  });
}
