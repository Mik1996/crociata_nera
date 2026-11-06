import { provideTranslateLoader, provideTranslateService, TranslateLoader, TranslationObject } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import enUS from '../../../public/i18n/en-US.json';
import esES from '../../../public/i18n/es-ES.json';
import itIT from '../../../public/i18n/it-IT.json';

export const TRANSLATIONS: Record<string, TranslationObject> = { 'it-IT': itIT, 'en-US': enUS, 'es-ES': esES };

/** Synchronous loader with the real translation files: in tests the texts are available immediately. */
class TestLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<TranslationObject> {
    return of(TRANSLATIONS[lang] ?? {});
  }
}

/** ngx-translate configured in Italian, for tests (registered in `src/test-providers.ts`). */
export const provideI18nTest = () =>
  provideTranslateService({
    lang: 'it-IT',
    fallbackLang: 'it-IT',
    loader: provideTranslateLoader(TestLoader),
  });
