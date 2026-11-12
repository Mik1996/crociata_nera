import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../../core/backend/admin.service';
import { BackendMessage } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import type { AdminUserDialogData } from './link-players-dialog';

/**
 * Confirms the deletion of a user: "Delete" is enabled only once the username is typed exactly
 * (the backend checks it again). Closes with `true` once deleted.
 */
@Component({
  selector: 'app-delete-user-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delete-user-dialog.html',
  styleUrl: './delete-user-dialog.scss',
})
export class DeleteUserDialog {
  protected readonly data = inject<AdminUserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DeleteUserDialog, boolean>>(MatDialogRef);
  private readonly admin = inject(AdminService);

  protected readonly typed = signal('');
  protected readonly matches = computed(() => this.typed() === this.data.user.username);
  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected submit(): void {
    if (!this.matches() || this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    this.admin.deleteUser(this.data.user.id, this.typed()).subscribe({
      next: () => this.ref.close(true),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
