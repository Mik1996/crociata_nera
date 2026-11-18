import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
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
  selector: 'crn-current-war-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
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
  templateUrl: './current-war-page.html',
  styleUrl: './current-war-page.scss',
})
export class CurrentWarPage {
  protected readonly GAME_ICONS = GAME_ICONS;

  private readonly wars = inject(WarService);

  protected readonly resource = rxResource({ stream: () => this.wars.getCurrentWar() });
  protected readonly war = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );

  private readonly participants = viewChild(WarParticipantsTable);

  /** "Refresh" skips the cache: the current war (and its players) are read again from the API. */
  protected refresh(): void {
    this.wars.refreshCurrentWar();
    this.participants()?.reload();
    this.resource.reload();
  }
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w ? computeWarKpi(w) : null;
  });
}
