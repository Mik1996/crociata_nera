import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { concatMap, from, last } from 'rxjs';
import { AdminService } from '../../../core/backend/admin.service';
import { AdminUser, BackendMessage } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import type { AdminUserDialogData } from './link-players-dialog';

export interface UnlinkPlayersDialogData extends AdminUserDialogData {
  /** Called after each account unlinked, so the table is right even if a later one fails. */
  updated: (user: AdminUser) => void;
}

/** Unlinks the Clash of Clans accounts of a user picked from a list. Closes with the updated user. */
@Component({
  selector: 'app-unlink-players-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unlink-players-dialog.html',
  styleUrl: './unlink-players-dialog.scss',
})
export class UnlinkPlayersDialog {
  protected readonly data = inject<UnlinkPlayersDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UnlinkPlayersDialog, AdminUser>>(MatDialogRef);
  private readonly admin = inject(AdminService);

  /** Accounts still linked (updated as they are unlinked). */
  protected readonly players = signal(this.data.user.players);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected toggle(tag: string, checked: boolean): void {
    this.selected.update((tags) => {
      const next = new Set(tags);
      if (checked) next.add(tag);
      else next.delete(tag);
      return next;
    });
  }

  protected submit(): void {
    if (!this.selected().size || this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    from([...this.selected()])
      .pipe(
        concatMap((tag) => this.admin.unlinkPlayer(this.data.user.id, tag)),
        // Each step returns the updated user: keep the table and the list in step.
        concatMap(async (user) => {
          this.data.updated(user);
          this.players.set(user.players);
          this.selected.update(
            (tags) => new Set([...tags].filter((t) => user.players.some((p) => p.tag === t))),
          );
          return user;
        }),
        last(),
      )
      .subscribe({
        next: (user) => this.ref.close(user),
        error: (error: unknown) => {
          const { fields, general } = backendErrors(error);
          this.errors.set([...general, ...fields]);
          this.busy.set(false);
        },
      });
  }
}
