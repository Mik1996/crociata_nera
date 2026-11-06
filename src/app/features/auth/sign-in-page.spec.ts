import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideCocApiTest } from '../../testing/fixtures';
import { SignInPage } from './sign-in-page';

const session = {
  result: {
    accessToken: 't',
    accessTokenExpiresAt: '',
    user: { id: '1', email: 'a@b.io', username: 'alice', roles: ['USER'], playerTag: null, emailVerified: false, createdAt: '' },
  },
  messages: [],
  status: { code: 200, name: 'HTTP_STATUS.OK' },
};

describe('SignInPage', () => {
  let httpMock: HttpTestingController;

  async function render(returnUrl?: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: true })],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SignInPage);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function fill(el: HTMLElement, name: string, value: string): void {
    const input = el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(el: HTMLElement): void {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  afterEach(() => httpMock.verify());

  it('shows translated validation errors without calling the backend', async () => {
    const { fixture, el } = await render();
    submit(el);
    await fixture.whenStable();

    const errors = [...el.querySelectorAll('mat-error')].map((e) => e.textContent!.trim());
    expect(errors).toEqual(["Inserisci l'email o lo username.", 'Inserisci la password.']);
    httpMock.expectNone('/api/v1/auth/sign-in');
  });

  it('signs in and goes back to the requested page', async () => {
    const { fixture, el } = await render('/statistics');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fill(el, 'identifier', ' alice ');
    fill(el, 'password', 'secret123');
    submit(el);
    const req = httpMock.expectOne('/api/v1/auth/sign-in');
    expect(req.request.body).toEqual({ identifier: 'alice', password: 'secret123' });
    req.flush(session);
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/statistics');
  });

  it('never redirects outside the app', async () => {
    const { fixture, el } = await render('//evil.example');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fill(el, 'identifier', 'alice');
    fill(el, 'password', 'secret123');
    submit(el);
    httpMock.expectOne('/api/v1/auth/sign-in').flush(session);
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows the backend error in an alert', async () => {
    const { fixture, el } = await render();
    fill(el, 'identifier', 'alice');
    fill(el, 'password', 'wrong-pass1');
    submit(el);
    httpMock.expectOne('/api/v1/auth/sign-in').flush(
      { result: null, messages: [{ key: 'ERROR.INVALID_CREDENTIALS' }], status: { code: 401, name: 'HTTP_STATUS.UNAUTHORIZED' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Email, username o password non corretti.');
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('explains when the backend is unreachable', async () => {
    const { fixture, el } = await render();
    fill(el, 'identifier', 'alice');
    fill(el, 'password', 'secret123');
    submit(el);
    httpMock.expectOne('/api/v1/auth/sign-in').error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Impossibile contattare il server');
  });
});
