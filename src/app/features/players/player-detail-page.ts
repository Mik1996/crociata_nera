import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { ChartData } from 'chart.js';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { PlayerService } from '../../core/services/player.service';
import { efficiency } from '../../core/utils/war-stats';
import {
  barSeries,
  baseChartOptions,
  CHART_COLORS,
  lineSeries,
  shortDateLabel,
} from '../../shared/charts/chart-theme';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ResultBadge } from '../../shared/components/result-badge';
import { roleKey } from '../../shared/labels';

@Component({
  selector: 'app-player-detail-page',
  imports: [
    LocalDatePipe,
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    BaseChartDirective,
    PageHeader,
    LoadState,
    KpiCard,
    ResultBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-detail-page.html',
})
export class PlayerDetailPage {
  private readonly players = inject(PlayerService);
  private readonly language = inject(LanguageService);

  /** Route parameter `:tag` (bound automatically by the router, already decoded). */
  readonly tag = input.required<string>();

  protected readonly resource = rxResource({
    params: () => this.tag(),
    stream: ({ params }) => this.players.getPlayerStats(params),
  });
  protected readonly stats = computed(() => (this.resource.hasValue() ? this.resource.value() : null));
  protected readonly role = computed(() => {
    const s = this.stats();
    return s ? this.language.t(roleKey(s.role)) : '';
  });
  protected readonly efficiency = computed(() => {
    const s = this.stats();
    return s ? efficiency(s) : 0;
  });

  protected readonly columns = ['date', 'opponent', 'result', 'mapPosition', 'attacks', 'stars', 'averageDestruction'];
  /** Table ordered from the most recent war. */
  protected readonly recentWars = computed(() => [...(this.stats()?.history ?? [])].reverse());

  private readonly labels = computed(() =>
    (this.stats()?.history ?? []).map((p) => `${shortDateLabel(p.date, this.language.current())} · ${p.opponent}`),
  );

  protected readonly starsOptions = baseChartOptions<'bar'>({ min: 0, max: 6, legend: false });
  protected readonly starsData = computed<ChartData<'bar', number[]>>(() => ({
    labels: this.labels(),
    datasets: [barSeries(this.language.t('player.seriesStars'), (this.stats()?.history ?? []).map((p) => p.stars), CHART_COLORS.gold)],
  }));

  protected readonly destructionOptions = baseChartOptions({ min: 0, max: 100, suffix: '%', legend: false });
  protected readonly destructionData = computed<ChartData<'line', number[]>>(() => ({
    labels: this.labels(),
    datasets: [
      lineSeries(
        this.language.t('player.seriesDestruction'),
        (this.stats()?.history ?? []).map((p) => p.averageDestruction),
        CHART_COLORS.gold,
        CHART_COLORS.goldTransparent,
      ),
    ],
  }));
}
