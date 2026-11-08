import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
import { matchesText, sortRows, SortState } from '../../core/utils/sort';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TABLE_WRAP } from '../../shared/directives/table-wrap';
import { CommendationMedal } from '../../shared/game/commendation-medal';
import { CLAN_ROLES, roleKey } from '../../shared/labels';

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
  selector: 'app-players-page',
  imports: [
    TABLE_WRAP,
    LocalNumberPipe,
    TranslatePipe,
    FormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatTooltipModule,
    PageHeader,
    LoadState,
    ScrollFade,
    CommendationMedal,
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
  protected readonly myTag = inject(AuthService).playerTag;

  protected readonly resource = rxResource({ stream: () => this.players.getMembersStats() });
  /** Monthly commendations shown next to the names (a bonus: none while loading or on error). */
  private readonly commendationsResource = rxResource({
    stream: () => this.commendationService.forClan(),
  });
  protected readonly commendations = computed(() =>
    this.commendationsResource.hasValue() ? this.commendationsResource.value().byTag : new Map(),
  );
  protected readonly roles = CLAN_ROLES;
  protected readonly roleKey = roleKey;
  protected readonly emblemOf = emblemOf;
  protected readonly columns = [
    'league',
    'name',
    'role',
    'townHall',
    'warsPlayed',
    'attendance',
    'attacksUsed',
    'totalStars',
    'averageStars',
    'threeStarRate',
    'averageDestruction',
  ];

  protected readonly search = signal('');
  protected readonly role = signal<ClanRole | null>(null);
  /** Default: highest league first (Legend → Unranked), then most trophies. */
  private readonly sort = signal<SortState>({ field: 'league', direction: 'desc' });

  private readonly members = computed(() =>
    this.resource.hasValue() ? this.resource.value() : [],
  );

  /** No war with details available yet: individual statistics are still empty. */
  protected readonly noArchivedWars = computed(
    () => this.members().length > 0 && this.members().every((m) => m.warsTotal === 0),
  );

  protected readonly rows = computed(() => {
    const search = this.search();
    const role = this.role();
    const filtered = this.members().filter(
      (m) =>
        (!search || matchesText(m.name, search) || matchesText(m.tag, search)) &&
        (role === null || m.role === role),
    );
    return sortRows(filtered, this.sort(), (m, field) =>
      field === 'role'
        ? ROLE_ORDER[m.role] * 100 - m.townHall
        : field === 'league'
          ? leagueSortKey(m)
          : (m[field as keyof PlayerStats] as number | string),
    );
  });

  protected updateSort(sort: Sort): void {
    this.sort.set({ field: sort.active, direction: sort.direction });
  }

  protected open(m: PlayerStats): void {
    void this.router.navigate(['/players', m.tag]);
  }
}
