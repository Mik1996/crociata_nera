import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { HistoryPlayerStats, HistoryWar } from '../../core/models';
import { ALL_PERIODS, HistoryService } from '../../core/services/history.service';
import { PlayerService } from '../../core/services/player.service';
import { compareForRanking, periodLabel } from '../../core/utils/monthly-history';
import { sortRows, SortState } from '../../core/utils/sort';
import { percentage } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ResultBadge } from '../../shared/components/result-badge';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { resultKey, WAR_RESULTS } from '../../shared/labels';
import { Table } from '../../shared/table/table';
import { TableFilters } from '../../shared/table/table-filters';
import { GAME_ICONS } from '../../core/game/game-assets';
import { StarText } from '../../shared/components/star-text';
import { TownHallIcon } from '../../shared/game/town-hall-icon';

/** Ranking row: stats + rank + current membership of a clan of the Crusade. */
export interface RankingRow extends HistoryPlayerStats {
  rank: number;
  isCurrentMember: boolean;
}

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
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    PageHeader,
    LoadState,
    KpiCard,
    ResultBadge,
    ScrollFade,
    TownHallIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './statistics-page.html',
  styleUrl: './statistics-page.scss',
})
export class StatisticsPage {
  protected readonly GAME_ICONS = GAME_ICONS;

  private readonly history = inject(HistoryService);
  private readonly players = inject(PlayerService);
  private readonly language = inject(LanguageService);
  /** Tag of the signed-in user's player: their row is highlighted. */
  protected readonly isMine = inject(AuthService).isMyPlayer;

  protected readonly allPeriods = ALL_PERIODS;
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
  /**
   * Current members of the three clans of the Crusade: only used to tell former members apart, so
   * an error does not block the page.
   */
  private readonly members = rxResource({ stream: () => this.players.getCrusadeMemberTags() });

  protected readonly monthList = computed(() =>
    this.months.hasValue() ? this.months.value() : [],
  );
  protected readonly periodData = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly isHistoryEmpty = computed(
    () => this.months.hasValue() && this.months.value().length === 0,
  );

  // --- Filters --------------------------------------------------------------
  protected readonly minWars = signal(1);
  protected readonly currentMembersOnly = signal(false);
  protected readonly minWarsOptions = [1, 2, 3, 5, 10];
  private readonly sortState = signal<SortState>({
    field: 'averageStarsPerWar',
    direction: 'desc',
  });

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

  /** Full ranking with rank, computed before the table filters and sorting. */
  private readonly ranking = computed<RankingRow[]>(() => {
    const members = this.members.hasValue() ? this.members.value() : null;
    const minimum = this.minWars();
    return (this.periodData()?.players ?? [])
      .filter((p) => p.wars >= minimum)
      .filter((p) => !this.currentMembersOnly() || !members || members.has(p.tag))
      .sort(compareForRanking)
      .map((p, i) => ({ ...p, rank: i + 1, isCurrentMember: members ? members.has(p.tag) : true }));
  });

  protected readonly rankingFilters: TableFilters<RankingRow> = {
    townHall: { type: 'number' },
    name: { type: 'text', value: (r) => [r.name, r.tag], placeholder: 'common.nameOrTag' },
    wars: { type: 'number' },
    attacksUsed: { type: 'number' },
    stars: { type: 'number' },
    averageStarsPerWar: { type: 'number' },
    averageStarsPerAttack: { type: 'number' },
    threeStarRate: { type: 'number' },
    averageDestruction: {
      type: 'number',
      value: (r) => (r.attacksUsed ? r.averageDestruction : null),
    },
    averageStarsConceded: { type: 'number' },
  };

  protected readonly warFilters: TableFilters<HistoryWar> = {
    date: { type: 'date', value: (w) => w.endTime },
    opponent: {
      type: 'text',
      value: (w) => [w.opponent, w.opponentTag],
      placeholder: 'history.searchPlaceholder',
    },
    size: { type: 'number', value: (w) => w.teamSize },
    result: {
      type: 'select',
      options: WAR_RESULTS.map((r) => ({ value: r, label: resultKey(r) })),
    },
    stars: { type: 'number' },
    destruction: { type: 'number' },
  };

  /** Ranking sorted; the table filters it (the positions stay those of the whole ranking). */
  protected readonly rows = computed(() => {
    return sortRows(
      this.ranking(),
      this.sortState(),
      (r, field) => r[field as keyof RankingRow] as number | string,
    );
  });

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

  protected updateSort(sort: Sort): void {
    this.sortState.set({ field: sort.active, direction: sort.direction });
  }

  protected reload(): void {
    this.months.reload();
    this.data.reload();
  }
}
