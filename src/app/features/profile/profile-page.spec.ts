import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { ProfilePage } from './profile-page';

const user = { id: '1', email: 'knight@crociata.it', username: 'Knight', roles: ['USER'], playerTag: null as string | null, emailVerified: false, createdAt: '2026-11-01T10:00:00Z' };
const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });

describe('ProfilePage', () => {
  let httpMock: HttpTestingController;

  async function render(changes: Partial<typeof user & { playerTagVerified: boolean }> = {}) {
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
    httpMock.expectOne('/api/v1/auth/refresh').flush(ok({ accessToken: 'tok', accessTokenExpiresAt: '', user: { ...user, ...changes } }));
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

  it('links the player only with the in-game token, then unlinks it', async () => {
    const { fixture, el } = await render();
    const field = (name: string) => el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
    const form = field('playerTag').closest('form')!;

    // Tag without token: not sent.
    field('playerTag').value = 'abc123';
    field('playerTag').dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    httpMock.expectNone('/api/v1/auth/me/player');
    expect(el.textContent).toContain('Inserisci il token API mostrato nel gioco.');

    field('token').value = ' tok123 ';
    field('token').dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    const req = httpMock.expectOne('/api/v1/auth/me/player');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ playerTag: '#ABC123', token: 'tok123' });
    req.flush(ok({ ...user, playerTag: '#ABC123', playerTagVerified: true }));
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).playerTag()).toBe('#ABC123');
    expect(el.textContent).toContain('Account di gioco verificato e collegato.');
    // Verified: the form is gone, the unlink button remains.
    expect(el.querySelector('input[formcontrolname="token"]')).toBeNull();

    [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Scollega'))!.click();
    const unlink = httpMock.expectOne('/api/v1/auth/me');
    expect(unlink.request.body).toEqual({ playerTag: null });
    unlink.flush(ok({ ...user, playerTag: null, playerTagVerified: false }));
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).linkedTag()).toBeNull();
  });

  it('keeps an old unverified tag, not treated as the signed-in player until verified', async () => {
    const { el } = await render({ playerTag: '#OLD123', playerTagVerified: false });
    const auth = TestBed.inject(AuthService);
    expect(auth.linkedTag()).toBe('#OLD123');
    expect(auth.playerTag()).toBeNull();
    expect(el.textContent).toContain('Non verificato');
    // The form is pre-filled with the old tag: only the token is missing.
    expect(el.querySelector<HTMLInputElement>('input[formcontrolname="playerTag"]')!.value).toBe('#OLD123');
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
