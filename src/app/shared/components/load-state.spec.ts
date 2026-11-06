import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { errorMessage, LoadState } from './load-state';

@Component({
  imports: [LoadState],
  template: `
    <app-load-state [loading]="loading()" [error]="error()" [empty]="empty()" emptyMessage="Vuoto!" (retry)="retries = retries + 1">
      <p class="content">Dati</p>
    </app-load-state>
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

  it('shows the empty message', async () => {
    const f = await create();
    f.componentInstance.empty.set(true);
    await f.whenStable();
    expect(text(f)).toContain('Vuoto!');
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
