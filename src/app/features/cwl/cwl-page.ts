import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../shared/icon/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CLAN_CREST_URL } from '../../core/api/clan-badge';
import { CocApiService } from '../../core/api/coc-api';
import { AuthService } from '../../core/backend/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { CwlRound } from '../../core/models';
import { periodLabel } from '../../core/utils/monthly-history';
import { warResult } from '../../core/utils/war-stats';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ResultBadge } from '../../shared/components/result-badge';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TABLE_WRAP } from '../../shared/directives/table-wrap';
import { StarText } from '../../shared/components/star-text';

/**
 * Clan War League: group standings, the clan's 7 rounds and the players' statistics of a
 * season. Seasons are saved by the backend, so past ones stay available.
 */

@Component({
  selector: 'crn-cwl-page',
  imports: [
    StarText,
    TABLE_WRAP,
    TranslatePipe,
    LocalNumberPipe,
    RouterLink,
    MatFormFieldModule,
    MatSelectModule,
    Icon,
    MatTableModule,
    PageHeader,
    LoadState,
    ResultBadge,
    ScrollFade,
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
    'name',
    'townHall',
    'attacks',
    'stars',
    'averageStars',
    'threeStars',
    'destruction',
  ];

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
