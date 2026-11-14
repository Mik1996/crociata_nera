import { COMMA, ENTER, SPACE } from '@angular/cdk/keycodes';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../../shared/icon/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../../core/backend/admin.service';
import { AdminUser, BackendMessage } from '../../../core/backend/backend-api.types';
import { backendErrors } from '../../../core/backend/backend-errors';
import { PLAYER_TAG_PATTERN } from '../../auth/auth-form';

export interface AdminUserDialogData {
  user: AdminUser;
}

/** Tag typed by hand (any case, with or without the leading hash) → upper case with the hash. */
export const normalizePlayerTag = (text: string) =>
  `#${text.trim().replace(/^#/, '').toUpperCase()}`;

/**
 * Links one or more Clash of Clans accounts to a user, typed as tags (Enter, space or comma after
 * each one). Closes with the updated user.
 */
@Component({
  selector: 'crn-link-players-dialog',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    Icon,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './link-players-dialog.html',
  styleUrl: './link-players-dialog.scss',
})
export class LinkPlayersDialog {
  protected readonly data = inject<AdminUserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<LinkPlayersDialog, AdminUser>>(MatDialogRef);
  private readonly admin = inject(AdminService);

  protected readonly separators = [ENTER, COMMA, SPACE] as const;
  protected readonly tags = signal<string[]>([]);
  /** Text being typed, not yet a chip. */
  protected readonly draft = signal('');
  /** Last text that is not a valid tag. */
  protected readonly invalid = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errors = signal<BackendMessage[]>([]);

  protected add(event: MatChipInputEvent): void {
    if (!this.addText(event.value)) return;
    event.chipInput.clear();
    this.draft.set('');
  }

  protected remove(tag: string): void {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
  }

  /** Adds every tag in the text (pasted lists too); `false` when one of them is not valid. */
  private addText(text: string): boolean {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    const wrong = parts.find((part) => !PLAYER_TAG_PATTERN.test(part.trim()));
    this.invalid.set(wrong ?? null);
    if (wrong) return false;
    const linked = new Set(this.data.user.players.filter((p) => p.verified).map((p) => p.tag));
    const added = parts.map(normalizePlayerTag).filter((tag) => !linked.has(tag));
    this.tags.update((tags) => [...new Set([...tags, ...added])]);
    return true;
  }

  protected submit(input: HTMLInputElement): void {
    // A tag still being typed counts too.
    if (input.value.trim()) {
      if (!this.addText(input.value)) return;
      input.value = '';
      this.draft.set('');
    }
    if (!this.tags().length || this.busy()) return;
    this.busy.set(true);
    this.errors.set([]);
    this.admin.linkPlayers(this.data.user.id, this.tags()).subscribe({
      next: (user) => this.ref.close(user),
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.errors.set([...general, ...fields]);
        this.busy.set(false);
      },
    });
  }
}
