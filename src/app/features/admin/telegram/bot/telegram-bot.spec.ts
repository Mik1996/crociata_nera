import { HttpTestingController } from '@angular/common/http/testing';
import { TelegramChat } from '../../../../core/backend/backend-api.types';
import {
  news,
  ok,
  renderTelegramPage,
  status,
  STATUS_URL,
  th18,
  th19,
} from '../telegram-admin-testing';

type Content = number | 'announcements';

describe('TelegramBot', () => {
  let httpMock: HttpTestingController;

  async function render(initial = status) {
    const rendered = await renderTelegramPage('bot', initial);
    httpMock = rendered.httpMock;
    const bot = rendered.fixture.debugElement.query((d) => d.name === 'crn-telegram-bot')
      .componentInstance as {
      setContent(chat: TelegramChat, value: Content): void;
      contentOptions(chat: TelegramChat): { value: Content; label: string; image?: string }[];
    };
    return { ...rendered, bot };
  }

  afterEach(() => httpMock.verify());

  it('shows the bot and every channel with what it receives', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('@CrociataNeraBot');
    expect(el.textContent).toContain('Webhook (produzione)');
    const chats = el.querySelectorAll('.chat');
    expect(chats).toHaveLength(3);
    expect(chats[0].querySelector('a')!.getAttribute('href')).toBe('https://t.me/basi18');
    expect(chats[0].querySelector('crn-select')!.textContent).toContain('TH18');
    expect(chats[0].textContent).toContain('Può pubblicare');
    expect(chats[1].textContent).toContain('Non può pubblicare');
    expect(chats[2].querySelector('crn-select')!.textContent).toContain('Annunci');
  });

  it('binds a channel to a town hall and shows the answer', async () => {
    const { fixture, el, bot } = await render();
    bot.setContent(th19, 19);
    const req = httpMock.expectOne(`${STATUS_URL}/chats/-1001900`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ purpose: 'bases', townHallLevel: 19 });
    req.flush(ok({ ...th19, townHallLevel: 19 }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Canale Arsenale basi TH19 aggiornato.');

    // "None" unbinds it.
    bot.setContent({ ...th19, townHallLevel: 19 }, 0);
    expect(httpMock.expectOne(`${STATUS_URL}/chats/-1001900`).request.body).toEqual({
      purpose: 'bases',
      townHallLevel: null,
    });
  });

  it('makes a channel the announcements one, which is offered no town hall', async () => {
    const { fixture, bot } = await render({ ...status, chats: [th18, th19] });
    expect(bot.contentOptions(th19).map((o) => o.value)).toContain('announcements');
    bot.setContent(th19, 'announcements');
    const req = httpMock.expectOne(`${STATUS_URL}/chats/-1001900`);
    expect(req.request.body).toEqual({ purpose: 'announcements', townHallLevel: null });
    const announcements: TelegramChat = { ...th19, purpose: 'announcements' };
    req.flush(ok(announcements));
    await fixture.whenStable();

    expect(bot.contentOptions(announcements)).toEqual([
      { value: 0, label: 'Nessuno' },
      { value: 'announcements', label: 'Annunci', icon: 'campaign' },
    ]);
    // Another channel cannot be the announcements one too.
    expect(bot.contentOptions(th18).map((o) => o.value)).not.toContain('announcements');
  });

  it('offers only the town halls not taken by another channel', async () => {
    const { bot } = await render();
    const values = bot.contentOptions(th19).map((o) => o.value);
    expect(values[0]).toBe(0);
    expect(values).not.toContain(18);
    expect(values).toContain(19);
    expect(values).not.toContain('announcements');
    expect(bot.contentOptions(th18).map((o) => o.value)).toContain(18);
    const options = bot.contentOptions(th19);
    expect(options.find((o) => o.value === 19)?.image).toBe('game/town-halls/th-19.webp');
    expect(options[0].image).toBeUndefined();
    expect(bot.contentOptions(news).map((o) => o.value)).toEqual([0, 'announcements']);
  });

  it('locks a channel: its content and its removal are disabled until it is unlocked', async () => {
    const { fixture, el } = await render();
    const chat = () => el.querySelectorAll('.chat')[0];
    expect(chat().querySelector('mat-select')!.getAttribute('aria-disabled')).toBe('false');
    chat().querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    const req = httpMock.expectOne(`${STATUS_URL}/chats/-1001800`);
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

  it('says there are no channels yet, and cannot add one without the bot', async () => {
    const { el } = await render({ ...status, configured: false, botUsername: null, chats: [] });
    expect(el.textContent).toContain('Nessun canale, per ora.');
    expect(el.querySelector<HTMLInputElement>('.add input')!.disabled).toBe(true);
  });
});
