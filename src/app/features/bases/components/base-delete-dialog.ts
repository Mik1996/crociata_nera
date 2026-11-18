import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage, DefenseBase } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { DefenseBasesService } from '../../../core/backend/defense-bases.service';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';

export interface BaseDeleteDialogData {
  base: DefenseBase;
  /** Thumbnail of the base, as a reminder of which one is being deleted. */
  imageUrl: string;
}

/** Asks for confirmation, then deletes the base. Closes with `true` once deleted. */
@Component({
  selector: 'crn-base-delete-dialog',
  imports: [TranslatePipe, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './base-delete-dialog.html',
  styleUrl: './base-delete-dialog.scss',
})
export class BaseDeleteDialog {
  protected readonly data = inject<BaseDeleteDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BaseDeleteDialog, boolean>>(MatDialogRef);
  private readonly service = inject(DefenseBasesService);

  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected confirm(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    this.service.remove(this.data.base.id).subscribe({
      next: () => this.ref.close(true),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
