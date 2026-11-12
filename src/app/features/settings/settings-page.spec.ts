import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { AVAILABLE_THEMES, ThemeName, THEMES } from '../../core/theme/themes';
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

  it('hides the theme section when there is a single theme', async () => {
    const { el } = await render();
    expect(el.querySelector('.option--theme')).toBeNull();
    expect(el.querySelector('#settings-theme')).toBeNull();
  });

  it('switches theme, marking the chosen option, when more themes are available', async () => {
    const other = 'other' as ThemeName;
    TestBed.overrideProvider(AVAILABLE_THEMES, {
      useValue: [...THEMES, { name: other, labelKey: 'theme.other', swatch: '#ffffff' }],
    });
    const { fixture, el } = await render();
    const options = Array.from(el.querySelectorAll<HTMLButtonElement>('.option--theme'));
    expect(options.map((o) => o.querySelector('.option__label')?.textContent?.trim())).toEqual(['Scuro', 'theme.other']);

    options[1].click();
    await fixture.whenStable();
    expect(document.documentElement.dataset['theme']).toBe(other);
    expect(options[1].getAttribute('aria-checked')).toBe('true');
    expect(options[0].getAttribute('aria-checked')).toBe('false');
    document.documentElement.dataset['theme'] = 'dark';
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
    expect(el.querySelector('h2')!.textContent).toContain('Language');
    expect(options[1].getAttribute('aria-checked')).toBe('true');
  });
});
