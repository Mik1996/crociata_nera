import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PendingPublications } from '../../../core/backend/pending-publications';
import { news, renderPublishingPage, status, th18 } from './publishing-testing';

describe('PublishingPage', () => {
  let httpMock: HttpTestingController;

  async function render(...args: Parameters<typeof renderPublishingPage>) {
    const rendered = await renderPublishingPage(...args);
    httpMock = rendered.httpMock;
    return rendered;
  }

  afterEach(() => httpMock.verify());

  it('opens on the bases to review, then offers the announcements and the channels', async () => {
    const { el } = await render();
    const links = [...el.querySelectorAll('[mat-tab-link]')];
    const label = (l: Element) =>
      [...l.querySelector('.mdc-tab__text-label')!.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent!.trim())
        .join('');
    expect(links.map(label)).toEqual(['Basi', 'Annunci', 'Canali']);
    expect(links[0].classList).toContain('mdc-tab--active');
    expect(el.querySelector('crn-base-posts')).not.toBeNull();
    expect(el.querySelector('crn-base-moderation')).not.toBeNull();
    expect(el.querySelector('crn-telegram-bot')).toBeNull();
  });

  it('shows on the tabs what waits for a decision', async () => {
    const { el, fixture } = await render('channels');
    TestBed.inject(PendingPublications).counts.set({ bases: 3, announcements: 1 });
    fixture.detectChanges();
    const badges = [...el.querySelectorAll('[mat-tab-link]')].map(
      (l) => l.querySelector('.tabs__badge')?.textContent?.trim() ?? null,
    );
    expect(badges).toEqual(['3', '1', null]);
    expect(el.querySelector('.tabs__badge')!.getAttribute('aria-label')).toBe(
      '3 basi da revisionare',
    );
  });

  it('shows the bot and the channels with ?tab=channels', async () => {
    const { el } = await render('channels');
    expect(el.querySelector('crn-telegram-bot')).not.toBeNull();
    expect(el.querySelector('crn-base-posts')).toBeNull();
    expect(el.querySelector('crn-base-moderation')).toBeNull();
  });

  it('falls back to the bases for an unknown tab', async () => {
    const { el } = await render('nope');
    expect(el.querySelector('crn-base-moderation')).not.toBeNull();
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
    // Nothing goes to Telegram: no posts to show.
    expect(el.querySelector('crn-base-posts')).toBeNull();
  });
});
