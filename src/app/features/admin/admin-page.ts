import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Icon } from '../../shared/icon/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { map, Observable } from 'rxjs';
import { AdminService, AdminUserQuery } from '../../core/backend/admin.service';
import { AuthService } from '../../core/backend/auth.service';
import { AdminUser, BackendMessage } from '../../core/backend/backend-api.types';
import { backendErrors } from '../../core/backend/backend-errors';
import { LocalDatePipe } from '../../core/i18n/locale-pipes';
import { PageHeader } from '../../shared/components/page-header';
import { ScrollFade } from '../../shared/directives/scroll-fade';
import { serverTable } from '../../shared/table/server-table';
import { Table } from '../../shared/table/table';
import {
  DayRange,
  dayRangeInstants,
  TableFilters,
  TableQuery,
} from '../../shared/table/table-filters';
import { DeleteUserDialog } from './components/delete-user-dialog';
import { AdminUserDialogData, LinkPlayersDialog } from './components/link-players-dialog';
import { UnlinkPlayersDialog, UnlinkPlayersDialogData } from './components/unlink-players-dialog';

/** Users per page. */
const PAGE_SIZE = 25;

/** Backend field of each sortable column. */
const SORT_FIELDS: Record<string, AdminUserQuery['sort']> = {
  user: 'username',
  verified: 'verified',
  createdAt: 'createdAt',
};

/** The backend query of what the table asks for (filters by column, page and sort). */
export function userQuery(query: TableQuery): AdminUserQuery {
  const { filters, sort } = query;
  const text = (column: string) => (filters[column] as string | undefined)?.trim() || undefined;
  const flag = (column: string) => filters[column] as boolean | undefined;
  const created = dayRangeInstants(filters['createdAt'] as DayRange | undefined);
  const params: AdminUserQuery = {
    page: query.pageIndex + 1,
    limit: query.pageSize || PAGE_SIZE,
    user: text('user'),
    playerTag: text('playerTag'),
    admin: flag('admin'),
    verified: flag('verified'),
    createdFrom: created.from,
    createdBefore: created.before,
    ...(sort.direction && SORT_FIELDS[sort.active]
      ? { sort: SORT_FIELDS[sort.active], order: sort.direction }
      : {}),
  };
  // Only the parameters with a value go in the URL.
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  ) as AdminUserQuery;
}

const DIALOG_CONFIG = {
  width: '28rem',
  maxWidth: 'calc(100vw - 2rem)',
  autoFocus: 'first-tabbable',
} as const;

/** Administration: registered users, ADMIN role, linked player tags and deletion of users. */
@Component({
  selector: 'crn-admin-page',
  imports: [
    Table,
    MatButtonModule,
    Icon,
    MatSlideToggleModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    TranslatePipe,
    LocalDatePipe,
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

  /** Filters by column: the backend applies them (as the sort and the pages). */
  protected readonly filters: TableFilters<AdminUser> = {
    user: { type: 'text', placeholder: 'admin.userPlaceholder' },
    playerTag: { type: 'text' },
    admin: { type: 'boolean' },
    verified: { type: 'boolean' },
    createdAt: { type: 'date' },
  };
  protected readonly pageSize = PAGE_SIZE;

  /** Users, filtered, sorted and paged by the backend. */
  protected readonly users = serverTable({
    load: (query) =>
      this.admin
        .listUsers(userQuery(query))
        .pipe(map((page) => ({ ...page, limit: page.limit ?? null }))),
  });
  /** Registered users: the total of the last page asked without filters. */
  protected readonly total = linkedSignal<number, number>({
    source: () =>
      !this.users.loaded() || Object.keys(this.users.query()?.filters ?? {}).length
        ? -1
        : this.users.total(),
    computation: (total, previous) => (total >= 0 ? total : (previous?.value ?? 0)),
  });

  protected readonly busy = signal<string | null>(null);
  protected readonly feedback = signal<{
    kind: 'success' | 'error';
    messages: BackendMessage[];
  } | null>(null);

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
        this.users.update((page) => ({
          ...page,
          items: page.items.filter((u) => u.id !== user.id),
          total: page.total - 1,
        }));
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
    this.users.update((page) => ({
      ...page,
      items: page.items.map((u) => (u.id === user.id ? user : u)),
    }));
  }
}
