import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../core/backend/admin.service';
import { AuthService } from '../../core/backend/auth.service';
import { AdminUser, BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { LocalDatePipe } from '../../core/i18n/locale-pipes';
import { LoadState } from '../../shared/components/load-state';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';

const TAG_PATTERN = /^#?[0-9A-Za-z]{3,15}$/;

/** Administration: registered users, ADMIN role and linked player tags. */
@Component({
  selector: 'app-admin-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
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
  protected readonly myId = computed(() => this.auth.user()?.id ?? null);

  protected readonly columns = ['user', 'playerTag', 'admin', 'verified', 'createdAt'];

  protected readonly searchText = signal('');
  private readonly query = signal('');
  protected readonly users = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.admin.listUsers(params),
  });
  protected readonly rows = computed(() => (this.users.hasValue() ? this.users.value().items : []));
  protected readonly total = computed(() => (this.users.hasValue() ? this.users.value().total : 0));

  /** Tag being edited per user id. */
  protected readonly tagDrafts = signal<Record<string, string>>({});
  protected readonly busy = signal<string | null>(null);
  protected readonly feedback = signal<{ kind: 'success' | 'error'; messages: BackendMessage[] } | null>(null);

  protected search(): void {
    this.query.set(this.searchText());
  }

  protected draft(user: AdminUser): string {
    return this.tagDrafts()[user.id] ?? user.playerTag ?? '';
  }

  protected setDraft(user: AdminUser, value: string): void {
    this.tagDrafts.update((drafts) => ({ ...drafts, [user.id]: value }));
  }

  protected tagChanged(user: AdminUser): boolean {
    return this.draft(user).trim().toUpperCase() !== (user.playerTag ?? '');
  }

  protected tagValid(user: AdminUser): boolean {
    const value = this.draft(user).trim();
    return !value || TAG_PATTERN.test(value);
  }

  protected saveTag(user: AdminUser): void {
    const raw = this.draft(user).trim();
    this.update(user, { playerTag: raw ? raw.toUpperCase().replace(/^#?/, '#') : null });
  }

  protected toggleAdmin(user: AdminUser, admin: boolean): void {
    this.update(user, { roles: admin ? ['USER', 'ADMIN'] : ['USER'] });
  }

  private update(user: AdminUser, changes: Parameters<AdminService['updateUser']>[1]): void {
    this.busy.set(user.id);
    this.feedback.set(null);
    this.admin.updateUser(user.id, changes).subscribe({
      next: (updated) => {
        this.users.update((page) => page && { ...page, items: page.items.map((u) => (u.id === updated.id ? updated : u)) });
        this.tagDrafts.update(({ [user.id]: _dropped, ...rest }) => rest);
        this.feedback.set({ kind: 'success', messages: [{ key: 'SUCCESS.USER_UPDATED', params: { name: updated.username } }] });
        this.busy.set(null);
      },
      error: (error: unknown) => {
        const { fields, general } = backendErrors(error);
        this.feedback.set({ kind: 'error', messages: [...general, ...fields] });
        this.busy.set(null);
      },
    });
  }
}
