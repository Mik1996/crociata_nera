import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/backend/auth.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { sortRows, SortState } from '../../../core/utils/sort';
import { ParticipantRow } from '../../../core/utils/war-stats';
import { Stars } from '../../../shared/components/stars';
import { TownHallIcon } from '../../../shared/game/town-hall-icon';
import { Icon } from '../../../shared/icon/icon';
import { Table } from '../../../shared/table/table';
import { TableFilters } from '../../../shared/table/table-filters';

/** War participants table with filters (in the table) and sorting. */
@Component({
  selector: 'crn-war-participants-table',
  imports: [
    Table,
    LocalNumberPipe,
    TranslatePipe,
    RouterLink,
    MatTableModule,
    MatSortModule,
    Icon,
    MatTooltipModule,
    Stars,
    TownHallIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './war-participants-table.html',
  styleUrl: './war-participants-table.scss',
})
export class WarParticipantsTable {
  readonly rows = input.required<ParticipantRow[]>();
  /** Name of the table, in its caption. */
  readonly caption = input('');
  readonly attacksPerMember = input(2);
  /** War still in progress: changes the message shown for players who have not attacked. */
  readonly inProgress = input(false);
  /** Preparation day: no attack can be made yet, so no attack status is shown. */
  readonly preparation = input(false);

  /**
   * The signed-in user's players: marked with a "You" badge. Their row is highlighted only once
   * the war has ended; while it is in progress it keeps the attack status colours like the others.
   */
  protected readonly isMine = inject(AuthService).isMyPlayer;

  protected readonly columns = [
    'mapPosition',
    'townHall',
    'name',
    'attacks',
    'stars',
    'averageDestruction',
    'targets',
  ];

  private readonly sort = signal<SortState>({ field: 'mapPosition', direction: 'asc' });

  /** Filters of the table: the town halls offered are the ones in the war. */
  protected readonly filters = computed<TableFilters<ParticipantRow>>(() => ({
    townHall: {
      type: 'select',
      options: [...new Set(this.rows().map((r) => r.townHall))]
        .sort((a, b) => b - a)
        .map((th) => ({ value: th, label: 'common.townHallN', params: { n: th } })),
    },
    name: { type: 'text', value: (r) => [r.name, r.tag], placeholder: 'common.nameOrTag' },
    // Yes: has attacked at least once.
    attacks: { type: 'boolean', value: (r) => r.hasAttacked },
    stars: { type: 'number' },
    averageDestruction: {
      type: 'number',
      value: (r) => (r.hasAttacked ? r.averageDestruction : null),
    },
  }));

  /** Participants sorted; the table filters them. */
  protected readonly sortedRows = computed(() =>
    sortRows(this.rows(), this.sort(), (r, field) =>
      field === 'attacks' ? r.attacksUsed : (r[field as keyof ParticipantRow] as number | string),
    ),
  );

  protected updateSort(sort: Sort): void {
    this.sort.set({ field: sort.active, direction: sort.direction });
  }
}
