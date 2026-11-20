import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, Router } from '@angular/router';
import {
  BaseStatus,
  BaseTelegramState,
  ModeratedBaseProposal,
} from '../../../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../../../testing/fixtures';
import { PendingPublications } from '../../../../core/backend/pending-publications';
import { BaseArsenal } from '../../../bases/base-arsenal';
import { BaseModeration } from './base-moderation';

const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'OK' } });
const proposal = (
  id: string,
  status: BaseStatus,
  extra: Partial<ModeratedBaseProposal> = {},
): ModeratedBaseProposal => ({
  id,
  townHallLevel: 17,
  layoutUrl: `https://link.clashofclans.com/en?action=OpenLayout&id=TH17%3AWB%3A${id}xxxxxxxxx`,
  description: 'Anti dragoni',
  clanCastleTroops: [{ name: 'Golem', count: 1 }],
  image: { key: `key-${id}`, width: 1400, height: 900 },
  createdAt: '2026-11-14T10:00:00Z',
  updatedAt: '2026-11-14T10:00:00Z',
  status,
  submittedAt: '2026-11-14T10:00:00Z',
  author: { id: 'u', username: 'Alice' },
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
  telegram: null,
  ...extra,
});
const list = (items: ModeratedBaseProposal[], counts = { PENDING: 2, APPROVED: 1, REJECTED: 0 }) =>
  ok({ items, counts });

const dialog = () => document.querySelector('mat-dialog-container') as HTMLElement;
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
};

const channel17 = { title: 'Basi TH17', username: 'basi17', canPost: true };
const telegram = (
  channel: BaseTelegramState['channel'],
  post: BaseTelegramState['post'] = null,
): BaseTelegramState => ({ channel, post });
const sentPost = { status: 'sent' as const, error: null, retryAt: null };

