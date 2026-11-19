import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { TelegramChat, TelegramStatus } from '../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../testing/fixtures';
import { TelegramAdminPage } from './telegram-admin-page';

const STATUS_URL = '/api/v1/admin/telegram';

const th18: TelegramChat = {
  chatId: -1001800,
  title: 'Arsenale basi TH18',
  username: 'basi18',
  type: 'channel',
  botStatus: 'administrator',
  canPost: true,
  townHallLevel: 18,
  locked: false,
  updatedAt: '2026-11-19T10:00:00Z',
};
const th19: TelegramChat = {
  ...th18,
  chatId: -1001900,
  title: 'Arsenale basi TH19',
  username: null,
  canPost: false,
  townHallLevel: null,
};
const status: TelegramStatus = {
  configured: true,
  botUsername: 'CrociataNeraBot',
  updates: 'webhook',
  chats: [th18, th19],
  basePosts: {
    sent: 12,
    waiting: [{ townHallLevel: 19, bases: 3 }],
    failed: [{ baseId: 'b1', townHallLevel: 18, error: 'Bad Request: wrong file', retryAt: null }],
    pending: 0,
  },
};
const ok = <T>(result: T, messages: unknown[] = []) => ({
  result,
  messages,
  status: { code: 200, name: 'HTTP_STATUS.OK' },
});

describe('TelegramAdminPage', () => {
  let httpMock: HttpTestingController;

  async function render(initial: TelegramStatus = status) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: true }),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TelegramAdminPage);
    fixture.detectChanges();
    httpMock.expectOne(STATUS_URL).flush(ok(initial));
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => httpMock.verify());

  it('shows the bot, the posts and the channels with their town hall', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('@CrociataNeraBot');
    expect(el.textContent).toContain('Webhook (produzione)');
    expect(el.textContent).toContain('12');
    expect(el.textContent).toContain('Basi TH19 in attesa: 3');
    expect(el.textContent).toContain('Bad Request: wrong file');
    const chats = el.querySelectorAll('.chat');
    expect(chats).toHaveLength(2);
    expect(chats[0].textContent).toContain('Arsenale basi TH18');
    expect(chats[0].querySelector('a')!.getAttribute('href')).toBe('https://t.me/basi18');
    expect(chats[0].textContent).toContain('TH18');
    expect(chats[0].textContent).toContain('Può pubblicare');
    expect(chats[1].textContent).toContain('Non può pubblicare');
  });

  it('binds a channel to a town hall and shows the answer', async () => {
    const { fixture, el } = await render();
    const page = fixture.componentInstance as unknown as {
      setTownHall(chat: TelegramChat, value: number): void;
    };
    page.setTownHall(th19, 19);
    const req = httpMock.expectOne(`${STATUS_URL}/chats/-1001900`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ townHallLevel: 19 });
    req.flush(ok({ ...th19, townHallLevel: 19 }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Canale Arsenale basi TH19 aggiornato.');

    // "None" unbinds it.
    page.setTownHall({ ...th19, townHallLevel: 19 }, 0);
    expect(httpMock.expectOne(`${STATUS_URL}/chats/-1001900`).request.body).toEqual({
      townHallLevel: null,
    });
  });

  it('locks a channel: its town hall and its removal are disabled until it is unlocked', async () => {
    const { fixture, el } = await render();
    const chat = () => el.querySelectorAll('.chat')[0];
    expect(chat().querySelector('mat-select')!.getAttribute('aria-disabled')).toBe('false');
    chat().querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    const req = httpMock.expectOne(`${STATUS_URL}/chats/-1001800`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ locked: true });
    req.flush(ok({ ...th18, locked: true }));
    await fixture.whenStable();
    expect(chat().querySelector('mat-select')!.getAttribute('aria-disabled')).toBe('true');
    expect(chat().querySelector<HTMLButtonElement>('.chat__remove')!.disabled).toBe(true);
    expect(el.textContent).toContain('Canale Arsenale basi TH18 aggiornato.');

    chat().querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    expect(httpMock.expectOne(`${STATUS_URL}/chats/-1001800`).request.body).toEqual({
      locked: false,
    });
  });

  it('offers only the town halls not taken by another channel', async () => {
    const { fixture } = await render();
    const page = fixture.componentInstance as unknown as {
      townHallOptions(chat: TelegramChat): { value: number; label: string; image?: string }[];
    };
    const values = page.townHallOptions(th19).map((o) => o.value);
    expect(values[0]).toBe(0);
    expect(values).not.toContain(18);
    expect(values).toContain(19);
    expect(page.townHallOptions(th18).map((o) => o.value)).toContain(18);
    const options = page.townHallOptions(th19);
    expect(options.find((o) => o.value === 19)?.image).toBe('game/town-halls/th-19.webp');
    expect(options[0].image).toBeUndefined();
  });

  it('adds a channel by @username, showing the backend error when it is not found', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector<HTMLInputElement>('.add input')!;
    input.value = '@missing';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.add button[type=submit]')!.click();
    const req = httpMock.expectOne(`${STATUS_URL}/chats`);
    expect(req.request.body).toEqual({ chat: '@missing' });
    req.flush(
      { result: null, messages: [{ key: 'ERROR.TELEGRAM_CHAT_NOT_FOUND' }], status: { code: 404 } },
      { status: 404, statusText: 'Not Found' },
    );
    await fixture.whenStable();
    expect(el.querySelector('crn-alert')!.textContent).toContain('Canale non trovato');
  });

  it('says when the bot is not configured, and locks the actions', async () => {
    const { el } = await render({
      ...status,
      configured: false,
      botUsername: null,
      updates: null,
      chats: [],
    });
    expect(el.textContent).toContain('Il bot non è configurato sul server');
    expect(el.textContent).toContain('Nessun canale, per ora.');
    const retry = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Riprova ora'),
    )!;
    expect(retry.disabled).toBe(true);
  });
});
