import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Icon } from '../../shared/icon/icon';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/backend/auth.service';
import { APP_CONFIG } from '../../core/config/app-config';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { ClanRole, PlayerStats } from '../../core/models';
import { CommendationService } from '../../core/services/commendation.service';
import { PlayerService } from '../../core/services/player.service';
import { emblemOf } from '../../core/utils/commendations';
import { sortRows, SortState } from '../../core/utils/sort';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { CommendationMedal } from '../../shared/game/commendation-medal';
import { CLAN_ROLES, roleKey } from '../../shared/labels';
import { StarText } from '../../shared/components/star-text';
import { TownHallIcon } from '../../shared/game/town-hall-icon';
import { Table } from '../../shared/table/table';
import { TableFilters } from '../../shared/table/table-filters';

/** Numeric fields averaged in the footer. */
type NumericField = {
  [K in keyof PlayerStats]-?: PlayerStats[K] extends number ? K : never;
}[keyof PlayerStats];

const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, coLeader: 1, elder: 2, member: 3 };

/**
 * League order: league ids grow from Unranked to the top Legend tier; within the same league
 * the trophies decide (they stay below 1 000 000, so the key never mixes two leagues).
 * Players without a league come last.
 */
function leagueSortKey(m: PlayerStats): number {
  return (m.league?.id ?? 0) * 1_000_000 + m.trophies;
}

@Component({
  selector: 'crn-players-page',
  imports: [
    StarText,
    Table,
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatTableModule,
    MatSortModule,
    Icon,
    MatTooltipModule,
    PageHeader,
    LoadState,
    ScrollFade,
    CommendationMedal,
    TownHallIcon,
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

  protected readonly resource = rxResource({ stream: () => this.players.getMembersStats() });
  /** Monthly commendations shown next to the names (a bonus: none while loading or on error). */
  private readonly commendationsResource = rxResource({
    stream: () => this.commendationService.forClan(),
  });
  protected readonly commendations = computed(() =>
    this.commendationsResource.hasValue() ? this.commendationsResource.value().byTag : new Map(),
  );
  protected readonly roleKey = roleKey;
  protected readonly emblemOf = emblemOf;
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
  ];

  /** Default: highest league first (Legend → Unranked), then most trophies. */
  private readonly sort = signal<SortState>({ field: 'league', direction: 'desc' });

  private readonly members = computed(() =>
    this.resource.hasValue() ? this.resource.value() : [],
  );

  /** No war with details available yet: individual statistics are still empty. */
  protected readonly noArchivedWars = computed(
    () => this.members().length > 0 && this.members().every((m) => m.warsTotal === 0),
  );

  /** Filters of the table: the leagues offered are the ones of the members. */
  protected readonly filters = computed<TableFilters<PlayerStats>>(() => {
    const leagues = new Map<string, number>();
    for (const m of this.members()) if (m.league) leagues.set(m.league.name, m.league.id);
    return {
      league: {
        type: 'select',
        value: (m) => m.league?.name,
        options: [...leagues]
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => ({ value: name, label: name })),
      },
      townHall: { type: 'number' },
      name: { type: 'text', value: (m) => [m.name, m.tag], placeholder: 'common.nameOrTag' },
      role: {
        type: 'select',
        options: CLAN_ROLES.map((r) => ({ value: r, label: roleKey(r) })),
      },
      warsPlayed: { type: 'number' },
      attendance: { type: 'number' },
      attacksUsed: { type: 'number' },
      totalStars: { type: 'number' },
      averageStars: { type: 'number' },
      threeStarRate: { type: 'number' },
      averageDestruction: { type: 'number' },
    };
  });

  /** Members sorted; the table filters them. */
  protected readonly rows = computed(() =>
    sortRows(this.members(), this.sort(), (m, field) =>
      field === 'role'
        ? ROLE_ORDER[m.role] * 100 - m.townHall
        : field === 'league'
          ? leagueSortKey(m)
          : (m[field as keyof PlayerStats] as number | string),
    ),
  );

  /** Average of a numeric field over the rows shown (footer). */
  protected average(rows: readonly PlayerStats[], field: NumericField): number | null {
    if (!rows.length) return null;
    return rows.reduce((sum, m) => sum + m[field], 0) / rows.length;
  }

  protected updateSort(sort: Sort): void {
    this.sort.set({ field: sort.active, direction: sort.direction });
  }

  protected open(m: PlayerStats): void {
    void this.router.navigate(['/players', m.tag]);
  }
}
