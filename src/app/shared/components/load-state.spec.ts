import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { CLAN_CREST_URL, ClanBadge } from '../../core/api/clan-badge';
import { errorMessage, LoadState } from './load-state';

@Component({
  imports: [LoadState],
  template: `
    <crn-load-state [loading]="loading()" [error]="error()" [empty]="empty()" emptyMessage="Vuoto!" (retry)="retries = retries + 1">
      <p class="content">Dati</p>
    </crn-load-state>
  `,
})
class Host {
  loading = signal(false);
  error = signal<unknown>(undefined);
  empty = signal(false);
  retries = 0;
}

describe('LoadState', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent ?? '';

  it('shows the content when data is available', async () => {
    const f = await create();
    expect(f.nativeElement.querySelector('.content')).not.toBeNull();
  });

  it('shows the spinner while loading', async () => {
    const f = await create();
    f.componentInstance.loading.set(true);
    await f.whenStable();
    expect(f.nativeElement.querySelector('[role="status"] mat-spinner')).not.toBeNull();
    expect(f.nativeElement.querySelector('.content')).toBeNull();
  });

  it('shows the error and allows retrying', async () => {
    const f = await create();
    f.componentInstance.error.set(new Error('Server KO'));
    await f.whenStable();
    expect(f.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(text(f)).toContain('Server KO');
    (f.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(f.componentInstance.retries).toBe(1);
  });

  it('loads again by itself when the network comes back, only in the error state', async () => {
    const f = await create();
    window.dispatchEvent(new Event('online'));
    await f.whenStable();
    expect(f.componentInstance.retries).toBe(0);

    f.componentInstance.error.set(new Error('Offline'));
    await f.whenStable();
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    await f.whenStable();
    expect(f.componentInstance.retries).toBe(1);
  });

    it('shows the empty message with the clan logo when the clan badge is not available', async () => {
    const f = await create();
    f.componentInstance.empty.set(true);
    await f.whenStable();
    expect(text(f)).toContain('Vuoto!');
    const img = f.nativeElement.querySelector('.state--empty img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(CLAN_CREST_URL);
    expect(f.nativeElement.querySelector('.state--empty crn-icon')).toBeNull();
  });

  it('shows the clan badge in the empty state, then the logo, then the icon as they fail', async () => {
    TestBed.overrideProvider(ClanBadge, { useValue: { url: signal('https://cdn.test/badge.png') } });
    const f = await create();
    f.componentInstance.empty.set(true);
    await f.whenStable();
    const img = f.nativeElement.querySelector('.state--empty img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://cdn.test/badge.png');
    expect(f.nativeElement.querySelector('.state--empty crn-icon')).toBeNull();

    img.dispatchEvent(new Event('error'));
    await f.whenStable();
    expect(img.getAttribute('src')).toBe(CLAN_CREST_URL);

    img.dispatchEvent(new Event('error'));
    await f.whenStable();
    expect(f.nativeElement.querySelector('.state--empty img')).toBeNull();
    expect(f.nativeElement.querySelector('.state--empty crn-icon')).not.toBeNull();
  });

  it('errorMessage handles errors of different types', () => {
    const translate = (key: string, params?: object) => `${key}${params ? JSON.stringify(params) : ''}`;
    expect(errorMessage(new Error('x'), translate)).toBe('x');
    expect(errorMessage('text', translate)).toBe('text');
    expect(errorMessage(42, translate)).toBe('status.unexpectedError');
    expect(errorMessage({ i18nKey: 'errors.server', i18nParams: { status: 500 } }, translate)).toBe(
      'errors.server{"status":500}',
    );
  });

  it('translates API errors into the current language', async () => {
    const f = await create();
    f.componentInstance.error.set({ i18nKey: 'errors.tooManyRequests' });
    await f.whenStable();
    expect(text(f)).toContain('Troppe richieste');
    TestBed.inject(TranslateService).use('en-US');
    await f.whenStable();
    expect(text(f)).toContain('Too many requests');
    expect(text(f)).toContain('Retry');
  });
});
