import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideCocApiTest } from '../../testing/fixtures';
import { SignUpPage } from './sign-up-page';

describe('SignUpPage', () => {
  let httpMock: HttpTestingController;

  async function render() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: true })],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SignUpPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function fill(el: HTMLElement, values: Record<string, string>): void {
    for (const [name, value] of Object.entries(values)) {
      const input = el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
  }

  const errorTexts = (el: HTMLElement) => [...el.querySelectorAll('mat-error')].map((e) => e.textContent!.trim());

  afterEach(() => httpMock.verify());

  it('checks the same rules as the backend before sending', async () => {
    const { fixture, el } = await render();
    fill(el, { email: 'nope', username: 'a b', password: 'short', repeatPassword: 'other', playerTag: '#!' });
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(errorTexts(el)).toEqual([
      'Inserisci un indirizzo email valido.',
      'Da 3 a 24 caratteri: lettere, numeri, punto, trattino e trattino basso.',
      'Almeno 8 caratteri, con una lettera e un numero.',
      'Le password non coincidono.',
      'Tag non valido: # seguito da 3–15 lettere o numeri.',
    ]);
    httpMock.expectNone('/api/v1/auth/sign-up');
  });

  it('normalises the player tag, signs up and shows backend field errors', async () => {
    const { fixture, el } = await render();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fill(el, { email: 'a@b.io', username: 'alice', password: 'secret123', repeatPassword: 'secret123', playerTag: 'abc123' });
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    const req = httpMock.expectOne('/api/v1/auth/sign-up');
    expect(req.request.body).toEqual({
      email: 'a@b.io',
      username: 'alice',
      password: 'secret123',
      repeatPassword: 'secret123',
      playerTag: '#ABC123',
    });
    req.flush(
      {
        result: null,
        messages: [{ key: 'ERROR.EMAIL_IS_ALREADY_TAKEN', field: 'email' }],
        status: { code: 409, name: 'HTTP_STATUS.CONFLICT' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(errorTexts(el)).toEqual(['Questa email è già registrata.']);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('omits an empty player tag', async () => {
    const { fixture, el } = await render();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fill(el, { email: 'a@b.io', username: 'alice', password: 'secret123', repeatPassword: 'secret123' });
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = httpMock.expectOne('/api/v1/auth/sign-up');
    expect(req.request.body).not.toHaveProperty('playerTag');
    req.flush({ result: { accessToken: 't', accessTokenExpiresAt: '', user: { username: 'alice' } }, messages: [], status: { code: 201, name: '' } });
    await fixture.whenStable();
  });
});
