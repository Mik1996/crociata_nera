import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { AdminPage } from './admin-page';

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
    httpMock
      .expectOne('/api/v1/admin/users?page=1&limit=50')
      .flush(ok({ items: [me, member], total: 2, page: 1, limit: 50 }));
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
    dialogButton('.submit').click();
    await fixture.whenStable();
    expect(dialog()!.textContent).toContain('Tag non valido: no!');

    type(input, 'mem123, #Mem456');
    await fixture.whenStable();
    dialogButton('.submit').click();
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
    dialogButton('.submit').click();
    httpMock
      .expectOne('/api/v1/admin/users/m1/players')
      .flush(
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
    expect(dialogButton('.submit').disabled).toBe(true);
    boxes[0]!.click();
    boxes[1]!.click();
    await fixture.whenStable();
    dialogButton('.submit').click();

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
