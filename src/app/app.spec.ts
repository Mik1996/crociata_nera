import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom, of } from 'rxjs';
import { App } from './app';
import { CocApiService } from './core/api/coc-api';
import { AVAILABLE_THEMES, ThemeName, THEMES } from './core/theme/themes';
import { provideCocApiTest } from './testing/fixtures';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideCocApiTest()],
    }).compileComponents();
  });

  it('shows the clan name in the header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.brand__name')?.textContent).toContain('Crociata Nera');
    expect(el.querySelector('mat-toolbar')?.textContent).toContain('#TEST');
  });

  it('shows the clan badge returned by the API in the header', async () => {
    const api = TestBed.inject(CocApiService);
    const clan = await firstValueFrom(api.getClan());
    const url = 'https://api-assets.clashofclans.com/badges/512/test.png';
    vi.spyOn(api, 'getClan').mockReturnValue(of({ ...clan, badgeUrl: url }));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLImageElement>('.brand__badge')?.getAttribute('src')).toBe(url);
    expect(el.querySelector('.brand__crest')).toBeNull();
  });

  it('uses the fallback crest when the clan has no badge', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.brand__badge')).toBeNull();
    expect(el.querySelector('.brand__crest')).not.toBeNull();
  });

  it('exposes the main navigation with all sections', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav[aria-label="Navigazione principale"]');
    const items = Array.from(nav?.querySelectorAll('a [matListItemTitle]') ?? []).map((s) => s.textContent?.trim());
    expect(items).toEqual([
      'Benvenuto',
      'Unisciti a noi',
      'Dashboard',
      'Guerra corrente',
      'Lega (CWL)',
      'Raid Weekend',
      'Storico guerre',
      'Giocatori',
      'Statistiche',
    ]);
  });

  it('offers Settings at the bottom of the side navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.sidenav__bottom a')!;
    expect(link.textContent).toContain('Impostazioni');
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('switches language from the header menu, with the flag and name of each language', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const items = () => Array.from(el.querySelectorAll('nav a [matListItemTitle]')).map((s) => s.textContent?.trim());

    el.querySelector<HTMLButtonElement>('button.language')!.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLButtonElement>('.language-menu [mat-menu-item]'));
    expect(options.map((o) => o.querySelector('.language-name')?.textContent?.trim())).toEqual(['Italiano', 'English', 'Español']);
    expect(options.every((o) => o.querySelector('img.flag')?.getAttribute('src')?.startsWith('flags/'))).toBe(true);

    options[1].click();
    await fixture.whenStable();
    expect(items()).toEqual(['Welcome', 'Join us', 'Dashboard', 'Current war', 'League (CWL)', 'Raid Weekend', 'War history', 'Players', 'Statistics']);
    expect(el.querySelector('button.language img')?.getAttribute('src')).toBe('flags/us.svg');
    TestBed.inject(TranslateService).use('it-IT');
    localStorage.clear();
  });

  it('hides the theme picker when there is a single theme', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button.theme-picker')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('switches theme from the header menu when more themes are available', async () => {
    const other = 'other' as ThemeName;
    TestBed.overrideProvider(AVAILABLE_THEMES, {
      useValue: [...THEMES, { name: other, labelKey: 'theme.other', swatch: 'rgb(255, 255, 255)' }],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('button.theme-picker')!.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLButtonElement>('.theme-menu [mat-menu-item]'));
    expect(options.map((o) => o.querySelector('.theme-name')?.textContent?.trim())).toEqual(['Scuro', 'theme.other']);
    expect(options[1].querySelector<HTMLElement>('.swatch')?.style.background).toBe('rgb(255, 255, 255)');

    options[1].click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe(other);
    expect(el.querySelector('button.theme-picker .theme-picker__label')?.textContent?.trim()).toBe('theme.other');
    localStorage.clear();
    document.documentElement.dataset['theme'] = 'dark';
  });

  it('offers a link to skip to the main content', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.skip-link')!.click();
    expect(document.activeElement?.id).toBe('content');
  });
});
