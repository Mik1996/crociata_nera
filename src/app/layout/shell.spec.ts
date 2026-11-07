import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
