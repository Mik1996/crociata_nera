import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../core/backend/auth.interceptor';
import { AuthService } from '../../core/backend/auth.service';
import { DefenseBase } from '../../core/backend/backend-api.types';
import { provideCocApiTest } from '../../testing/fixtures';
import { BasesPage } from './bases-page';

const ok = <T>(result: T) => ({ result, messages: [], status: { code: 200, name: 'OK' } });
const base = (id: string, townHallLevel: number, description = ''): DefenseBase => ({
  id,
  townHallLevel,
  layoutUrl: `https://link.clashofclans.com/en?action=OpenLayout&id=TH${townHallLevel}%3AHV%3A${id}xxxxxxxx`,
  description,
  clanCastleTroops:
    id === 'a'
      ? [
          { name: 'Golem', count: 1 },
          { name: 'Witch', count: 2 },
        ]
      : [],
  image: { key: `key-${id}`, width: 1400, height: 900 },
  createdAt: '2026-11-12T10:00:00Z',
  updatedAt: '2026-11-12T10:00:00Z',
});

const page = (items: DefenseBase[], nextCursor: string | null = null, townHallLevels = [18, 17]) =>
  ok({ items, nextCursor, townHallLevels });

/** Stand-in for `IntersectionObserver`: the test says when the end of the list comes near. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
  static near(isIntersecting = true): void {
    for (const observer of FakeIntersectionObserver.instances)
      observer.callback([{ isIntersecting }]);
  }
}

/** Elements of the open dialog (rendered in the overlay, outside the component). */
const dialog = () => document.querySelector('mat-dialog-container') as HTMLElement | null;

