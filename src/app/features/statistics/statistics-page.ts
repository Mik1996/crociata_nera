import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    linkedSignal,
    signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { GAME_ICONS } from '../../core/game/game-assets';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { HistoryPeriod, HistoryPlayerStats } from '../../core/models';
import { ALL_PERIODS, HistoryService } from '../../core/services/history.service';
import { periodLabel } from '../../core/utils/monthly-history';
import { percentage } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card/kpi-card';
import { LoadState } from '../../shared/components/load-state/load-state';
import { Meter } from '../../shared/components/meter/meter';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PlayerCell } from '../../shared/components/player-cell/player-cell';
import { ResultBadge } from '../../shared/components/result-badge/result-badge';
import { Select, SelectOption } from '../../shared/components/select/select';
import { StarText } from '../../shared/components/star-text/star-text';
import { PERIOD_WARS_FILTERS, RANKING_FILTERS } from '../../shared/components/table/clan-tables';
import { serverTable } from '../../shared/components/table/server-table';
import { Table } from '../../shared/components/table/table';
import { Tag } from '../../shared/components/tag/tag';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TownHallIcon } from '../../shared/game/town-hall-icon';

/** Choices of the minimum number of wars to be ranked. */
const MIN_WARS_CHOICES = [1, 2, 3, 5, 10];

/** Maximum stars per war (two 3-star attacks). */
const MAX_STARS_PER_WAR = 6;

@Component({
  selector: 'crn-statistics-page',
  imports: [
    StarText,
    Table,
    LocalDatePipe,
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatSlideToggleModule,
    MatTooltipModule,
    PageHeader,
    LoadState,
    KpiCard,
    ResultBadge,
    ScrollFade,
    TownHallIcon,
    Tag,
    Select,
    Meter,
    PlayerCell,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './statistics-page.html',
  styleUrl: './statistics-page.scss',
})
export class StatisticsPage {
  protected readonly GAME_ICONS = GAME_ICONS;

  private readonly history = inject(HistoryService);
  private readonly language = inject(LanguageService);
  /** Tag of the signed-in user's player: their row is highlighted. */
  protected readonly isMine = inject(AuthService).isMyPlayer;

  protected readonly maxStars = MAX_STARS_PER_WAR;
  /** Period label in the current language (updates when the language changes). */
  protected readonly periodLabel = (period: string) =>
    periodLabel(period, this.language.current(), this.language.t('statistics.allMonths'));

  // --- Data -----------------------------------------------------------------
  protected readonly period = signal(ALL_PERIODS);
  protected readonly months = rxResource({ stream: () => this.history.getMonths() });
  protected readonly data = rxResource({
    params: () => this.period(),
    stream: ({ params }) => this.history.getPeriod(params),
  });
  protected readonly monthList = computed(() =>
    this.months.hasValue() ? this.months.value() : [],
  );
  /** Choices of the period selector: every month, then each month with its wars. */
  protected readonly periodOptions = computed<SelectOption<string>[]>(() => [
    { value: ALL_PERIODS, label: this.language.t('statistics.allMonths') },
    ...this.monthList().map((m) => ({
      value: m.month,
      label: `${this.periodLabel(m.month)} · ${this.language.t(
        m.wars === 1 ? 'statistics.warsOne' : 'statistics.warsOther',
        { n: m.wars },
      )}`,
    })),
  ]);
  /** The period's data (for the KPIs); the last one stays while the next period loads. */
  protected readonly periodData = linkedSignal<
    HistoryPeriod | null | undefined,
    HistoryPeriod | null
  >({
    source: () => (this.data.hasValue() ? this.data.value() : undefined),
    computation: (data, previous) => (data === undefined ? (previous?.value ?? null) : data),
  });
  protected readonly isHistoryEmpty = computed(
    () => this.months.hasValue() && this.months.value().length === 0,
  );

  // --- Filters --------------------------------------------------------------
  protected readonly minWars = signal(1);
  protected readonly currentMembersOnly = signal(false);
  protected readonly minWarsOptions = computed<SelectOption<number>[]>(() =>
    MIN_WARS_CHOICES.map((n) => ({
      value: n,
      label: this.language.t(n === 1 ? 'common.allMasculine' : 'statistics.atLeast', { n }),
    })),
  );

  protected readonly columns = [
    'rank',
    'townHall',
    'name',
    'wars',
    'attacksUsed',
    'stars',
    'averageStarsPerWar',
    'averageStarsPerAttack',
    'distribution',
    'threeStarRate',
    'averageDestruction',
    'averageStarsConceded',
  ];
  protected readonly warColumns = ['date', 'opponent', 'size', 'result', 'stars', 'destruction'];

  /**
   * Ranking of the period, filtered, sorted and paged by the backend. The ranking settings change
   * who is ranked, so the positions too: they go to the backend with the period.
   */
  protected readonly ranking = serverTable({
    params: () => ({
      period: this.period(),
      minWars: this.minWars(),
      currentMembersOnly: this.currentMembersOnly(),
    }),
    load: (query, { period, ...options }) => this.history.getRankingTable(period, options, query),
  });
  protected readonly rankingFilters = RANKING_FILTERS;

  /** Wars of the period, filtered and paged by the backend. */
  protected readonly wars = serverTable({
    params: () => this.period(),
    load: (query, period) => this.history.getWarsTable(period, query),
  });
  protected readonly warFilters = PERIOD_WARS_FILTERS;

  // --- Period KPIs ----------------------------------------------------------
  protected readonly kpi = computed(() => {
    const data = this.periodData();
    if (!data) return null;
    const players = data.players;
    const sum = (f: (p: HistoryPlayerStats) => number) => players.reduce((s, p) => s + f(p), 0);
    const appearances = sum((p) => p.wars);
    const attacksUsed = sum((p) => p.attacksUsed);
    const count = (r: string) => data.wars.filter((w) => w.result === r).length;
    return {
      wars: data.wars.length,
      record: this.language.t('statistics.record', {
        wins: count('victory'),
        draws: count('draw'),
        losses: count('defeat'),
      }),
      averageStarsPerWar: appearances ? sum((p) => p.stars) / appearances : 0,
      threeStarRate: percentage(
        sum((p) => p.threeStars),
        attacksUsed,
      ),
      participation: percentage(
        attacksUsed,
        sum((p) => p.attacksAvailable),
      ),
      attacksMissed: sum((p) => p.attacksMissed),
    };
  });

  protected changePeriod(period: string): void {
    this.period.set(period);
  }

  protected reload(): void {
    this.months.reload();
    this.data.reload();
  }
}
