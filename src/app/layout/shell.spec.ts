import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSidenav } from '@angular/material/sidenav';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../core/backend/auth.service';
import { provideCocApiTest } from '../testing/fixtures';
import { Shell } from './shell';

describe('Shell', () => {
  it('signed out, offers only the public pages and the settings', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    const fixture = TestBed.createComponent(Shell);
    // The clan request stays pending: render without waiting for stability.
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const items = Array.from(el.querySelectorAll('nav a [matListItemTitle]')).map((s) => s.textContent?.trim());
    expect(items).toEqual(['Benvenuto', 'Unisciti a noi']);
    expect(el.querySelector('.sidenav__bottom a')!.textContent).toContain('Impostazioni');
    expect(el.querySelector('a.account')!.getAttribute('href')).toContain('/sign-in');
  });

  it('tells when the browser is offline', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.offline-banner')).toBeNull();

    window.dispatchEvent(new Event('offline'));
    fixture.detectChanges();
    expect(el.querySelector('.offline-banner')?.textContent).toContain('Sei offline');

    window.dispatchEvent(new Event('online'));
    fixture.detectChanges();
    expect(el.querySelector('.offline-banner')).toBeNull();
  });

    it('closes the floating navigation on a page change, keeps the pinned one open', async () => {
    @Component({ template: '' })
    class Blank {}
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', component: Blank },
          { path: 'b', component: Blank },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideCocApiTest({ useMockApi: false }),
      ],
    });
    localStorage.setItem('cn.navigationPinned', 'false');
    try {
      const fixture = TestBed.createComponent(Shell);
      fixture.detectChanges();
      const sidenav = fixture.debugElement.query(By.directive(MatSidenav)).injector.get(MatSidenav);
      const router = TestBed.inject(Router);

      await sidenav.open();
      await router.navigateByUrl('/a');
      expect(sidenav.opened).toBe(false);

      // Pinned: the navigation stays open.
      fixture.nativeElement.querySelector('.sidenav__pin button').click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(sidenav.opened).toBe(true);
      await router.navigateByUrl('/b');
      expect(sidenav.opened).toBe(true);
    } finally {
      localStorage.removeItem('cn.navigationPinned');
    }
  });

  it('account menu links to the player page of each verified game account, by name', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideCocApiTest({ useMockApi: false })],
    });
    const httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession();
    const players = [
      { tag: '#AAA', verified: true },
      { tag: '#BBB', verified: true },
      { tag: '#OLD', verified: false },
    ];
    httpMock.expectOne('/api/v1/auth/refresh').flush({
      result: {
        accessToken: 'tok',
        accessTokenExpiresAt: '',
        user: { id: '1', email: 'k@c.it', username: 'Knight', roles: ['USER'], players, emailVerified: true, clanAccess: true, createdAt: '' },
      },
      messages: [],
      status: { code: 200, name: 'HTTP_STATUS.OK' },
    });
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    httpMock.expectOne((r) => r.url.endsWith('/players/%23AAA')).flush({ tag: '#AAA', name: 'Ixion' });
    httpMock.expectOne((r) => r.url.endsWith('/players/%23BBB')).flush({}, { status: 500, statusText: 'Error' });
    expect(httpMock.match((r) => r.url.endsWith('/players/%23OLD'))).toEqual([]);

    el.querySelector<HTMLButtonElement>('button.account')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.account-menu__players a'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Ixion', '#BBB']);
    expect(links[0].getAttribute('href')).toBe('/players/%23AAA');
  });
});
