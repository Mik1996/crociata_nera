import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { TRANSLATIONS } from '../../testing/i18n';
import { LanguageService } from './language.service';
import { initialLanguage, LANGUAGE_STORAGE_KEY, LANGUAGES } from './languages';
import { LocalDatePipe, LocalNumberPipe } from './locale-pipes';

/** Flat list of the keys of a dictionary (e.g. `nav.dashboard`). */
function keys(object: object, prefix = ''): string[] {
  return Object.entries(object).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** `{{name}}` placeholders used in a text. */
const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('internationalisation', () => {
  describe('translation files', () => {
    const italian = TRANSLATIONS['it-IT'];
    const italianKeys = keys(italian).sort();

    it.each(LANGUAGES.map((l) => l.code))('%s has exactly the same keys as Italian', (code) => {
      expect(keys(TRANSLATIONS[code]).sort()).toEqual(italianKeys);
    });

    it.each(LANGUAGES.map((l) => l.code))('%s uses the same placeholders and no empty text', (code) => {
      const valueOf = (dict: object, key: string) =>
        key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict) as string;
      for (const key of italianKeys) {
        const text = valueOf(TRANSLATIONS[code], key);
        expect(text.trim(), key).not.toBe('');
        expect(placeholders(text), key).toEqual(placeholders(valueOf(italian, key)));
      }
    });
  });

  describe('initialLanguage', () => {
    it('prefers the saved language', () => {
      expect(initialLanguage('es-ES', ['en-US'])).toBe('es-ES');
    });

    it('uses the browser language, even by prefix only', () => {
      expect(initialLanguage(null, ['fr-FR', 'en-GB'])).toBe('en-US');
      expect(initialLanguage(null, ['es'])).toBe('es-ES');
      expect(initialLanguage('xx', ['it-CH'])).toBe('it-IT');
    });

    it('falls back to Italian', () => {
      expect(initialLanguage(null, ['de-DE', 'fr'])).toBe('it-IT');
    });
  });

  describe('LanguageService', () => {
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY));

    it('switches language, remembers it and updates <html lang>', () => {
      const language = TestBed.inject(LanguageService);
      expect(language.current()).toBe('it-IT');
      expect(language.t('nav.players')).toBe('Giocatori');

      language.use('en-US').subscribe();
      expect(language.current()).toBe('en-US');
      expect(language.currentLanguage().name).toBe('English');
      expect(language.t('nav.players')).toBe('Players');
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en-US');
      expect(document.documentElement.lang).toBe('en');
    });
  });

  describe('number and date pipes', () => {
    @Component({
      imports: [LocalNumberPipe, LocalDatePipe],
      template: `<span class="n">{{ 1234.5 | localNumber: '1.1-1' }}</span><span class="d">{{ '2026-11-05T12:00:00Z' | localDate }}</span>`,
    })
    class Host {}

    it('format according to the current language and update on language change', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const text = (s: string) => el.querySelector(s)!.textContent;
      expect(text('.n')).toBe('1.234,5');
      expect(text('.d')).toBe('05/11/2026');

      TestBed.inject(TranslateService).use('en-US');
      await fixture.whenStable();
      expect(text('.n')).toBe('1,234.5');
      expect(text('.d')).toBe('11/05/2026');
    });
  });
});
