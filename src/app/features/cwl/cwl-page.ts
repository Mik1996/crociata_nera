import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatTableModule } from '@angular/material/table';
import { TranslatePipe } from '@ngx-translate/core';
import { CLAN_CREST_URL } from '../../core/api/clan-badge';
import { CocApiService } from '../../core/api/coc-api';
import { AuthService } from '../../core/backend/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { CwlRound } from '../../core/models';
import { periodLabel } from '../../core/utils/monthly-history';
import { warResult } from '../../core/utils/war-stats';
import { LoadState } from '../../shared/components/load-state/load-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PlayerCell } from '../../shared/components/player-cell/player-cell';
import { ResultBadge } from '../../shared/components/result-badge/result-badge';
import { Select, SelectOption } from '../../shared/components/select/select';
import { StarText } from '../../shared/components/star-text/star-text';
import { CWL_PLAYER_FILTERS } from '../../shared/components/table/clan-tables';
import { serverTable } from '../../shared/components/table/server-table';
import { Table } from '../../shared/components/table/table';
import { Tag } from '../../shared/components/tag/tag';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TownHallIcon } from '../../shared/game/town-hall-icon';

/**
 * Clan War League: group standings, the clan's 7 rounds and the players' statistics of a
 * season. Seasons are saved by the backend, so past ones stay available.
 */

@Component({
  selector: 'crn-cwl-page',
  imports: [
    StarText,
    Table,
    TranslatePipe,
    LocalNumberPipe,
    MatTableModule,
    PageHeader,
    LoadState,
    ResultBadge,
    ScrollFade,
    TownHallIcon,
    Tag,
    Select,
    PlayerCell,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './cwl-page.html',
  styleUrl: './cwl-page.scss',
})
export class CwlPage {
  private readonly api = inject(CocApiService);
  private readonly language = inject(LanguageService);
  /** Tag of the signed-in user's player: their row is highlighted. */
  protected readonly isMine = inject(AuthService).isMyPlayer;
  /** Our badge when the season record has none or it fails to load. */
  protected readonly crestUrl = CLAN_CREST_URL;

  /** Badge URLs that failed to load: our clan falls back to its logo, the others are left out. */
  protected readonly failedBadges = signal<ReadonlySet<string>>(new Set());

  protected badgeFailed(url: string): void {
    this.failedBadges.update((failed) => new Set(failed).add(url));
  }

  protected readonly seasons = rxResource({ stream: () => this.api.getCwlSeasons() });
  protected readonly seasonList = computed(() =>
    this.seasons.hasValue() ? this.seasons.value() : [],
  );
  protected readonly seasonOptions = computed<SelectOption<string>[]>(() =>
    this.seasonList().map((s) => ({
      value: s.season,
      label: `${this.periodLabel(s.season)} · ${this.language.t('cwl.state.' + s.state)}`,
    })),
  );

  /** Season chosen in the selector; the most recent one until the user picks another. */
  private readonly chosen = signal<string | null>(null);
  protected readonly selected = computed(() => this.chosen() ?? this.seasonList()[0]?.season);

  protected readonly data = rxResource({
    params: () => this.selected(),
    stream: ({ params }) => this.api.getCwlSeason(params),
  });
  protected readonly season = computed(() => (this.data.hasValue() ? this.data.value() : null));

  protected readonly standingColumns = ['rank', 'clan', 'wins', 'stars', 'destruction'];
  protected readonly playerColumns = [
    'index',
    'townHall',
    'name',
    'attacks',
    'stars',
    'averageStars',
    'threeStars',
    'destruction',
  ];

  protected readonly playerFilters = CWL_PLAYER_FILTERS;
  /** The clan's players in the season, filtered and paged by the backend. */
  protected readonly players = serverTable({
    params: () => this.selected(),
    load: (query, season) => this.api.getCwlPlayersTable(season, query),
  });

  protected readonly periodLabel = (season: string) => periodLabel(season, this.language.current());
  protected readonly result = (round: CwlRound) => (round.war ? warResult(round.war) : 'ongoing');

  protected changeSeason(season: string): void {
    this.chosen.set(season);
  }

  protected reload(): void {
    this.seasons.reload();
    this.data.reload();
  }
}
