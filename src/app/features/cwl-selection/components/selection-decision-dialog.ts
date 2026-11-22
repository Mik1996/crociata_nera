import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage, CwlSelection } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { CwlSelectionService } from '../../../core/backend/cwl-selection.service';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';

export interface SelectionDecisionData {
  season: string;
  /** The season as the page shows it (`Dicembre 2026`). */
  label: string;
  action: 'close' | 'reopen';
}

/**
 * Confirms closing the open selection of the CWL line-up (its ranking is frozen, the draft of the
 * announcement is prepared, the next season opens) or opening a closed one again. Closes with the
 * selection as the backend returns it.
 */
@Component({
  selector: 'crn-selection-decision-dialog',
  imports: [TranslatePipe, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selection-decision-dialog.html',
  styleUrl: './selection-decision-dialog.scss',
})
export class SelectionDecisionDialog {
  protected readonly data = inject<SelectionDecisionData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SelectionDecisionDialog, CwlSelection>>(MatDialogRef);
  private readonly service = inject(CwlSelectionService);

  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    const { season, action } = this.data;
    const request = action === 'close' ? this.service.close(season) : this.service.reopen(season);
    request.subscribe({
      next: (selection) => this.ref.close(selection),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
