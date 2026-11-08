import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { AdminPage } from './admin-page';

const me = { id: 'me', email: 'boss@x.io', username: 'Boss', roles: ['USER', 'ADMIN'], playerTag: null, emailVerified: true, createdAt: '2026-11-01T10:00:00Z', updatedAt: '' };
const member = { id: 'm1', email: 'm@x.io', username: 'Member', roles: ['USER'], playerTag: null, emailVerified: false, createdAt: '2026-11-02T10:00:00Z', updatedAt: '' };
const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });

describe('AdminPage', () => {
  let httpMock: HttpTestingController;

  async function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession();
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok({ accessToken: 'tok', accessTokenExpiresAt: '', user: me }));
    const fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/admin/users?page=1&limit=50').flush(ok({ items: [me, member], total: 2, page: 1, limit: 50 }));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => httpMock.verify());

  it('lists users; the own admin switch is locked', async () => {
    const { el } = await render();
    const rows = el.querySelectorAll('tr.mat-mdc-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Tu');
    expect(rows[0].querySelector('button[role="switch"]')!.hasAttribute('disabled')).toBe(true);
  });

  it('promotes a user to admin and unlinks a player tag', async () => {
    const { fixture, el } = await render();
    const row = el.querySelectorAll('tr.mat-mdc-row')[1]!;

    (row.querySelector('button[role="switch"]') as HTMLButtonElement).click();
    const promote = httpMock.expectOne('/api/v1/admin/users/m1');
    expect(promote.request.method).toBe('PATCH');
    expect(promote.request.body).toEqual({ roles: ['USER', 'ADMIN'] });
    promote.flush(ok({ ...member, roles: ['USER', 'ADMIN'] }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Member aggiornato');

    // Administrators cannot type a tag: they can only unlink one.
    expect(el.querySelector('.tag-input')).toBeNull();
    const linked = { ...member, playerTag: '#MEM123', playerTagVerified: true };
    fixture.componentInstance['users'].update((page) => page && ({ ...page, items: [me, linked] } as typeof page));
    await fixture.whenStable();
    const unlink = el.querySelectorAll('tr.mat-mdc-row')[1]!.querySelector<HTMLButtonElement>('.tag-cell button')!;
    unlink.click();
    const tag = httpMock.expectOne('/api/v1/admin/users/m1');
    expect(tag.request.body).toEqual({ playerTag: null });
    tag.flush(ok({ ...member, roles: ['USER', 'ADMIN'], playerTag: null, playerTagVerified: false }));
  });
});
