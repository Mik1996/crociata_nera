import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { ProfilePage } from './profile-page';

const user = { id: '1', email: 'knight@crociata.it', username: 'Knight', roles: ['USER'], playerTag: null, emailVerified: false, createdAt: '2026-11-01T10:00:00Z' };
const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });

describe('ProfilePage', () => {
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
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok({ accessToken: 'tok', accessTokenExpiresAt: '', user }));
    const fixture = TestBed.createComponent(ProfilePage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => httpMock.verify());

  it('shows the account and lets the user resend the confirmation email', async () => {
    const { fixture, el } = await render();
    expect(el.textContent).toContain('knight@crociata.it');
    expect(el.textContent).toContain('Da confermare');

    const resend = [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Invia di nuovo'))!;
    resend.click();
    const req = httpMock.expectOne('/api/v1/auth/verify-email/resend');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush(ok(null));
    await fixture.whenStable();
    expect(el.textContent).toContain('Email di conferma inviata');
  });

  it('links the player tag (normalised) and updates the session', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[formcontrolname="playerTag"]')!;
    input.value = 'abc123';
    input.dispatchEvent(new Event('input'));
    input.closest('form')!.dispatchEvent(new Event('submit'));

    const req = httpMock.expectOne('/api/v1/auth/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ playerTag: '#ABC123' });
    req.flush(ok({ ...user, playerTag: '#ABC123' }));
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).playerTag()).toBe('#ABC123');
    expect(el.textContent).toContain('Profilo aggiornato');
  });

  it('shows a wrong current password under the field', async () => {
    const { fixture, el } = await render();
    const form = el.querySelector<HTMLInputElement>('input[formcontrolname="currentPassword"]')!.closest('form')!;
    for (const [name, value] of Object.entries({ currentPassword: 'nope1234', password: 'better456', repeatPassword: 'better456' })) {
      const field = form.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    form.dispatchEvent(new Event('submit'));
    httpMock
      .expectOne('/api/v1/auth/change-password')
      .flush(
        { result: null, messages: [{ key: 'ERROR.INCORRECT_PASSWORD', field: 'currentPassword' }], status: { code: 400, name: 'X' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await fixture.whenStable();
    expect(form.querySelector('mat-error')!.textContent).toContain('La password attuale non è corretta.');
  });
});
