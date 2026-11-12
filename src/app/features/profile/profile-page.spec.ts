import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { CocApiService } from '../../core/api/coc-api';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { provideCocApiTest } from '../../testing/fixtures';
import { ProfilePage } from './profile-page';

const user = { id: '1', email: 'knight@crociata.it', username: 'Knight', roles: ['USER'], players: [] as { tag: string; verified: boolean }[], emailVerified: false, createdAt: '2026-11-01T10:00:00Z' };
const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'HTTP_STATUS.OK' } });

describe('ProfilePage', () => {
  let httpMock: HttpTestingController;

  async function render(changes: Partial<typeof user> = {}, beforeCreate?: () => void | Promise<void>) {
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
    await beforeCreate?.();
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

  it('links accounts only with the in-game token, several of them, and unlinks one', async () => {
    const { fixture, el } = await render();
    const field = (name: string) => el.querySelector<HTMLInputElement>(`input[formcontrolname="${name}"]`)!;
    const submit = () => field('playerTag').closest('form')!.dispatchEvent(new Event('submit'));
    const type = (name: string, value: string) => {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input'));
    };
    expect(el.textContent).toContain('Nessun account collegato.');

    // Tag without token: not sent.
    type('playerTag', 'abc123');
    submit();
    await fixture.whenStable();
    httpMock.expectNone('/api/v1/auth/me/player');
    expect(el.textContent).toContain('Inserisci il token API mostrato nel gioco.');

    type('token', ' tok123 ');
    submit();
    const first = httpMock.expectOne('/api/v1/auth/me/player');
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ playerTag: '#ABC123', token: 'tok123' });
    first.flush(ok({ ...user, players: [{ tag: '#ABC123', verified: true }] }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Account di gioco verificato e collegato.');
    // Clean form after linking: empty, untouched, pristine, no errors shown.
    const form = fixture.componentInstance['tagForm'];
    expect(form.getRawValue()).toEqual({ playerTag: '', token: '' });
    expect(form.touched || form.dirty).toBe(false);
    expect(el.querySelectorAll('mat-error')).toHaveLength(0);
    expect(el.querySelectorAll('.mat-form-field-invalid')).toHaveLength(0);

    // The form stays, to link another account.
    expect(el.textContent).toContain('Collega un altro account');
    type('playerTag', '#DEF456');
    type('token', 'tok456');
    submit();
    httpMock.expectOne('/api/v1/auth/me/player').flush(
      ok({ ...user, players: [{ tag: '#ABC123', verified: true }, { tag: '#DEF456', verified: true }] }),
    );
    await fixture.whenStable();
    const auth = TestBed.inject(AuthService);
    expect([...auth.playerTags()]).toEqual(['#ABC123', '#DEF456']);
    expect(el.querySelectorAll('.linked-list > li')).toHaveLength(2);

    el.querySelector<HTMLButtonElement>('button[aria-label="Scollega l\'account #ABC123"]')!.click();
    const unlink = httpMock.expectOne('/api/v1/auth/me/player/ABC123');
    expect(unlink.request.method).toBe('DELETE');
    unlink.flush(ok({ ...user, players: [{ tag: '#DEF456', verified: true }] }));
    await fixture.whenStable();
    expect([...auth.playerTags()]).toEqual(['#DEF456']);
    expect(el.textContent).toContain('Account #ABC123 scollegato.');
  });

  it('keeps an old unverified link, not treated as the signed-in player until verified', async () => {
    const { el } = await render({ players: [{ tag: '#OLD123', verified: false }] });
    const auth = TestBed.inject(AuthService);
    expect(auth.linkedPlayers()).toEqual([{ tag: '#OLD123', verified: false }]);
    expect(auth.isMyPlayer('#OLD123')).toBe(false);
    expect(el.textContent).toContain('Non verificato');
    // The form is pre-filled with the old tag: only the token is missing.
    expect(el.querySelector<HTMLInputElement>('input[formcontrolname="playerTag"]')!.value).toBe('#OLD123');
  });

  it('finds linked accounts in the sister clans too, and says when they are in none', async () => {
    const players = [
      { tag: '#RED123', verified: true },
      { tag: '#NONE99', verified: true },
    ];
    const { el } = await render({ players }, async () => {
      const api = TestBed.inject(CocApiService);
      const main = await firstValueFrom(api.getClan());
      const original = api.getClanByTag.bind(api);
      vi.spyOn(api, 'getClanByTag').mockImplementation((tag) =>
        original(tag).pipe(
          map((clan) =>
            clan.name === 'Crociata Rossa'
              ? { ...clan, members: [{ ...main.members[0], tag: '#RED123', name: 'Redknight' }] }
              : clan,
          ),
        ),
      );
    });
    const [red, none] = [...el.querySelectorAll('.linked-list > li')].map((li) => li.textContent!);
    expect(red).toContain('Collegato a Redknight');
    expect(red).toContain('in Crociata Rossa');
    expect(red).not.toContain('non risulta');
    expect(none).toContain('Collegato al tag #NONE99');
    expect(none).toContain("non risulta tra i membri attuali di Crociata Nera, Crociata Rossa o Crociata d'Oro");
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
