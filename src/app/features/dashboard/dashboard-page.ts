import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from '../../shared/icon/icon';
import { RouterLink } from '@angular/router';
import { ChartData } from 'chart.js';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { PlayerStats } from '../../core/models';
import { PlayerService } from '../../core/services/player.service';
import { WarService } from '../../core/services/war.service';
import { clanTrend, computeWarKpi, efficiency, rankPerformers } from '../../core/utils/war-stats';
import {
  barSeries,
  baseChartOptions,
  chartChrome,
  lineSeries,
  shortDateLabel,
} from '../../shared/charts/chart-theme';
import { GAME_ICONS } from '../../core/game/game-assets';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { WarSummary } from '../wars/components/war-summary';
import { ScrollFade } from '../../shared/directives/scroll-fade';

/** Number of wars shown in the trend charts. */
const CHART_WARS = 15;
/** Number of players in each ranking. */
const RANKING_SIZE = 5;

@Component({
  selector: 'app-dashboard-page',
  imports: [
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatButtonModule,
    Icon,
    BaseChartDirective,
    PageHeader,
    LoadState,
    KpiCard,
    WarSummary,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly GAME_ICONS = GAME_ICONS;

  private readonly wars = inject(WarService);
  private readonly players = inject(PlayerService);
  private readonly language = inject(LanguageService);
  private readonly theme = inject(ThemeService);

  // Each section has its own resource: an error in one does not block the others.
  protected readonly latest = rxResource({ stream: () => this.wars.getLatestWar() });
  protected readonly history = rxResource({ stream: () => this.wars.getHistory() });
  protected readonly members = rxResource({ stream: () => this.players.getMembersStats() });

  protected readonly war = computed(() => (this.latest.hasValue() ? this.latest.value() : null));
  protected readonly kpi = computed(() => {
    const w = this.war();
    return w?.hasDetails ? computeWarKpi(w) : null;
  });

  // --- Ranking ------------------------------------------------------------
  private readonly ranking = computed(() =>
    rankPerformers(this.members.hasValue() ? this.members.value() : []),
  );
  protected readonly best = computed(() => this.ranking().slice(0, RANKING_SIZE));
  protected readonly worst = computed(() => this.ranking().slice(-RANKING_SIZE).reverse());
  protected readonly efficiency = (s: PlayerStats) => efficiency(s);
  protected readonly rankings = computed(() => [
    {
      title: 'dashboard.best',
      icon: 'emoji_events' as const,
      entries: this.best(),
      modifier: 'top',
    },
    {
      title: 'dashboard.worst',
      icon: 'trending_down' as const,
      entries: this.worst(),
      modifier: 'flop',
    },
  ]);

  // --- Charts -------------------------------------------------------------
  protected readonly trend = computed(() =>
    clanTrend(this.history.hasValue() ? this.history.value().slice(0, CHART_WARS) : []),
  );
  private readonly labels = computed(() =>
    this.trend().map((p) => `${shortDateLabel(p.date, this.language.current())} · ${p.opponent}`),
  );

  /** Chart colours of the current theme. */
  private readonly chrome = computed(() => chartChrome(this.theme.current()));

  protected readonly starsOptions = computed(() => baseChartOptions(this.chrome(), { min: 0 }));
  protected readonly starsData = computed<ChartData<'line', number[]>>(() => ({
    labels: this.labels(),
    datasets: [
      lineSeries(
        this.language.t('dashboard.seriesStarsEarned'),
        this.trend().map((p) => p.stars),
        this.chrome().series1,
        this.chrome(),
      ),
      lineSeries(
        this.language.t('dashboard.seriesStarsConceded'),
        this.trend().map((p) => p.starsConceded),
        this.chrome().series2,
        this.chrome(),
      ),
    ],
  }));

  protected readonly participationOptions = computed(() =>
    baseChartOptions<'bar'>(this.chrome(), { min: 0, max: 100, suffix: '%', legend: false }),
  );
  protected readonly participationData = computed<ChartData<'bar', number[]>>(() => ({
    labels: this.labels(),
    datasets: [
      barSeries(
        this.language.t('dashboard.seriesAttacksUsed'),
        this.trend().map((p) => p.participation),
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
        this.language.t('dashboard.seriesDestruction'),
        this.trend().map((p) => p.destruction),
        this.chrome().series1,
        this.chrome(),
        this.chrome().series1Fill,
      ),
    ],
  }));
}
