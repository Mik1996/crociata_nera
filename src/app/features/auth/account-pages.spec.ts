import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { provideCocApiTest } from '../../testing/fixtures';
import { ForgotPasswordPage } from './forgot-password-page';
import { ResetPasswordPage } from './reset-password-page';
import { VerifyEmailPage } from './verify-email-page';

const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });
const fail = (key: string, code = 400) => ({ result: null, messages: [{ key }], status: { code, name: 'X' } });

describe('account pages', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function fill(el: HTMLElement, values: Record<string, string>): void {
    for (const [name, value] of Object.entries(values)) {
      const input = el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
  }

  it('forgot password: sends the email with the current language and confirms', async () => {
    const fixture = TestBed.createComponent(ForgotPasswordPage);
    const el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();

    fill(el, { email: ' knight@crociata.it ' });
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = httpMock.expectOne('/api/v1/auth/forgot-password');
    expect(req.request.body).toEqual({ email: 'knight@crociata.it', language: 'it-IT' });
    req.flush(ok(null));
    await fixture.whenStable();

    expect(el.querySelector('[role="status"]')!.textContent).toContain('knight@crociata.it');
    expect(el.querySelector('form')).toBeNull();
  });

  it('reset password: asks for a new link when the token is missing', async () => {
    const fixture = TestBed.createComponent(ResetPasswordPage);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!.textContent).toContain('Il link non è completo');
  });

  it('reset password: sends token and new password, shows backend errors and success', async () => {
    const fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.componentRef.setInput('token', 'abc');
    const el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();

    fill(el, { password: 'brandnew9', repeatPassword: 'brandnew9' });
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    httpMock.expectOne('/api/v1/auth/reset-password').flush(fail('ERROR.INVALID_OR_EXPIRED_RESET_TOKEN'), { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('non è valido o è scaduto');

    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = httpMock.expectOne('/api/v1/auth/reset-password');
    expect(req.request.body).toEqual({ token: 'abc', password: 'brandnew9', repeatPassword: 'brandnew9' });
    req.flush(ok(null));
    await fixture.whenStable();
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Password aggiornata');
  });

  it('verify email: confirms the token on open', async () => {
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.componentRef.setInput('token', 'tok');
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/v1/auth/verify-email');
    expect(req.request.body).toEqual({ token: 'tok' });
    req.flush(ok({ id: '1', email: 'a@b.io', username: 'a', roles: ['USER'], playerTag: null, emailVerified: true, createdAt: '' }));
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')!.textContent).toContain('Email confermata');
  });

  it('verify email: explains an expired link', async () => {
    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.componentRef.setInput('token', 'old');
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/auth/verify-email').flush(fail('ERROR.INVALID_OR_EXPIRED_VERIFY_TOKEN'), { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')!.textContent).toContain('non è valido o è scaduto');
  });
});
