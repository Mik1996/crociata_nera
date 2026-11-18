import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage, CwlExclusion } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import {
  CwlSelectionService,
  MAX_EXCLUSION_REASON_LENGTH,
} from '../../../core/backend/cwl-selection.service';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';

export interface ExcludePlayerDialogData {
  tag: string;
  name: string;
  /** Current reason, when the player is already excluded (the dialog then changes it). */
  reason: string | null;
}

/**
 * Excludes a player from the CWL line-up, with an optional reason (administrators). Closes with
 * the saved exclusion.
 */
@Component({
  selector: 'crn-exclude-player-dialog',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, TranslatePipe, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exclude-player-dialog.html',
  styleUrl: './exclude-player-dialog.scss',
})
export class ExcludePlayerDialog {
  protected readonly data = inject<ExcludePlayerDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ExcludePlayerDialog, CwlExclusion>>(MatDialogRef);
  private readonly service = inject(CwlSelectionService);

  protected readonly maxReason = MAX_EXCLUSION_REASON_LENGTH;
  protected readonly reason = signal(this.data.reason ?? '');
  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    this.service.exclude(this.data.tag, this.reason().trim() || null).subscribe({
      next: (exclusion) => this.ref.close(exclusion),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
