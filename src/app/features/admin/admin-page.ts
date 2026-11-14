import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Icon } from '../../shared/icon/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AdminService } from '../../core/backend/admin.service';
import { AuthService } from '../../core/backend/auth.service';
import { AdminUser, BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { LocalDatePipe } from '../../core/i18n/locale-pipes';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { TABLE_WRAP } from '../../shared/directives/table-wrap';
import { DeleteUserDialog } from './components/delete-user-dialog';
import { AdminUserDialogData, LinkPlayersDialog } from './components/link-players-dialog';
import { UnlinkPlayersDialog, UnlinkPlayersDialogData } from './components/unlink-players-dialog';

const DIALOG_CONFIG = {
  width: '28rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/** Administration: registered users, ADMIN role, linked player tags and deletion of users. */
@Component({
  selector: 'app-admin-page',
  imports: [
    TABLE_WRAP,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    Icon,
    MatInputModule,
    MatSlideToggleModule,
    MatTableModule,
    MatTooltipModule,
    TranslatePipe,
    LocalDatePipe,
    LoadState,
    PageHeader,
    ScrollFade,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page--fill' },
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  protected readonly myId = computed(() => this.auth.user()?.id ?? null);

  protected readonly columns = ['user', 'playerTag', 'admin', 'verified', 'createdAt', 'actions'];

  protected readonly searchText = signal('');
  private readonly query = signal('');
  protected readonly users = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.admin.listUsers(params),
  });
  protected readonly rows = computed(() => (this.users.hasValue() ? this.users.value().items : []));
  protected readonly total = computed(() => (this.users.hasValue() ? this.users.value().total : 0));

  protected readonly busy = signal<string | null>(null);
  protected readonly feedback = signal<{
    kind: 'success' | 'error';
    messages: BackendMessage[];
  } | null>(null);

  protected search(): void {
    this.query.set(this.searchText());
  }

  /** "Link": Clash of Clans accounts linked by hand, without the in-game token. */
  protected openLink(user: AdminUser): void {
    this.dialog
      .open<LinkPlayersDialog, AdminUserDialogData, AdminUser>(LinkPlayersDialog, {
        ...DIALOG_CONFIG,
        data: { user },
      })
      .afterClosed()
      .subscribe((updated) => updated && this.updated(updated));
  }

  /** "Unlink": one or more of the user's accounts. */
  protected openUnlink(user: AdminUser): void {
    const data: UnlinkPlayersDialogData = { user, updated: (u) => this.replace(u) };
    this.dialog
      .open<UnlinkPlayersDialog, UnlinkPlayersDialogData, AdminUser>(UnlinkPlayersDialog, {
        ...DIALOG_CONFIG,
        data,
      })
      .afterClosed()
      .subscribe((updated) => updated && this.updated(updated));
  }

  /** "Delete": confirmed by typing the username. */
  protected openDelete(user: AdminUser): void {
    this.dialog
      .open<DeleteUserDialog, AdminUserDialogData, boolean>(DeleteUserDialog, {
        ...DIALOG_CONFIG,
        data: { user },
      })
      .afterClosed()
      .subscribe((deleted) => {
        if (!deleted) return;
        this.users.update(
          (page) =>
            page && {
              ...page,
              items: page.items.filter((u) => u.id !== user.id),
              total: page.total - 1,
            },
        );
        this.feedback.set({
          kind: 'success',
          messages: [{ key: 'SUCCESS.USER_DELETED', params: { name: user.username } }],
        });
      });
  }

  protected toggleAdmin(user: AdminUser, admin: boolean): void {
    this.update(user, { roles: admin ? ['USER', 'ADMIN'] : ['USER'] });
  }

  private update(user: AdminUser, changes: Parameters<AdminService['updateUser']>[1]): void {
    this.apply(user, this.admin.updateUser(user.id, changes));
  }

  /** Runs a change of a user and puts the updated user in the table. */
  private apply(user: AdminUser, request: Observable<AdminUser>): void {
    this.busy.set(user.id);
    this.feedback.set(null);
    request.subscribe({
      next: (updated) => {
        this.updated(updated);
        this.busy.set(null);
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.feedback.set({ kind: 'error', messages: [...general, ...fields] });
        this.busy.set(null);
      },
    });
  }

  /** Puts the updated user in the table and says so. */
  private updated(user: AdminUser): void {
    this.replace(user);
    this.feedback.set({
      kind: 'success',
      messages: [{ key: 'SUCCESS.USER_UPDATED', params: { name: user.username } }],
    });
  }

  private replace(user: AdminUser): void {
    this.users.update(
      (page) => page && { ...page, items: page.items.map((u) => (u.id === user.id ? user : u)) },
    );
  }
}
