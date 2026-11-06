import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { APP_CONFIG } from '../../core/config/app-config';
import { LocalNumberPipe } from '../../core/i18n/locale-pipes';
import { ClanRole, PlayerStats } from '../../core/models';
import { PlayerService } from '../../core/services/player.service';
import { matchesText, sortRows, SortState } from '../../core/utils/sort';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { CLAN_ROLES, roleKey } from '../../shared/labels';

const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, coLeader: 1, elder: 2, member: 3 };

@Component({
  selector: 'app-players-page',
  imports: [
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
    PageHeader,
    LoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './players-page.html',
  styleUrl: './players-page.scss',
})
export class PlayersPage {
  private readonly players = inject(PlayerService);
  private readonly router = inject(Router);
  protected readonly statsWindow = inject(APP_CONFIG).statsWindow;

  protected readonly resource = rxResource({ stream: () => this.players.getMembersStats() });
  protected readonly roles = CLAN_ROLES;
  protected readonly roleKey = roleKey;
  protected readonly columns = [
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
  private readonly sort = signal<SortState>({ field: 'role', direction: 'asc' });

  private readonly members = computed(() => (this.resource.hasValue() ? this.resource.value() : []));

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
