import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../../shared/icon/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/backend/auth.service';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { matchesText, sortRows, SortState } from '../../../core/utils/sort';
import { ParticipantRow } from '../../../core/utils/war-stats';
import { Stars } from '../../../shared/components/stars';
import { TABLE_WRAP } from '../../../shared/directives/table-wrap';

/** War participants table with filters and sorting. */
@Component({
  selector: 'app-war-participants-table',
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
    MatSlideToggleModule,
    Icon,
    MatButtonModule,
    MatTooltipModule,
    Stars,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './war-participants-table.html',
  styleUrl: './war-participants-table.scss',
})
export class WarParticipantsTable {
  readonly rows = input.required<ParticipantRow[]>();
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
    'name',
    'townHall',
    'attacks',
    'stars',
    'averageDestruction',
    'targets',
  ];

  // Filters
  protected readonly search = signal('');
  protected readonly townHall = signal<number | null>(null);
  protected readonly stars = signal<number | null>(null);
  protected readonly onlyWithoutAttacks = signal(false);
  private readonly sort = signal<SortState>({ field: 'mapPosition', direction: 'asc' });

  protected readonly townHalls = computed(() =>
    [...new Set(this.rows().map((r) => r.townHall))].sort((a, b) => b - a),
  );
  protected readonly starOptions = computed(() =>
    Array.from({ length: this.attacksPerMember() * 3 + 1 }, (_, i) => i),
  );

  protected readonly filteredRows = computed(() => {
    const search = this.search();
    const townHall = this.townHall();
    const stars = this.stars();
    const onlyWithout = this.onlyWithoutAttacks();
    const filtered = this.rows().filter(
      (r) =>
        (!search || matchesText(r.name, search) || matchesText(r.tag, search)) &&
        (townHall === null || r.townHall === townHall) &&
        (stars === null || r.stars === stars) &&
        (!onlyWithout || !r.hasAttacked),
    );
    return sortRows(filtered, this.sort(), (r, field) =>
      field === 'attacks' ? r.attacksUsed : (r[field as keyof ParticipantRow] as number | string),
    );
  });

  protected readonly filtersActive = computed(
    () =>
      !!this.search() ||
      this.townHall() !== null ||
      this.stars() !== null ||
      this.onlyWithoutAttacks(),
  );

  protected readonly withoutAttacks = computed(
    () => this.rows().filter((r) => !r.hasAttacked).length,
  );

  protected updateSort(sort: Sort): void {
    this.sort.set({ field: sort.active, direction: sort.direction });
  }

  protected clearFilters(): void {
    this.search.set('');
    this.townHall.set(null);
    this.stars.set(null);
    this.onlyWithoutAttacks.set(false);
  }
}
