import { HttpTestingController } from '@angular/common/http/testing';
import { news, renderTelegramPage, status, th18 } from './telegram-admin-testing';

describe('TelegramAdminPage', () => {
  let httpMock: HttpTestingController;

  async function render(...args: Parameters<typeof renderTelegramPage>) {
    const rendered = await renderTelegramPage(...args);
    httpMock = rendered.httpMock;
    return rendered;
  }

  afterEach(() => httpMock.verify());

  it('opens on the bot and its channels, then offers the bases and the announcements', async () => {
    const { el } = await render();
    const links = [...el.querySelectorAll('[mat-tab-link]')];
    expect(links.map((l) => l.textContent?.trim())).toEqual(['Bot e canali', 'Basi', 'Annunci']);
    expect(links[0].classList).toContain('mdc-tab--active');
    expect(el.querySelector('crn-telegram-bot')).not.toBeNull();
    expect(el.querySelector('crn-telegram-announcements')).toBeNull();
  });

  it('shows the bases with ?tab=bases', async () => {
    const { el } = await render('bases');
    expect(el.querySelector('crn-telegram-bases')).not.toBeNull();
    expect(el.querySelector('crn-telegram-bot')).toBeNull();
  });

  it('falls back to the bot for an unknown tab', async () => {
    const { el } = await render('nope');
    expect(el.querySelector('crn-telegram-bot')).not.toBeNull();
  });

  it('tells on the announcements tab where they go, with no control to change it', async () => {
    const { el } = await render('announcements');
    const channel = el.querySelector('crn-announcement-channel')!;
    expect(channel.textContent).toContain('Gli annunci escono in');
    expect(channel.querySelector('a')!.getAttribute('href')).toBe(`https://t.me/${news.username}`);
    expect(channel.querySelector('crn-select')).toBeNull();
    expect(el.querySelector('crn-telegram-announcements')).not.toBeNull();
  });

  it('warns when no channel gets the announcements', async () => {
    const { el } = await render('announcements', { ...status, chats: [th18] });
    expect(el.querySelector('crn-announcement-channel')!.textContent).toContain(
      'Nessun canale riceve gli annunci',
    );
  });

  it('says when the bot is not configured', async () => {
    const { el } = await render(undefined, { ...status, configured: false, chats: [] });
    expect(el.textContent).toContain('Il bot non è configurato sul server');
  });
});
