import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage, BaseProposal } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { DefenseBasesService } from '../../../core/backend/defense-bases.service';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';

/** Longest reason of a rejection accepted by the backend. */
export const MAX_REJECTION_REASON_LENGTH = 500;

export type ProposalDecision = 'approve' | 'reject';

export interface ProposalDecisionDialogData {
  proposal: BaseProposal;
  decision: ProposalDecision;
  /** Thumbnail, as a reminder of which base is being reviewed. */
  imageUrl: string;
}

/**
 * Asks to confirm the approval of a proposal (published at once) or its rejection, with the reason
 * shown to the author (required). Closes with the reviewed proposal.
 */
@Component({
  selector: 'crn-proposal-decision-dialog',
  imports: [ConfirmDialog, MatFormFieldModule, MatInputModule, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './proposal-decision-dialog.html',
  styleUrl: './proposal-decision-dialog.scss',
})
export class ProposalDecisionDialog {
  protected readonly data = inject<ProposalDecisionDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ProposalDecisionDialog, BaseProposal>>(MatDialogRef);
  private readonly service = inject(DefenseBasesService);

  protected readonly rejecting = this.data.decision === 'reject';
  protected readonly maxReason = MAX_REJECTION_REASON_LENGTH;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(MAX_REJECTION_REASON_LENGTH)],
  });
  protected readonly reasonText = toSignal(this.reason.valueChanges, { initialValue: '' });

  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected reasonMissing(): boolean {
    return this.rejecting && !this.reasonText().trim();
  }

  protected confirm(): void {
    if (this.busy()) return;
    const reason = this.reason.value.trim();
    if (this.rejecting && (!reason || this.reason.invalid)) {
      this.reason.markAsTouched();
      return;
    }
    this.busy.set(true);
    this.errors.set([]);
    const id = this.data.proposal.id;
    const request = this.rejecting ? this.service.reject(id, reason) : this.service.approve(id);
    request.subscribe({
      next: (reviewed) => this.ref.close(reviewed),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
