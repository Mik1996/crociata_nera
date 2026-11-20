import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { Announcement } from '../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../testing/fixtures';
import { AnnouncementsAdminPage, captionLength } from './announcements-admin-page';

const URL_BASE = '/api/v1/admin/announcements';

const month: Announcement = {
  id: 'a1',
  kind: 'month',
  state: 'draft',
  clanTag: '#2J8JVVCLC',
  clanName: 'Crociata Nera',
  subject: '2026-11',
  value: null,
  leagueName: null,
  playerName: null,
  caption: '⚔️ **Crociata Nera · Novembre 2026**',
  captionEdited: false,
  pages: 2,
  error: null,
  interrupted: false,
  createdAt: '2026-12-01T05:00:00Z',
  updatedAt: '2026-12-01T05:00:00Z',
  publishedAt: null,
  postUrl: null,
};
const record: Announcement = {
  ...month,
  id: 'a2',
  kind: 'record',
  state: 'published',
  clanName: 'Crociata Rossa',
  subject: 'warWinStreak',
  value: 57,
  pages: 1,
  publishedAt: '2026-11-20T10:00:00Z',
  postUrl: 'https://t.me/crociata_annunci/41',
};
const ok = <T>(result: T, messages: unknown[] = []) => ({
  result,
  messages,
  status: { code: 200, name: 'HTTP_STATUS.OK' },
});

describe('AnnouncementsAdminPage', () => {
  let httpMock: HttpTestingController;

  async function render(list: Announcement[] = [month, record]) {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: () => 'blob:page',
        revokeObjectURL: () => undefined,
      }),
    );
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
    const fixture = TestBed.createComponent(AnnouncementsAdminPage);
    fixture.detectChanges();
    httpMock.expectOne(URL_BASE).flush(ok(list));
    TestBed.tick();
    for (const a of list.filter((x) => x.state === 'draft')) await flushImages(a);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Answers the requests of the pictures of a draft (pending, they keep the page unstable). */
  async function flushImages(a: Announcement) {
    for (let page = 1; page <= a.pages; page++) {
      const url = `${URL_BASE}/${a.id}/images/${page}`;
      const req = await vi.waitFor(() => {
        TestBed.tick();
        return httpMock.expectOne(url);
      });
      req.flush(new Blob(['jpeg']));
    }
  }

  afterEach(() => {
    httpMock.verify();
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('shows the drafts with their pictures, and the announcements already published', async () => {
    const { el } = await render();
    const draft = el.querySelector('.draft')!;
    expect(draft.textContent).toContain('Crociata Nera · Novembre 2026');
    expect(draft.textContent).toContain('Bozza');
    expect(draft.querySelectorAll('crn-announcement-images img')).toHaveLength(2);
    expect(draft.querySelector('textarea')!.value).toBe(month.caption);

    const published = el.querySelector('.decided__item')!;
    expect(published.textContent).toContain('Crociata Rossa · Serie di vittorie: 57');
    expect(published.textContent).toContain('Pubblicato');
    expect(published.querySelector('a')!.getAttribute('href')).toBe(record.postUrl);
  });

  it('names a promotion with the player and the league in the language of the page', async () => {
    const promotion: Announcement = {
      ...month,
      id: 'a3',
      kind: 'promotion',
      state: 'published',
      subject: '#P',
      value: 105000035,
      leagueName: 'Legend League II',
      playerName: 'Dragone Nero',
    };
    const { el } = await render([promotion]);
    expect(el.querySelector('.decided__item')!.textContent).toContain(
      'Crociata Nera · Dragone Nero sale in Lega Leggende II',
    );
  });

  it('saves a caption written by hand, and restores the automatic one', async () => {
    const { fixture, el } = await render([month]);
    const textarea = el.querySelector('textarea')!;
    textarea.value = '  **Bravi!**  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const save = [...el.querySelectorAll<HTMLButtonElement>('.actions button')].find((b) =>
      b.textContent!.includes('Salva didascalia'),
    )!;
    save.click();
    const req = httpMock.expectOne(`${URL_BASE}/a1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ caption: '**Bravi!**' });
    const edited = {
      ...month,
      caption: '**Bravi!**',
      captionEdited: true,
      updatedAt: '2026-12-01T06:00:00Z',
    };
    req.flush(ok(edited));
    TestBed.tick();
    // New version: the pictures are drawn again.
    await flushImages(edited);
    await fixture.whenStable();
    expect(el.textContent).toContain('Didascalia salvata.');

    [...el.querySelectorAll<HTMLButtonElement>('.actions button')]
      .find((b) => b.textContent!.includes('Ripristina'))!
      .click();
    const reset = httpMock.expectOne(`${URL_BASE}/a1`);
    expect(reset.request.body).toEqual({ caption: null });
    reset.flush(ok(month));
    await flushImages(month);
  });

  it('counts the visible characters and refuses a caption too long', async () => {
    expect(captionLength('**ab** c')).toBe(4);
    const { fixture, el } = await render([month]);
    const textarea = el.querySelector('textarea')!;
    textarea.value = 'x'.repeat(1025);
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('1025 / 1024');
    const save = [...el.querySelectorAll<HTMLButtonElement>('.actions button')].find((b) =>
      b.textContent!.includes('Salva didascalia'),
    )!;
    expect(save.disabled).toBe(true);
  });

  it('publishes after confirmation', async () => {
    const { fixture, el } = await render([month]);
    [...el.querySelectorAll<HTMLButtonElement>('.actions button')]
      .find((b) => b.textContent!.includes('Pubblica'))!
      .click();
    await fixture.whenStable();
    const dialog = document.querySelector('crn-announcement-decision-dialog')!;
    expect(dialog.textContent).toContain('Crociata Nera · Novembre 2026');
    dialog.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    const req = httpMock.expectOne(`${URL_BASE}/a1/publish`);
    expect(req.request.method).toBe('POST');
    req.flush(ok({ ...month, state: 'published', publishedAt: '2026-12-01T07:00:00Z' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Annuncio pubblicato nel canale Telegram.');
    expect(el.querySelector('.draft')).toBeNull();
    expect(el.querySelector('.decided__item')!.textContent).toContain('Pubblicato');
  });
});