describe('BasesPage', () => {
  describe('with the backend', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      FakeIntersectionObserver.instances = [];
      vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    });

    async function render(
      roles: string[],
      firstPage = page([base('a', 18, 'Castello: Drago'), base('b', 17)]),
    ) {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'bases', component: BasesPage }]),
          provideHttpClient(withInterceptors([authInterceptor])),
          provideHttpClientTesting(),
          provideCocApiTest({ useMockApi: false }),
          { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        ],
      });
      httpMock = TestBed.inject(HttpTestingController);
      TestBed.inject(AuthService).restoreSession();
      httpMock.expectOne('/api/v1/auth/refresh').flush(
        ok({
          accessToken: 'tok',
          accessTokenExpiresAt: '',
          user: { id: 'u', username: 'Knight', roles, players: [], clanAccess: true },
        }),
      );
      const fixture = TestBed.createComponent(BasesPage);
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/bases').flush(firstPage);
      await fixture.whenStable();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      // The clan badge of the empty state comes from the Clash of Clans proxy: not under test.
      httpMock.match((request) => request.url.startsWith('/api/coc/'));
      httpMock.verify();
    });

    it('shows the bases with their thumbnail, level, notes and "copy base" link', async () => {
      const { el } = await render(['USER']);
      const cards = el.querySelectorAll('.base');
      expect(cards).toHaveLength(2);
      expect(cards[0].querySelector('.base__th')!.textContent).toContain('TH 18');
      expect(cards[0].textContent).toContain('Castello: Drago');
      expect(cards[0].querySelector('img')!.getAttribute('src')).toBe(
        '/api/v1/base-images/key-a/thumb',
      );
      const copy = cards[0].querySelector<HTMLAnchorElement>('a.base__copy')!;
      expect(copy.href).toBe(base('a', 18).layoutUrl);
      expect(copy.textContent).toContain('Copia base');
      // Reinforcements: Golem 30 + 2 Witches 24 out of 55 (TH18).
      const troops = cards[0].querySelector('crn-clan-castle-troops')!;
      expect(troops.textContent).toContain('54/55 spazi');
      expect([...troops.querySelectorAll('.count')].map((c) => c.textContent)).toEqual([
        '×1',
        '×2',
      ]);
      expect(cards[1].querySelector('crn-clan-castle-troops')).toBeNull();
    });

    it('hides the editing buttons from members who are not administrators', async () => {
      const { el } = await render(['USER']);
      expect(el.querySelector('.add')).toBeNull();
      expect(el.querySelector('.base__delete')).toBeNull();
    });

    it('lets administrators add, edit and delete bases', async () => {
      const { el, fixture } = await render(['USER', 'ADMIN']);
      expect(el.querySelector('.add')!.textContent).toContain('Aggiungi base');
      el.querySelector<HTMLButtonElement>('.base__delete')!.click();
      await fixture.whenStable();
      expect(dialog()!.textContent).toContain('La base del municipio 18 verrà eliminata');

      dialog()!.querySelector<HTMLButtonElement>('.danger')!.click();
      const del = httpMock.expectOne('/api/v1/bases/a');
      expect(del.request.method).toBe('DELETE');
      del.flush(ok(null));
      // whenStable() would wait for the reload below: let the dialog close first.
      await new Promise((resolve) => setTimeout(resolve));
      TestBed.tick();
      // The list is read again.
      httpMock.expectOne('/api/v1/bases').flush(page([base('b', 17)], null, [17]));
      await fixture.whenStable();
      expect(el.querySelectorAll('.base')).toHaveLength(1);
      expect(document.body.textContent).toContain('Base eliminata');
    });

    it('filters by town hall through the address (?th=)', async () => {
      // More pages to come: a level cannot be filtered from the bases read so far.
      const { fixture, el } = await render(['USER'], page([base('a', 18), base('b', 17)], 'c1'));
      const chips = el.querySelectorAll('mat-chip-option');
      expect([...chips].map((c) => c.textContent!.trim())).toEqual(['Tutte', 'TH 18', 'TH 17']);

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      chips[2].querySelector<HTMLElement>('[role="option"]')!.click();
      await fixture.whenStable();
      expect(navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ queryParams: { th: 17 } }),
      );

      fixture.componentRef.setInput('th', '17');
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/bases?th=17').flush(page([base('b', 17)], 'c17'));
      await fixture.whenStable();
      expect(el.querySelectorAll('.base')).toHaveLength(1);
      // One level only: no town hall headings.
      expect(el.querySelector('.group__title')).toBeNull();

      // Back to every town hall: the pages already read are shown again, without asking for them.
      fixture.componentRef.setInput('th', undefined);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(el.querySelectorAll('.base')).toHaveLength(2);
    });

    it('filters a level from every base already read, without asking again', async () => {
      const { fixture, el } = await render(['USER']);
      fixture.componentRef.setInput('th', '17');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(
        [...el.querySelectorAll('.base')].map((b) =>
          b.querySelector('.base__th')!.textContent!.trim(),
        ),
      ).toEqual(['TH 17']);
    });

    it('groups the bases by town hall when not filtered', async () => {
      const { el } = await render(['USER'], page([base('a', 18), base('c', 18), base('b', 17)]));
      const groups = el.querySelectorAll('.group');
      expect([...groups].map((g) => g.querySelector('.group__title')!.textContent!.trim())).toEqual(
        ['Municipio 18', 'Municipio 17'],
      );
      expect([...groups].map((g) => g.querySelectorAll('.base').length)).toEqual([2, 1]);
    });

    it('asks for the next page when the end of the list comes near, until the last one', async () => {
      const { el, fixture } = await render(['USER'], page([base('a', 18)], 'c1'));
      expect(el.querySelector('.feed-end__done')).toBeNull();

      // While a page is on its way the application is not stable: tick instead of whenStable().
      FakeIntersectionObserver.near();
      TestBed.tick();
      const next = httpMock.expectOne('/api/v1/bases?cursor=c1');
      // Still near while the page is on its way: not asked twice.
      FakeIntersectionObserver.near();
      TestBed.tick();
      expect(el.querySelector('.feed-end mat-spinner')).not.toBeNull();
      next.flush(page([base('c', 18), base('b', 17)], 'c2'));
      TestBed.tick();
      // The marker is still near (short page): the following page is asked for right away.
      const failing = httpMock.expectOne('/api/v1/bases?cursor=c2');
      failing.flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      // The bases read stay; the error is shown at the end of the list, with a retry button.
      expect(el.querySelectorAll('.base')).toHaveLength(3);
      expect(el.querySelector('.feed-end')!.textContent).toContain(
        'Non è stato possibile caricare altre basi',
      );

      el.querySelector<HTMLButtonElement>('.feed-end button')!.click();
      TestBed.tick();
      httpMock.expectOne('/api/v1/bases?cursor=c2').flush(page([base('d', 16)]));
      await fixture.whenStable();
      expect(el.querySelectorAll('.base')).toHaveLength(4);
      expect(el.querySelector('.feed-end__done')!.textContent).toContain('Hai visto tutte le basi');

      // Last page read: scrolling to the end asks for nothing more (verified in afterEach).
      FakeIntersectionObserver.near(false);
      FakeIntersectionObserver.near();
      await fixture.whenStable();
    });
  });

  describe('with mock data', () => {
    it('shows demo bases and the editing buttons (no sign-in without backend)', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideCocApiTest({ useMockApi: true }),
        ],
      });
      const fixture = TestBed.createComponent(BasesPage);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.base').length).toBeGreaterThan(0);
      expect(el.querySelector('.add')).not.toBeNull();
    });
  });
});
