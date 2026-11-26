import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import {
  BackendMessage,
  CwlLineup,
  CwlLineupStatus,
  CwlSelection,
  CwlSelectionPlayer,
} from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { CwlSelectionService } from '../../../core/backend/cwl-selection.service';
import { APP_CONFIG } from '../../../core/config/app-config';
import { LocalNumberPipe } from '../../../core/i18n/locale-pipes';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { Legend } from '../../../shared/components/legend/legend';
import { LegendItem } from '../../../shared/components/legend-item/legend-item';
import { crusadeClanNames } from '../../../shared/components/table/clan-tables';
import { TownHallIcon } from '../../../shared/game/town-hall-icon';

export interface SelectionDecisionData {
  season: string;
  /** The season as the page shows it (`Dicembre 2026`). */
  label: string;
  action: 'close' | 'reopen';
  /**
   * Closing: the ranking as the page shows it now, whose line-up can be changed by hand before
   * confirming. Left out: the line-up is the ranking's, unchanged.
   */
  players?: readonly CwlSelectionPlayer[];
  /** Closing: starters the line-up must have, the size picked for the selection (15 or 30). */
  starters?: number;
}

/** The places a player can be moved between, in the order of the buttons. */
const PLACES: readonly CwlLineupStatus[] = ['starter', 'reserve', 'bench'];

const isPlace = (status: string): status is CwlLineupStatus =>
  (PLACES as readonly string[]).includes(status);

/**
 * Confirms closing the open selection of the CWL line-up (its ranking is frozen, the draft of the
 * announcement is prepared, the next season opens) or opening a closed one again. Closing shows the
 * eligible players of the ranking as they are now, so whoever closes can make the last changes by
 * hand (a reserve becomes a starter, a starter goes to the bench, reserves added or dropped…): the
 * confirmation waits, saying why in red, until there are as many starters as the size picked for the
 * selection (15 or 30); reserves are as many as
 * wanted, none too. The changes are sent with the closing
 * and live only in the frozen ranking (reopening drops them). Closes with the selection as the
 * backend returns it.
 */
@Component({
  selector: 'crn-selection-decision-dialog',
  imports: [
    TranslatePipe,
    ConfirmDialog,
    MatButtonModule,
    Icon,
    Legend,
    LegendItem,
    TownHallIcon,
    LocalNumberPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selection-decision-dialog.html',
  styleUrl: './selection-decision-dialog.scss',
})
export class SelectionDecisionDialog {
  protected readonly data = inject<SelectionDecisionData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SelectionDecisionDialog, CwlSelection>>(MatDialogRef);
  private readonly service = inject(CwlSelectionService);
  private readonly config = inject(APP_CONFIG);

  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);
  protected readonly places = PLACES;

  /** The players who can take a slot (not excluded, town hall high enough), best first. */
  protected readonly candidates = (this.data.action === 'close' ? (this.data.players ?? []) : [])
    .filter((p) => isPlace(p.status))
    .map((p) => ({ ...p, status: p.status as CwlLineupStatus }));

  /** The place the ranking gives each candidate. */
  private readonly ranked = new Map(this.candidates.map((p) => [p.tag, p.status]));
  /** The place chosen for each candidate (the ranking's until changed). */
  protected readonly picks = signal<ReadonlyMap<string, CwlLineupStatus>>(this.ranked);

  protected readonly counts = computed(() => this.count(this.picks()));
  protected readonly changed = computed(() =>
    this.candidates.some((p) => this.picks().get(p.tag) !== p.status),
  );
  /**
   * The line-up can be closed: the ranking's as it is, or one picked by hand with as many starters as
   * the size picked for the selection (15 or 30); reserves are free, none too.
   */
  protected readonly complete = computed(
    () => !this.changed() || this.counts().starter === this.requiredStarters,
  );
  /** Starters the line-up must have (the size picked with the switch of the page). */
  protected readonly requiredStarters = this.data.starters ?? 15;

  private readonly clanNames = crusadeClanNames({
    tag: this.config.clanTag,
    name: this.config.clanName,
  });

  protected clanName(tag: string): string {
    return this.clanNames.get(tag) ?? tag;
  }

  protected pick(tag: string, place: CwlLineupStatus): void {
    if (this.busy()) return;
    this.picks.update((picks) => new Map(picks).set(tag, place));
  }

  /** Back to the ranking's line-up. */
  protected reset(): void {
    this.picks.set(this.ranked);
  }

  protected submit(): void {
    if (this.busy() || (this.data.action === 'close' && !this.complete())) return;
    this.busy.set(true);
    this.errors.set([]);
    const { season, action } = this.data;
    const request =
      action === 'close' ? this.service.close(season, this.lineup()) : this.service.reopen(season);
    request.subscribe({
      next: (selection) => this.ref.close(selection),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }

  /** The line-up picked by hand, in the order of the ranking; `null` when unchanged. */
  private lineup(): CwlLineup | null {
    if (!this.changed()) return null;
    const of = (place: CwlLineupStatus) =>
      this.candidates.filter((p) => this.picks().get(p.tag) === place).map((p) => p.tag);
    return { starters: of('starter'), reserves: of('reserve') };
  }

  private count(picks: ReadonlyMap<string, CwlLineupStatus>): Record<CwlLineupStatus, number> {
    const counts = { starter: 0, reserve: 0, bench: 0 };
    for (const place of picks.values()) counts[place] += 1;
    return counts;
  }
}
