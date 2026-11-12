import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { PlayerStats } from '../../../core/models';
import { ThemeService } from '../../../core/theme/theme.service';
import { efficiency } from '../../../core/utils/war-stats';
import {
  barSeries,
  baseChartOptions,
  chartChrome,
  lineSeries,
  shortDateLabel,
} from '../../../shared/charts/chart-theme';
import { KpiCard } from '../../../shared/components/kpi-card';
import { ResultBadge } from '../../../shared/components/result-badge';
import { TABLE_WRAP } from '../../../shared/directives/table-wrap';

/** War performance of a player: KPIs, charts and war-by-war table (from the archived wars). */
@Component({
  selector: 'app-player-war-stats',
  imports: [
    TABLE_WRAP,
    LocalDatePipe,
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatTableModule,
    BaseChartDirective,
    KpiCard,
    ResultBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-war-stats.html',
  styleUrl: './player-war-stats.scss',
})
export class PlayerWarStats {
  private readonly language = inject(LanguageService);
  private readonly theme = inject(ThemeService);

  /** War stats of the player over the analysed window. */
  readonly stats = input.required<PlayerStats>();

  protected readonly efficiency = computed(() => efficiency(this.stats()));

  protected readonly columns = [
    'date',
    'opponent',
    'result',
    'mapPosition',
    'attacks',
    'stars',
    'averageDestruction',
  ];
  /** Table ordered from the most recent war. */
  protected readonly recentWars = computed(() => [...this.stats().history].reverse());

  private readonly labels = computed(() =>
    this.stats().history.map(
      (p) => `${shortDateLabel(p.date, this.language.current())} · ${p.opponent}`,
    ),
  );

  /** Chart colours of the current theme. */
  private readonly chrome = computed(() => chartChrome(this.theme.current()));

  protected readonly starsOptions = computed(() =>
    baseChartOptions<'bar'>(this.chrome(), { min: 0, max: 6, legend: false }),
  );
  protected readonly starsData = computed<ChartData<'bar', number[]>>(() => ({
    labels: this.labels(),
    datasets: [
      barSeries(
        this.language.t('player.seriesStars'),
        this.stats().history.map((p) => p.stars),
        this.chrome().series1,
        this.chrome(),
      ),
    ],
  }));

  protected readonly destructionOptions = computed(() =>
    baseChartOptions(this.chrome(), { min: 0, max: 100, suffix: '%', legend: false }),
  );
  protected readonly destructionData = computed<ChartData<'line', number[]>>(() => ({
    labels: this.labels(),
    datasets: [
      lineSeries(
        this.language.t('player.seriesDestruction'),
        this.stats().history.map((p) => p.averageDestruction),
        this.chrome().series1,
        this.chrome(),
        this.chrome().series1Fill,
      ),
    ],
  }));
}
