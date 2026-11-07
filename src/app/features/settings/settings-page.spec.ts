import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  afterEach(() => {
    TestBed.inject(TranslateService).use('it-IT');
    localStorage.clear();
  });

  async function render() {
    const fixture = TestBed.createComponent(SettingsPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('switches theme, marking the chosen option', async () => {
    const { fixture, el } = await render();
    const options = Array.from(el.querySelectorAll<HTMLButtonElement>('.option--theme'));
    expect(options.map((o) => o.querySelector('.option__label')?.textContent?.trim())).toEqual(['Chiaro', 'Scuro']);

    options[1].click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(options[1].getAttribute('aria-checked')).toBe('true');
    expect(options[0].getAttribute('aria-checked')).toBe('false');
  });

  it('switches language', async () => {
    const { fixture, el } = await render();
    const options = Array.from(el.querySelectorAll<HTMLButtonElement>('.option--language'));
    expect(options.map((o) => o.querySelector('.option__label')?.textContent?.trim())).toEqual([
      'Italiano',
      'English',
      'Español',
    ]);

    options[1].click();
    await fixture.whenStable();
    expect(el.querySelector('h2')!.textContent).toContain('Theme');
    expect(options[1].getAttribute('aria-checked')).toBe('true');
  });
});
