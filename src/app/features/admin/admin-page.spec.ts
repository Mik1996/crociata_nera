import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { AdminPage, userQuery } from './admin-page';

/** First page: 25 users, most recent sign-ups first. */
const USERS_URL = '/api/v1/admin/users?page=1&limit=25&sort=createdAt&order=desc';

const me = {
  id: 'me',
  email: 'boss@x.io',
  username: 'Boss',
  roles: ['USER', 'ADMIN'],
  players: [],
  emailVerified: true,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '',
};
const member = {
  id: 'm1',
  email: 'm@x.io',
  username: 'Member',
  roles: ['USER'],
  players: [],
  emailVerified: false,
  createdAt: '2026-11-02T10:00:00Z',
  updatedAt: '',
};
const ok = <T>(result: T) => ({
  result,
  messages: [],
  status: { code: 200, name: 'HTTP_STATUS.OK' },
});

describe('AdminPage', () => {
  let httpMock: HttpTestingController;

  async function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
        // Dialogs close at once, without the exit animation.
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession();
    httpMock
      .expectOne('/api/v1/auth/refresh')
      .flush(ok({ accessToken: 'tok', accessTokenExpiresAt: '', user: me }));
    const fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
    httpMock.expectOne(USERS_URL).flush(ok({ items: [me, member], total: 2, page: 1, limit: 25 }));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => httpMock.verify());

  /** Elements of the open dialog (rendered in the overlay, outside the component). */
  const dialog = () => document.querySelector('mat-dialog-container') as HTMLElement | null;
  const dialogButton = (selector: string) => dialog()!.querySelector<HTMLButtonElement>(selector)!;
  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('lists users; the own admin switch and delete button are locked', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Tu');
    expect(rows[0].querySelector('button[role="switch"]')!.hasAttribute('disabled')).toBe(true);
    expect(rows[0].querySelector('.action-delete')!.hasAttribute('disabled')).toBe(true);
    expect(rows[1].querySelector('.action-delete')!.hasAttribute('disabled')).toBe(false);
    // Nothing to unlink yet.
    expect(rows[1].querySelector('.action-unlink')!.hasAttribute('disabled')).toBe(true);
    expect(el.querySelector('th.mat-column-actions')!.textContent).toContain('Azioni');
  });

  it('asks the backend for the users matching the filters, sorted and a page at a time', async () => {
    const { fixture, el } = await render();
    // A request in flight keeps `whenStable` waiting: a short pause lets the page send it.
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const users = (matches: (params: URLSearchParams) => boolean) =>
      httpMock.expectOne(
        (req) =>
          req.url === '/api/v1/admin/users' &&
          matches(new URL(req.urlWithParams, 'http://x').searchParams),
      );

    // Text filters wait for a pause in typing, then start again from the first page.
    el.querySelector<HTMLButtonElement>('.crn-table__toggle')!.click();
    await fixture.whenStable();
    type(el.querySelector<HTMLInputElement>('.crn-table__filter-row input[type="search"]')!, 'mem');
    await pause(100);
    httpMock.expectNone((req) => req.urlWithParams.includes('user=mem'));
    await pause(300);
    users((p) => p.get('user') === 'mem' && p.get('page') === '1').flush(
      ok({ items: [member], total: 30, page: 1, limit: 25 }),
    );
    await fixture.whenStable();
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(el.querySelector('.crn-table__count')!.textContent).toContain('30 risultati');

    // More than one page: the next one, with the same filters.
    el.querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    await pause(50);
    users((p) => p.get('page') === '2' && p.get('user') === 'mem').flush(
      ok({ items: [member], total: 30, page: 2, limit: 25 }),
    );
    await fixture.whenStable();

    // Sorting by user: ascending usernames, from the first page again.
    el.querySelector<HTMLElement>('th.mat-column-user .mat-sort-header-container')!.click();
    await pause(50);
    users(
      (p) =>
        p.get('sort') === 'username' &&
        p.get('order') === 'asc' &&
        p.get('user') === 'mem' &&
        p.get('page') === '1',
    ).flush(ok({ items: [member], total: 30, page: 1, limit: 25 }));
    await fixture.whenStable();
  });

  it('turns the query of the table into the parameters of the backend', () => {
    expect(
      userQuery({
        filters: {
          user: ' anna ',
          admin: false,
          createdAt: { from: '2026-11-01', to: '2026-11-30' },
        },
        pageIndex: 2,
        pageSize: 50,
        sort: { active: 'verified', direction: 'asc' },
      }),
    ).toEqual({
      page: 3,
      limit: 50,
      user: 'anna',
      admin: false,
      createdFrom: new Date(2026, 10, 1).toISOString(),
      createdBefore: new Date(2026, 11, 1).toISOString(),
      sort: 'verified',
      order: 'asc',
    });
    // No sort direction: the backend's own order.
    expect(
      userQuery({
        filters: {},
        pageIndex: 0,
        pageSize: 25,
        sort: { active: 'user', direction: '' },
      }),
    ).toEqual({ page: 1, limit: 25 });
  });

  it('promotes a user to admin', async () => {
    const { fixture, el } = await render();
    const row = el.querySelectorAll('tr.mat-mdc-row')[1]!;

    (row.querySelector('button[role="switch"]') as HTMLButtonElement).click();
    const promote = httpMock.expectOne('/api/v1/admin/users/m1');
    expect(promote.request.method).toBe('PATCH');
    expect(promote.request.body).toEqual({ roles: ['USER', 'ADMIN'] });
    promote.flush(ok({ ...member, roles: ['USER', 'ADMIN'] }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Member aggiornato');
  });

  it('links several accounts from the "Link" dialog', async () => {
    const { fixture, el } = await render();
    el.querySelectorAll('tr.mat-mdc-row')[1]!
      .querySelector<HTMLButtonElement>('.action-link')!
      .click();
    await fixture.whenStable();
    expect(dialog()!.textContent).toContain('Collega account a Member');

    const input = dialog()!.querySelector<HTMLInputElement>('.tag-input')!;
    type(input, 'no!');
    await fixture.whenStable();
    dialogButton('button[type="submit"]').click();
    await fixture.whenStable();
    expect(dialog()!.textContent).toContain('Tag non valido: no!');

    type(input, 'mem123, #Mem456');
    await fixture.whenStable();
    dialogButton('button[type="submit"]').click();
    const link = httpMock.expectOne('/api/v1/admin/users/m1/players');
    expect(link.request.method).toBe('POST');
    expect(link.request.body).toEqual({ playerTags: ['#MEM123', '#MEM456'] });
    link.flush(
      ok({
        ...member,
        players: [
          { tag: '#MEM123', verified: true },
          { tag: '#MEM456', verified: true },
        ],
      }),
    );
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    const cells = el.querySelectorAll('tr.mat-mdc-row')[1]!.querySelectorAll('.tag-cell');
    expect([...cells].map((c) => c.querySelector('.cn-num')!.textContent!.trim())).toEqual([
      '#MEM123',
      '#MEM456',
    ]);
    expect(el.textContent).toContain('Member aggiornato');
  });

  it('shows the backend errors inside the "Link" dialog', async () => {
    const { fixture, el } = await render();
    el.querySelectorAll('tr.mat-mdc-row')[1]!
      .querySelector<HTMLButtonElement>('.action-link')!
      .click();
    await fixture.whenStable();
    type(dialog()!.querySelector<HTMLInputElement>('.tag-input')!, '#TAKEN1');
    await fixture.whenStable();
    dialogButton('button[type="submit"]').click();
    httpMock.expectOne('/api/v1/admin/users/m1/players').flush(
      {
        result: null,
        messages: [
          {
            key: 'ERROR.PLAYER_TAG_LINKED_TO_OTHER_USER',
            params: { tag: '#TAKEN1' },
            field: 'playerTags',
          },
        ],
        status: { code: 409, name: 'CONFLICT' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();
    expect(dialog()!.textContent).toContain('#TAKEN1 è già collegato a un altro utente.');
  });

  it('unlinks the accounts picked in the "Unlink" dialog', async () => {
    const { fixture, el } = await render();
    const linked = {
      ...member,
      players: [
        { tag: '#MEM123', verified: true },
        { tag: '#MEM456', verified: false },
        { tag: '#MEM789', verified: true },
      ],
    };
    fixture.componentInstance['users'].update(
      (page) => page && ({ ...page, items: [me, linked] } as typeof page),
    );
    await fixture.whenStable();
    el.querySelectorAll('tr.mat-mdc-row')[1]!
      .querySelector<HTMLButtonElement>('.action-unlink')!
      .click();
    await fixture.whenStable();

    const boxes = dialog()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(3);
    expect(dialogButton('button[type="submit"]').disabled).toBe(true);
    boxes[0]!.click();
    boxes[1]!.click();
    await fixture.whenStable();
    dialogButton('button[type="submit"]').click();

    const first = httpMock.expectOne('/api/v1/admin/users/m1/players/MEM123');
    expect(first.request.method).toBe('DELETE');
    first.flush(ok({ ...linked, players: linked.players.slice(1) }));
    await fixture.whenStable();
    httpMock
      .expectOne('/api/v1/admin/users/m1/players/MEM456')
      .flush(ok({ ...linked, players: linked.players.slice(2) }));
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    const cells = el.querySelectorAll('tr.mat-mdc-row')[1]!.querySelectorAll('.tag-cell');
    expect([...cells].map((c) => c.querySelector('.cn-num')!.textContent!.trim())).toEqual([
      '#MEM789',
    ]);
  });

  it('deletes a user only once the username is typed exactly; "Cancel" closes the dialog', async () => {
    const { fixture, el } = await render();
    const openDelete = async () => {
      el.querySelectorAll('tr.mat-mdc-row')[1]!
        .querySelector<HTMLButtonElement>('.action-delete')!
        .click();
      await fixture.whenStable();
    };

    await openDelete();
    dialogButton('button[mat-dialog-close]').click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();

    await openDelete();
    const input = dialog()!.querySelector<HTMLInputElement>('input')!;
    const confirm = dialogButton('button[type="submit"]');
    expect(confirm.disabled).toBe(true);
    for (const wrong of ['member', 'Member ', 'Membe']) {
      type(input, wrong);
      await fixture.whenStable();
      expect(confirm.disabled).toBe(true);
    }
    type(input, 'Member');
    await fixture.whenStable();
    expect(confirm.disabled).toBe(false);
    confirm.click();

    const remove = httpMock.expectOne('/api/v1/admin/users/m1');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toEqual({ username: 'Member' });
    remove.flush(ok(null));
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(el.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
    expect(el.textContent).toContain('Member eliminato');
    expect(el.textContent).toContain('Utenti registrati: 1');
  });
});
