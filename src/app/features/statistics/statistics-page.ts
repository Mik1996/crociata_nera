import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../../core/backend/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe, LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { HistoryPlayerStats } from '../../core/models';
import { ALL_PERIODS, HistoryService } from '../../core/services/history.service';
import { PlayerService } from '../../core/services/player.service';
import { compareForRanking, periodLabel } from '../../core/utils/monthly-history';
import { matchesText, sortRows, SortState } from '../../core/utils/sort';
import { percentage } from '../../core/utils/war-stats';
import { KpiCard } from '../../shared/components/kpi-card';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ResultBadge } from '../../shared/components/result-badge';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TABLE_WRAP } from '../../shared/directives/table-wrap';

/** Ranking row: stats + rank + current clan membership. */
export interface RankingRow extends HistoryPlayerStats {
  rank: number;
  isCurrentMember: boolean;
}

/** Maximum stars per war (two 3-star attacks). */
const MAX_STARS_PER_WAR = 6;

@Component({
  selector: 'app-statistics-page',
  imports: [
    TABLE_WRAP,
    LocalDatePipe,
    LocalNumberPipe,
    TranslatePipe,
    FormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatTooltipModule,
    PageHeader,
    LoadState,
    KpiCard,
    ResultBadge,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './statistics-page.html',
  styleUrl: './statistics-page.scss',
})
export class StatisticsPage {
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
  /** Current members: only used to tell former members apart, so an error does not block the page. */
  private readonly members = rxResource({
    stream: () =>
      this.players.getMembers().pipe(
        map((m) => new Set(m.map((x) => x.tag))),
        catchError(() => of(null)),
      ),
  });

  protected readonly monthList = computed(() =>
    this.months.hasValue() ? this.months.value() : [],
  );
  protected readonly periodData = computed(() => (this.data.hasValue() ? this.data.value() : null));
  protected readonly isHistoryEmpty = computed(
    () => this.months.hasValue() && this.months.value().length === 0,
  );

  // --- Filters --------------------------------------------------------------
  protected readonly search = signal('');
  protected readonly minWars = signal(1);
  protected readonly currentMembersOnly = signal(false);
  protected readonly minWarsOptions = [1, 2, 3, 5, 10];
  private readonly sortState = signal<SortState>({
    field: 'averageStarsPerWar',
    direction: 'desc',
  });

  protected readonly columns = [
    'rank',
    'name',
    'townHall',
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

  /** Full ranking with rank, computed before the search filter and sorting. */
  private readonly ranking = computed<RankingRow[]>(() => {
    const members = this.members.hasValue() ? this.members.value() : null;
    const minimum = this.minWars();
    return (this.periodData()?.players ?? [])
      .filter((p) => p.wars >= minimum)
      .filter((p) => !this.currentMembersOnly() || !members || members.has(p.tag))
      .sort(compareForRanking)
      .map((p, i) => ({ ...p, rank: i + 1, isCurrentMember: members ? members.has(p.tag) : true }));
  });

  protected readonly rows = computed(() => {
    const search = this.search();
    const filtered = this.ranking().filter(
      (r) => !search || matchesText(r.name, search) || matchesText(r.tag, search),
    );
    return sortRows(
      filtered,
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
