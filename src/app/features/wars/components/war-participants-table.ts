import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/backend/auth.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { WarService } from '../../../core/services/war.service';
import { Stars } from '../../../shared/components/stars';
import { TownHallIcon } from '../../../shared/game/town-hall-icon';
import { Icon } from '../../../shared/icon/icon';
import { participantFilters } from '../../../shared/table/clan-tables';
import { serverTable } from '../../../shared/table/server-table';
import { Table } from '../../../shared/table/table';
import { PlayerCell } from '../../../shared/components/player-cell';

/** The clan's players in a war, filtered, sorted and paged by the backend. */
@Component({
  selector: 'crn-war-participants-table',
  imports: [
    Table,
    LocalNumberPipe,
    TranslatePipe,
    MatTableModule,
    MatSortModule,
    Icon,
    MatTooltipModule,
    Stars,
    TownHallIcon,
    PlayerCell,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './war-participants-table.html',
  styleUrl: './war-participants-table.scss',
})
export class WarParticipantsTable {
  /** The war (current or past) whose players are shown. */
  readonly warId = input.required<string>();
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

  private readonly wars = inject(WarService);
  protected readonly participants = serverTable({
    params: () => this.warId(),
    load: (query, warId) => this.wars.getParticipantsTable(warId, query),
  });

  /** Filters of the table: the town halls offered are the ones in the war. */
  protected readonly filters = computed(() => participantFilters(this.participants.summary()));

  /** Asks the rows again (the war in progress, after "Refresh"). */
  reload(): void {
    this.participants.reload();
  }
}
