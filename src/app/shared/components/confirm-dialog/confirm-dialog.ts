import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { BackendMessage } from '../../../core/backend/backend-api.types';
import { GameButton } from '../../directives/button';
import { FormErrors } from '../form-errors/form-errors';

/**
 * Frame of a dialog that asks to confirm an action: title, the projected content (intro, fields),
 * the backend errors, "Cancel" (closes the dialog) and the confirm button, which also answers
 * Enter in a field. Used inside the template of a `MatDialog` component, which does the work on
 * `confirm` and closes itself:
 *
 * ```html
 * <crn-confirm-dialog [title]="…" [confirmLabel]="…" [busy]="busy()" [errors]="errors()" danger
 *   (confirm)="submit()">
 *   <p>…</p>
 * </crn-confirm-dialog>
 * ```
 */
@Component({
  selector: 'crn-confirm-dialog',
  imports: [FormErrors, GameButton, MatButtonModule, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly confirmLabel = input.required<string>();
  /** The action is running: confirming again is not possible. */
  readonly busy = input(false);
  /** The action cannot be confirmed yet (e.g. a required field is empty). */
  readonly disabled = input(false);
  readonly errors = input<readonly BackendMessage[]>([]);
  /** Destructive action (delete): red confirm button. */
  readonly danger = input(false, { transform: booleanAttribute });

  readonly confirm = output<void>();

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy() || this.disabled()) return;
    this.confirm.emit();
  }
}