describe('BaseModeration', () => {
  let httpMock: HttpTestingController;

  async function render(status?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false }),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(BaseModeration);
    if (status) fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => {
    httpMock.match('/api/v1/welcome');
    httpMock.verify();
  });

  it('lists the waiting proposals with everything needed to review them', async () => {
    const { el, fixture } = await render();
    httpMock
      .expectOne('/api/v1/base-proposals?status=PENDING')
      .flush(list([proposal('p1', 'PENDING'), proposal('p2', 'PENDING', { author: null })]));
    await fixture.whenStable();

    const states = [...el.querySelectorAll('mat-chip-option')].map((t) =>
      t.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(states).toEqual(['In attesa 2', 'Approvate 1', 'Rifiutate 0']);
    const cards = el.querySelectorAll('crn-base-proposal-card');
    expect(cards).toHaveLength(2);
    const card = cards[0];
    expect(card.textContent).toContain('Municipio 17');
    expect(card.textContent).toContain('Base di guerra');
    expect(card.textContent).toContain('Alice');
    expect(card.textContent).toContain('In attesa di approvazione');
    expect(card.textContent).toContain('Anti dragoni');
    expect(card.querySelector('crn-clan-castle-troops')).not.toBeNull();
    expect(card.querySelector('img')!.getAttribute('src')).toBe('/api/v1/base-images/key-p1/thumb');
    expect(card.querySelector<HTMLAnchorElement>('a.open')!.href).toBe(
      proposal('p1', 'PENDING').layoutUrl,
    );
    expect(card.querySelector('.approve')!.textContent).toContain('Approva e pubblica');
    expect(card.querySelector('.reject')!.textContent).toContain('Rifiuta');
    expect(cards[1].textContent).toContain('Utente eliminato');

    // The full screenshot, enlarged.
    card.querySelector<HTMLButtonElement>('button.media')!.click();
    await settle();
    expect(dialog().querySelector('img')!.getAttribute('src')).toBe(
      '/api/v1/base-images/key-p1/full',
    );
  });

  it('approves after confirming: the list and the arsenal are read again', async () => {
    const { el, fixture } = await render();
    httpMock
      .expectOne('/api/v1/base-proposals?status=PENDING')
      .flush(list([proposal('p1', 'PENDING')]));
    await fixture.whenStable();
    const reset = vi.spyOn(TestBed.inject(BaseArsenal), 'reset');
    expect(TestBed.inject(PendingPublications).counts().bases).toBe(2);

    el.querySelector<HTMLButtonElement>('.approve')!.click();
    await settle();
    expect(dialog().textContent).toContain('Approva la base del municipio 17');
    expect(dialog().textContent).toContain('proposta da Alice verrà pubblicata subito');
    dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    const approve = httpMock.expectOne('/api/v1/base-proposals/p1/approve');
    expect(approve.request.method).toBe('POST');
    approve.flush(ok(proposal('p1', 'APPROVED', { reviewedBy: { id: 'a', username: 'Boss' } })));
    await settle();

    httpMock
      .expectOne('/api/v1/base-proposals?status=PENDING')
      .flush(list([], { PENDING: 0, APPROVED: 2, REJECTED: 0 }));
    await fixture.whenStable();
    expect(reset).toHaveBeenCalled();
    // The badge of the account menu follows the list.
    expect(TestBed.inject(PendingPublications).counts().bases).toBe(0);
    expect(document.body.textContent).toContain("Base approvata e pubblicata nell'arsenale");
    expect(el.textContent).toContain('Nessuna proposta da revisionare');
  });

  it('rejects only with a reason, after confirming', async () => {
    const { el, fixture } = await render();
    httpMock
      .expectOne('/api/v1/base-proposals?status=PENDING')
      .flush(list([proposal('p1', 'PENDING')]));
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('.reject')!.click();
    await settle();
    expect(dialog().textContent).toContain('Rifiuta la base del municipio 17');
    const confirm = dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(confirm.disabled).toBe(true);
    const reason = dialog().querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = '  Screenshot tagliato  ';
    reason.dispatchEvent(new Event('input'));
    TestBed.tick();
    expect(confirm.disabled).toBe(false);
    confirm.click();

    const reject = httpMock.expectOne('/api/v1/base-proposals/p1/reject');
    expect(reject.request.body).toEqual({ reason: 'Screenshot tagliato' });
    reject.flush(ok(proposal('p1', 'REJECTED', { rejectionReason: 'Screenshot tagliato' })));
    await settle();
    httpMock.expectOne('/api/v1/base-proposals?status=PENDING').flush(list([]));
    await fixture.whenStable();
    expect(document.body.textContent).toContain('Proposta rifiutata');
  });

  it('shows a conflict when another administrator reviewed the proposal meanwhile', async () => {
    const { el, fixture } = await render();
    httpMock
      .expectOne('/api/v1/base-proposals?status=PENDING')
      .flush(list([proposal('p1', 'PENDING')]));
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.approve')!.click();
    await settle();
    dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    httpMock
      .expectOne('/api/v1/base-proposals/p1/approve')
      .flush(
        { result: null, messages: [{ key: 'ERROR.BASE_PROPOSAL_NOT_PENDING' }] },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    expect(dialog().textContent).toContain('già stata approvata o rifiutata');
  });

  it('shows the history of the rejected proposals with the reason and the reviewer', async () => {
    const { el, fixture } = await render('rejected');
    httpMock.expectOne('/api/v1/base-proposals?status=REJECTED').flush(
      list([
        proposal('p1', 'REJECTED', {
          reviewedBy: { id: 'a', username: 'Boss' },
          reviewedAt: '2026-11-15T10:00:00Z',
          rejectionReason: 'Manca il castello',
        }),
      ]),
    );
    await fixture.whenStable();
    const card = el.querySelector('crn-base-proposal-card')!;
    expect(card.textContent).toContain('Rifiutata da');
    expect(card.textContent).toContain('Boss');
    expect(card.querySelector('crn-rejection-reason')!.textContent).toContain('Manca il castello');
    // History only: no actions.
    expect(card.querySelector('.approve')).toBeNull();
  });

  it('tells where each waiting base goes on Telegram, and links to the channels when none', async () => {
    const { el, fixture } = await render();
    httpMock
      .expectOne('/api/v1/base-proposals?status=PENDING')
      .flush(
        list([
          proposal('p1', 'PENDING', { telegram: telegram(channel17) }),
          proposal('p2', 'PENDING', { townHallLevel: 14, telegram: telegram(null) }),
          proposal('p3', 'PENDING', { telegram: telegram({ ...channel17, canPost: false }) }),
        ]),
      );
    await fixture.whenStable();
    const notes = [...el.querySelectorAll('crn-proposal-telegram')];
    expect(notes).toHaveLength(3);
    expect(notes[0].textContent).toContain('Su Telegram andrà in');
    expect(notes[0].querySelector<HTMLAnchorElement>('.line__channel')!.href).toBe(
      'https://t.me/basi17',
    );
    expect(notes[0].querySelector('.manage')).toBeNull();
    expect(notes[1].textContent).toContain('Nessun canale Telegram per il TH14');
    expect(notes[1].querySelector('.manage')!.textContent).toContain('Gestisci i canali');
    expect(notes[2].textContent).toContain('Non può pubblicare');

    // The approval says it too.
    el.querySelector<HTMLButtonElement>('.approve')!.click();
    await settle();
    expect(dialog().textContent).toContain('Uscirà anche su Telegram, in Basi TH17');
  });

  it('shows how the post of each approved base stands', async () => {
    const { el, fixture } = await render('approved');
    httpMock.expectOne('/api/v1/base-proposals?status=APPROVED').flush(
      list([
        proposal('p1', 'APPROVED', { telegram: telegram(channel17, sentPost) }),
        proposal('p2', 'APPROVED', {
          telegram: telegram(channel17, {
            status: 'failed',
            error: 'Bad Request: wrong file',
            retryAt: '2026-11-20T18:00:00Z',
          }),
        }),
        proposal('p3', 'APPROVED'),
      ]),
    );
    await fixture.whenStable();
    const notes = [...el.querySelectorAll('crn-proposal-telegram')];
    // Without Telegram on the server, no line at all.
    expect(notes).toHaveLength(2);
    expect(notes[0].textContent).toContain('Pubblicata');
    expect(notes[1].textContent).toContain('Non riuscita');
    expect(notes[1].textContent).toContain('Bad Request: wrong file');
    expect(notes[1].querySelector('.manage')).not.toBeNull();
  });

  it('changes state from the chips, keeping the other parameters of the page', async () => {
    const { el, fixture } = await render();
    httpMock.expectOne('/api/v1/base-proposals?status=PENDING').flush(list([]));
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    el.querySelectorAll<HTMLElement>('mat-chip-option')[2].querySelector('button')!.click();
    expect(navigate).toHaveBeenCalledWith([], {
      queryParams: { status: 'rejected' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
});
