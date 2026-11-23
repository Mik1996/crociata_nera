import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { MemberStatsRow } from '../../core/models';
import { CommendationService } from '../../core/services/commendation.service';
import { PlayerService } from '../../core/services/player.service';
import { emblemOf, nameKeyOf } from '../../core/utils/commendations';
import { Icon } from '../../shared/components/icon/icon';
import { LoadState } from '../../shared/components/load-state/load-state';
import { Meter } from '../../shared/components/meter/meter';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PlayerCell } from '../../shared/components/player-cell/player-cell';
import { StarText } from '../../shared/components/star-text/star-text';
import { memberStatsFilters } from '../../shared/components/table/clan-tables';
import { serverTable } from '../../shared/components/table/server-table';
import { Table } from '../../shared/components/table/table';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { CommendationMedal } from '../../shared/game/commendation-medal';
import { TownHallIcon } from '../../shared/game/town-hall-icon';
import { roleKey } from '../../shared/labels';

@Component({
  selector: 'crn-players-page',
  imports: [
    StarText,
    Table,
    LocalNumberPipe,
    TranslatePipe,
    MatTableModule,
    MatSortModule,
    Icon,
    MatTooltipModule,
    PageHeader,
    LoadState,
    ScrollFade,
    CommendationMedal,
    TownHallIcon,
    Meter,
    PlayerCell,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './players-page.html',
  styleUrl: './players-page.scss',
})
export class PlayersPage {
  private readonly players = inject(PlayerService);
  private readonly router = inject(Router);
  private readonly commendationService = inject(CommendationService);
  protected readonly statsWindow = inject(APP_CONFIG).statsWindow;
  /** Tag of the signed-in user's player: their row is highlighted. */
  protected readonly isMine = inject(AuthService).isMyPlayer;

  /** Members and their war statistics, filtered, sorted and paged by the backend. */
  protected readonly members = serverTable({
    load: (query) => this.players.getMembersStatsTable(query),
  });
  /** Monthly commendations shown next to the names (a bonus: none while loading or on error). */
  private readonly commendationsResource = rxResource({
    stream: () => this.commendationService.forClan(),
  });
  protected readonly commendations = computed(() =>
    this.commendationsResource.hasValue() ? this.commendationsResource.value().byTag : new Map(),
  );
  protected readonly roleKey = roleKey;
  protected readonly emblemOf = emblemOf;
  protected readonly nameKeyOf = nameKeyOf;
  protected readonly columns = [
    'league',
    'townHall',
    'name',
    'role',
    'warsPlayed',
    'attendance',
    'attacksUsed',
    'totalStars',
    'averageStars',
    'threeStarRate',
    'averageDestruction',
    'defenses',
    'averageStarsConceded',
    'threeStarsConcededRate',
    'averageDestructionConceded',
  ];

  /** No war with details available yet: individual statistics are still empty. */
  protected readonly noArchivedWars = computed(() => {
    const summary = this.members.summary();
    return !!summary && summary.members > 0 && summary.warsTotal === 0;
  });

  /** Filters of the table: the leagues offered are the ones of the members. */
  protected readonly filters = computed(() =>
    memberStatsFilters(this.members.summary()?.leagues ?? []),
  );


  protected open(m: MemberStatsRow): void {
    void this.router.navigate(['/players', m.tag]);
  }
}
